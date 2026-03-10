#!/usr/bin/env python3
import hashlib
import hmac
import json
import os
import re
import secrets
import time
import uuid
from datetime import date, datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

try:
    import psycopg
except Exception:
    psycopg = None

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
WEB_DIR = BASE_DIR / "web"
ORDERS_FILE = DATA_DIR / "orders.json"
USERS_FILE = DATA_DIR / "users.json"
FINANCE_SYNC_LOG_FILE = DATA_DIR / "finance-sync-log.json"
IDEMPOTENCY_CACHE_FILE = DATA_DIR / "idempotency-cache.json"
SESSION_CACHE_FILE = DATA_DIR / "session-cache.json"
DEFAULT_PORT = 8080
DAILY_WORK_BAY_LIMIT = 10
INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN", "").strip()
ENABLE_DB_STORAGE = os.getenv("ENABLE_DB_STORAGE", "").strip().lower() in ("1", "true", "yes", "on")
POSTGRES_DSN = os.getenv("POSTGRES_DSN", "").strip() or os.getenv("DATABASE_URL", "").strip()
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "127.0.0.1").strip()
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432").strip() or "5432")
POSTGRES_DB = os.getenv("POSTGRES_DB", "slim").strip()
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres").strip()
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "").strip()
PASSWORD_HASH_ALGO = "pbkdf2_sha256"
try:
    PASSWORD_HASH_ITERATIONS = int(os.getenv("PASSWORD_HASH_ITERATIONS", "260000").strip() or "260000")
except ValueError:
    PASSWORD_HASH_ITERATIONS = 260000
try:
    IDEMPOTENCY_TTL_SECONDS = int(os.getenv("IDEMPOTENCY_TTL_SECONDS", "86400").strip() or "86400")
except ValueError:
    IDEMPOTENCY_TTL_SECONDS = 86400
try:
    IDEMPOTENCY_MAX_RECORDS = int(os.getenv("IDEMPOTENCY_MAX_RECORDS", "10000").strip() or "10000")
except ValueError:
    IDEMPOTENCY_MAX_RECORDS = 10000
try:
    SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", "604800").strip() or "604800")
except ValueError:
    SESSION_TTL_SECONDS = 604800
try:
    SESSION_MAX_RECORDS = int(os.getenv("SESSION_MAX_RECORDS", "5000").strip() or "5000")
except ValueError:
    SESSION_MAX_RECORDS = 5000

DB_INIT_ERROR = ""

ORDER_STATUS_ALIAS = {
    "待确认": "未完工",
    "已确认": "已完工",
    "未完工": "未完工",
    "已完工": "已完工",
    "已取消": "已取消",
}

FOLLOWUP_RULES = [
    {"type": "D7", "label": "7天回访", "days": 7},
    {"type": "D30", "label": "30天回访", "days": 30},
    {"type": "D60", "label": "60天回访", "days": 60},
    {"type": "D180", "label": "180天回访", "days": 180},
]

ROLE_PERMISSIONS = {
    "manager": {
        "canViewAll": True,
        "canViewMine": True,
        "canEditAll": True,
    },
    "sales": {
        "canViewAll": True,
        "canViewMine": True,
        "canEditAll": False,
    },
    "technician": {
        "canViewAll": False,
        "canViewMine": True,
        "canEditAll": False,
    },
    "finance": {
        "canViewAll": True,
        "canViewMine": True,
        "canEditAll": False,
    },
}

def is_password_hash(value):
    text = normalize_text(value)
    if not text.startswith(f"{PASSWORD_HASH_ALGO}$"):
        return False
    parts = text.split("$")
    if len(parts) != 4:
        return False
    if not parts[1].isdigit():
        return False
    return bool(parts[2] and parts[3])


def hash_password(password):
    secret = normalize_text(password)
    if not secret:
        return ""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt.encode("utf-8"), PASSWORD_HASH_ITERATIONS)
    return f"{PASSWORD_HASH_ALGO}${PASSWORD_HASH_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password, stored_secret):
    plain = normalize_text(password)
    stored = normalize_text(stored_secret)
    if not stored:
        return False
    if is_password_hash(stored):
        algo, iterations_text, salt, digest_hex = stored.split("$", 3)
        if algo != PASSWORD_HASH_ALGO:
            return False
        try:
            iterations = int(iterations_text)
        except ValueError:
            return False
        candidate = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt.encode("utf-8"), iterations)
        return hmac.compare_digest(candidate.hex(), digest_hex)
    return plain == stored


def normalize_user_record(user, force_hash=False):
    source = dict(user) if isinstance(user, dict) else {}
    username = normalize_text(source.get("username"))
    name = normalize_text(source.get("name"))
    role = normalize_text(source.get("role")).lower() or "sales"
    password_hash = normalize_text(source.get("passwordHash"))
    legacy_password = normalize_text(source.get("password"))

    if not password_hash and is_password_hash(legacy_password):
        password_hash = legacy_password
        legacy_password = ""

    if force_hash and not password_hash and legacy_password:
        password_hash = hash_password(legacy_password)
        legacy_password = ""

    normalized = {
        **source,
        "username": username,
        "name": name,
        "role": role,
    }
    if password_hash:
        normalized["passwordHash"] = password_hash
        normalized["password"] = ""
    else:
        normalized["passwordHash"] = ""
        normalized["password"] = legacy_password
    return normalized


def extract_user_secret(user):
    source = user if isinstance(user, dict) else {}
    password_hash = normalize_text(source.get("passwordHash"))
    if password_hash:
        return password_hash
    return normalize_text(source.get("password"))


def maybe_upgrade_user_password_hash(user, plain_password):
    if not isinstance(user, dict):
        return False
    if normalize_text(user.get("passwordHash")):
        return False
    legacy_password = normalize_text(user.get("password"))
    if not legacy_password or legacy_password != normalize_text(plain_password):
        return False
    user["passwordHash"] = hash_password(plain_password)
    user["password"] = ""
    return True


def now_text():
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def today_text():
    return date.today().strftime("%Y-%m-%d")


def normalize_text(value):
    return str(value or "").strip()


def normalize_name_list(value):
    if isinstance(value, list):
        return [normalize_text(item) for item in value if normalize_text(item)]

    text = normalize_text(value)
    if not text:
        return []
    return [normalize_text(item) for item in re.split(r"[、/,，\s]+", text) if normalize_text(item)]


def normalize_order_status(value):
    text = normalize_text(value)
    if text in ORDER_STATUS_ALIAS:
        return ORDER_STATUS_ALIAS[text]
    if not text:
        return "未完工"
    return text


def normalize_order_record(order):
    source = order if isinstance(order, dict) else {}
    version = source.get("version")
    try:
        parsed_version = int(version)
    except (TypeError, ValueError):
        parsed_version = 0
    if parsed_version < 0:
        parsed_version = 0
    return {
        **source,
        "status": normalize_order_status(source.get("status")),
        "version": parsed_version,
    }


def normalize_keyword(value):
    return re.sub(r"\s+", "", str(value or "")).lower()


def normalize_date(value):
    text = normalize_text(value)
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text
    parsed = parse_datetime_text(text)
    if parsed:
        return parsed.strftime("%Y-%m-%d")
    return ""


def normalize_time(value):
    text = normalize_text(value)
    if re.fullmatch(r"\d{2}:\d{2}", text):
        return text
    return ""


def parse_datetime_text(text):
    source = normalize_text(text)
    if not source:
        return None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y/%m/%d %H:%M", "%Y/%m/%d"):
        try:
            return datetime.strptime(source, fmt)
        except ValueError:
            continue
    return None


def parse_date_text(text):
    normalized = normalize_date(text)
    if not normalized:
        return None
    return datetime.strptime(normalized, "%Y-%m-%d").date()


def load_json(path, default_value):
    if not path.exists():
        return default_value
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default_value


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_orders():
    if ENABLE_DB_STORAGE:
        db_rows = load_orders_from_db()
        if isinstance(db_rows, list):
            return db_rows
        raise RuntimeError("数据库读取订单失败")
    source = load_json(ORDERS_FILE, [])
    if isinstance(source, list):
        return [normalize_order_record(item) for item in source if isinstance(item, dict)]
    return []


def save_orders(orders):
    source = orders if isinstance(orders, list) else []
    normalized = [normalize_order_record(item) for item in source if isinstance(item, dict)]
    if ENABLE_DB_STORAGE:
        if not save_orders_to_db(normalized):
            raise RuntimeError("数据库写入订单失败")
        return True
    save_json(ORDERS_FILE, normalized)
    return True


def load_users():
    if ENABLE_DB_STORAGE:
        db_rows = load_users_from_db()
        if isinstance(db_rows, list):
            return db_rows
        raise RuntimeError("数据库读取用户失败")
    source = load_json(USERS_FILE, [])
    if isinstance(source, list):
        return [normalize_user_record(item) for item in source if isinstance(item, dict)]
    return []

def save_users(users):
    source = users if isinstance(users, list) else []
    normalized = [normalize_user_record(item, force_hash=True) for item in source if isinstance(item, dict)]
    if ENABLE_DB_STORAGE:
        if not save_users_to_db(normalized):
            raise RuntimeError("数据库写入用户失败")
        return True
    save_json(USERS_FILE, normalized)
    return True


def load_finance_sync_logs():
    if ENABLE_DB_STORAGE:
        db_rows = load_finance_sync_logs_from_db()
        if isinstance(db_rows, list):
            return db_rows
        raise RuntimeError("数据库读取财务同步日志失败")
    source = load_json(FINANCE_SYNC_LOG_FILE, [])
    if isinstance(source, list):
        return source
    return []


def save_finance_sync_logs(logs):
    if ENABLE_DB_STORAGE:
        if not save_finance_sync_logs_to_db(logs):
            raise RuntimeError("数据库写入财务同步日志失败")
        return True
    save_json(FINANCE_SYNC_LOG_FILE, logs)
    return True


def db_enabled():
    return ENABLE_DB_STORAGE and psycopg is not None


def build_db_connection_string():
    if POSTGRES_DSN:
        return POSTGRES_DSN
    return (
        f"host={POSTGRES_HOST} port={POSTGRES_PORT} dbname={POSTGRES_DB} "
        f"user={POSTGRES_USER} password={POSTGRES_PASSWORD}"
    )


def get_db_connection():
    if not db_enabled():
        return None
    return psycopg.connect(build_db_connection_string(), autocommit=True)


def extract_updated_at_for_db(payload):
    if not isinstance(payload, dict):
        return datetime.now()
    dt = parse_datetime_text(payload.get("updatedAt"))
    if dt:
        return dt
    dt = parse_datetime_text(payload.get("createdAt"))
    if dt:
        return dt
    return datetime.now()


def to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_appointment_datetime(order):
    source = order if isinstance(order, dict) else {}
    date_text = normalize_date(source.get("appointmentDate"))
    time_text = normalize_time(source.get("appointmentTime"))
    if date_text and time_text:
        return parse_datetime_text(f"{date_text} {time_text}")
    if date_text:
        return parse_datetime_text(date_text)
    return parse_datetime_text(source.get("appointmentDate"))


def ensure_table_columns(cur, table_name, columns):
    for name, definition in columns:
        cur.execute(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS {name} {definition};")


def filter_orders_by_updated_after(items, updated_after_text):
    source = items if isinstance(items, list) else []
    threshold = parse_datetime_text(updated_after_text)
    if not threshold:
        return source
    return [
        item
        for item in source
        if (parse_datetime_text(item.get("updatedAt") or item.get("createdAt")) or datetime.min) > threshold
    ]


def get_order_version_value(order):
    if not isinstance(order, dict):
        return 0
    try:
        parsed = int(order.get("version") or 0)
    except (TypeError, ValueError):
        parsed = 0
    return max(0, parsed)


def apply_incremental_order_sync(incoming_orders):
    incoming = incoming_orders if isinstance(incoming_orders, list) else []
    existing_orders = load_orders()
    order_map = {}
    for item in existing_orders:
        if not isinstance(item, dict):
            continue
        order_id = normalize_text(item.get("id"))
        if not order_id:
            continue
        order_map[order_id] = normalize_order_record(item)

    accepted_ids = []
    conflicts = []
    for item in incoming:
        if not isinstance(item, dict):
            continue
        candidate = normalize_order_record(item)
        order_id = normalize_text(candidate.get("id"))
        if not order_id:
            continue
        current = order_map.get(order_id)
        incoming_version = get_order_version_value(candidate)
        current_version = get_order_version_value(current)

        if isinstance(current, dict):
            if incoming_version < current_version:
                conflicts.append(
                    {
                        "id": order_id,
                        "code": "ORDER_VERSION_CONFLICT",
                        "reason": "VERSION_TOO_OLD",
                        "incomingVersion": incoming_version,
                        "currentVersion": current_version,
                        "currentItem": current,
                    }
                )
                continue
            if incoming_version == current_version and candidate != normalize_order_record(current):
                conflicts.append(
                    {
                        "id": order_id,
                        "code": "ORDER_VERSION_CONFLICT",
                        "reason": "VERSION_NOT_ADVANCED",
                        "incomingVersion": incoming_version,
                        "currentVersion": current_version,
                        "currentItem": current,
                    }
                )
                continue

        if not normalize_text(candidate.get("createdAt")):
            if isinstance(current, dict):
                candidate["createdAt"] = normalize_text(current.get("createdAt")) or now_text()
            else:
                candidate["createdAt"] = now_text()
        if not normalize_text(candidate.get("updatedAt")):
            candidate["updatedAt"] = now_text()

        order_map[order_id] = candidate
        accepted_ids.append(order_id)

    if accepted_ids:
        next_orders = list(order_map.values())
        next_orders.sort(key=order_sort_key, reverse=True)
        save_orders(next_orders)

    return {
        "acceptedIds": accepted_ids,
        "acceptedCount": len(accepted_ids),
        "conflicts": conflicts,
        "conflictCount": len(conflicts),
    }


def make_idempotency_cache_key(endpoint, idempotency_key):
    return f"{normalize_text(endpoint)}::{normalize_text(idempotency_key)}"


def prune_idempotency_cache(cache):
    now_dt = datetime.now()
    cutoff = now_dt - timedelta(seconds=IDEMPOTENCY_TTL_SECONDS)
    source = cache if isinstance(cache, dict) else {}
    items = []
    for key, value in source.items():
        if not isinstance(value, dict):
            continue
        created_at = parse_datetime_text(value.get("createdAt"))
        if not created_at:
            continue
        if created_at < cutoff:
            continue
        items.append((key, value, created_at))
    items.sort(key=lambda pair: pair[2], reverse=True)
    items = items[:IDEMPOTENCY_MAX_RECORDS]
    return {key: value for key, value, _ in items}


def read_idempotency_cache_local():
    source = load_json(IDEMPOTENCY_CACHE_FILE, {})
    return prune_idempotency_cache(source)


def write_idempotency_cache_local(cache):
    save_json(IDEMPOTENCY_CACHE_FILE, prune_idempotency_cache(cache))


def load_idempotent_response(endpoint, idempotency_key):
    token = normalize_text(idempotency_key)
    if not token:
        return None
    endpoint_key = normalize_text(endpoint)
    storage_key = make_idempotency_cache_key(endpoint_key, token)
    cutoff = datetime.now() - timedelta(seconds=IDEMPOTENCY_TTL_SECONDS)
    if db_enabled():
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT status_code, response_payload, created_at
                        FROM api_idempotency
                        WHERE idempotency_key = %s
                        LIMIT 1
                        """,
                        (storage_key,),
                    )
                    row = cur.fetchone()
                    if not row:
                        return None
                    created_at = row[2]
                    if isinstance(created_at, datetime) and created_at < cutoff:
                        cur.execute(
                            "DELETE FROM api_idempotency WHERE idempotency_key = %s",
                            (storage_key,),
                        )
                        return None
                    payload = row[1] if isinstance(row[1], dict) else {}
                    return {"statusCode": int(row[0] or 200), "payload": payload}
        except Exception:
            return None

    cache = read_idempotency_cache_local()
    record = cache.get(make_idempotency_cache_key(endpoint_key, token))
    if not isinstance(record, dict):
        return None
    payload = record.get("payload")
    if not isinstance(payload, dict):
        return None
    return {
        "statusCode": int(record.get("statusCode") or 200),
        "payload": payload,
    }


def save_idempotent_response(endpoint, idempotency_key, status_code, payload):
    token = normalize_text(idempotency_key)
    endpoint_key = normalize_text(endpoint)
    if not token or not endpoint_key:
        return
    storage_key = make_idempotency_cache_key(endpoint_key, token)
    status_value = int(status_code or 200)
    payload_value = payload if isinstance(payload, dict) else {}
    now_dt = datetime.now()
    if db_enabled():
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO api_idempotency (idempotency_key, endpoint, status_code, response_payload, created_at, updated_at)
                        VALUES (%s, %s, %s, %s::jsonb, %s, %s)
                        ON CONFLICT (idempotency_key)
                        DO UPDATE SET
                            endpoint = EXCLUDED.endpoint,
                            status_code = EXCLUDED.status_code,
                            response_payload = EXCLUDED.response_payload,
                            updated_at = EXCLUDED.updated_at
                        """,
                        (
                            storage_key,
                            endpoint_key,
                            status_value,
                            json.dumps(payload_value, ensure_ascii=False),
                            now_dt,
                            now_dt,
                        ),
                    )
                    cur.execute(
                        "DELETE FROM api_idempotency WHERE updated_at < %s",
                        (now_dt - timedelta(seconds=IDEMPOTENCY_TTL_SECONDS),),
                    )
            return
        except Exception:
            return

    cache = read_idempotency_cache_local()
    cache[make_idempotency_cache_key(endpoint_key, token)] = {
        "statusCode": status_value,
        "payload": payload_value,
        "createdAt": now_text(),
    }
    write_idempotency_cache_local(cache)


def init_database_if_needed():
    global DB_INIT_ERROR
    if not ENABLE_DB_STORAGE:
        return
    if psycopg is None:
        DB_INIT_ERROR = "ENABLE_DB_STORAGE=1 但未安装 psycopg"
        return
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                        username TEXT PRIMARY KEY,
                        name TEXT NOT NULL DEFAULT '',
                        role TEXT NOT NULL DEFAULT 'sales',
                        password_hash TEXT,
                        status TEXT NOT NULL DEFAULT 'active',
                        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
                    );
                    """
                )
                ensure_table_columns(
                    cur,
                    "users",
                    [
                        ("name", "TEXT NOT NULL DEFAULT ''"),
                        ("role", "TEXT NOT NULL DEFAULT 'sales'"),
                        ("password_hash", "TEXT"),
                        ("status", "TEXT NOT NULL DEFAULT 'active'"),
                        ("payload", "JSONB NOT NULL DEFAULT '{}'::jsonb"),
                        ("created_at", "TIMESTAMP NOT NULL DEFAULT NOW()"),
                        ("updated_at", "TIMESTAMP NOT NULL DEFAULT NOW()"),
                    ],
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS orders (
                        order_id TEXT PRIMARY KEY,
                        service_type TEXT NOT NULL DEFAULT 'FILM',
                        status TEXT NOT NULL DEFAULT '未完工',
                        customer_name TEXT NOT NULL DEFAULT '',
                        phone TEXT NOT NULL DEFAULT '',
                        plate_number TEXT NOT NULL DEFAULT '',
                        car_model TEXT NOT NULL DEFAULT '',
                        sales_owner TEXT NOT NULL DEFAULT '',
                        store TEXT NOT NULL DEFAULT '',
                        appointment_time TIMESTAMP,
                        total_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
                        version INTEGER NOT NULL DEFAULT 0,
                        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
                    );
                    """
                )
                ensure_table_columns(
                    cur,
                    "orders",
                    [
                        ("service_type", "TEXT NOT NULL DEFAULT 'FILM'"),
                        ("status", "TEXT NOT NULL DEFAULT '未完工'"),
                        ("customer_name", "TEXT NOT NULL DEFAULT ''"),
                        ("phone", "TEXT NOT NULL DEFAULT ''"),
                        ("plate_number", "TEXT NOT NULL DEFAULT ''"),
                        ("car_model", "TEXT NOT NULL DEFAULT ''"),
                        ("sales_owner", "TEXT NOT NULL DEFAULT ''"),
                        ("store", "TEXT NOT NULL DEFAULT ''"),
                        ("appointment_time", "TIMESTAMP"),
                        ("total_price", "NUMERIC(12, 2) NOT NULL DEFAULT 0"),
                        ("version", "INTEGER NOT NULL DEFAULT 0"),
                        ("payload", "JSONB NOT NULL DEFAULT '{}'::jsonb"),
                        ("created_at", "TIMESTAMP NOT NULL DEFAULT NOW()"),
                        ("updated_at", "TIMESTAMP NOT NULL DEFAULT NOW()"),
                    ],
                )
                cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at DESC);")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_sales_owner ON orders(sales_owner);")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_appointment_time ON orders(appointment_time);")
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS finance_sync_logs (
                        log_id TEXT PRIMARY KEY,
                        order_id TEXT NOT NULL DEFAULT '',
                        event_type TEXT NOT NULL DEFAULT '',
                        service_type TEXT NOT NULL DEFAULT '',
                        result TEXT NOT NULL DEFAULT 'SUCCESS',
                        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
                    );
                    """
                )
                ensure_table_columns(
                    cur,
                    "finance_sync_logs",
                    [
                        ("order_id", "TEXT NOT NULL DEFAULT ''"),
                        ("event_type", "TEXT NOT NULL DEFAULT ''"),
                        ("service_type", "TEXT NOT NULL DEFAULT ''"),
                        ("result", "TEXT NOT NULL DEFAULT 'SUCCESS'"),
                        ("payload", "JSONB NOT NULL DEFAULT '{}'::jsonb"),
                        ("created_at", "TIMESTAMP NOT NULL DEFAULT NOW()"),
                        ("updated_at", "TIMESTAMP NOT NULL DEFAULT NOW()"),
                    ],
                )
                cur.execute("CREATE INDEX IF NOT EXISTS idx_finance_logs_order_id ON finance_sync_logs(order_id);")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_finance_logs_created_at ON finance_sync_logs(created_at DESC);")
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS api_idempotency (
                        idempotency_key TEXT PRIMARY KEY,
                        endpoint TEXT NOT NULL DEFAULT '',
                        status_code INTEGER NOT NULL DEFAULT 200,
                        response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
                    );
                    """
                )
                ensure_table_columns(
                    cur,
                    "api_idempotency",
                    [
                        ("endpoint", "TEXT NOT NULL DEFAULT ''"),
                        ("status_code", "INTEGER NOT NULL DEFAULT 200"),
                        ("response_payload", "JSONB NOT NULL DEFAULT '{}'::jsonb"),
                        ("created_at", "TIMESTAMP NOT NULL DEFAULT NOW()"),
                        ("updated_at", "TIMESTAMP NOT NULL DEFAULT NOW()"),
                    ],
                )
                cur.execute("CREATE INDEX IF NOT EXISTS idx_api_idempotency_endpoint ON api_idempotency(endpoint);")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_api_idempotency_updated_at ON api_idempotency(updated_at DESC);")
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS auth_sessions (
                        session_token TEXT PRIMARY KEY,
                        username TEXT NOT NULL DEFAULT '',
                        user_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                        expires_at TIMESTAMP NOT NULL DEFAULT NOW()
                    );
                    """
                )
                ensure_table_columns(
                    cur,
                    "auth_sessions",
                    [
                        ("username", "TEXT NOT NULL DEFAULT ''"),
                        ("user_payload", "JSONB NOT NULL DEFAULT '{}'::jsonb"),
                        ("created_at", "TIMESTAMP NOT NULL DEFAULT NOW()"),
                        ("updated_at", "TIMESTAMP NOT NULL DEFAULT NOW()"),
                        ("expires_at", "TIMESTAMP NOT NULL DEFAULT NOW()"),
                    ],
                )
                cur.execute("CREATE INDEX IF NOT EXISTS idx_auth_sessions_username ON auth_sessions(username);")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);")

            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM users")
                users_count = cur.fetchone()[0]
            if users_count == 0:
                if not save_users_to_db(load_json(USERS_FILE, [])):
                    raise RuntimeError("初始化用户数据失败")

            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM orders")
                orders_count = cur.fetchone()[0]
            if orders_count == 0:
                if not save_orders_to_db(load_json(ORDERS_FILE, [])):
                    raise RuntimeError("初始化订单数据失败")

            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM finance_sync_logs")
                logs_count = cur.fetchone()[0]
            if logs_count == 0:
                if not save_finance_sync_logs_to_db(load_json(FINANCE_SYNC_LOG_FILE, [])):
                    raise RuntimeError("初始化财务日志数据失败")

        DB_INIT_ERROR = ""
    except Exception as error:
        DB_INIT_ERROR = str(error)


def load_users_from_db():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT username, name, role, password_hash, status, payload
                    FROM users
                    ORDER BY username ASC
                    """
                )
                rows = []
                for row in cur.fetchall():
                    payload = row[5] if isinstance(row[5], dict) else {}
                    merged = {
                        **payload,
                        "username": normalize_text(row[0]) or normalize_text(payload.get("username")),
                        "name": normalize_text(row[1]) or normalize_text(payload.get("name")),
                        "role": normalize_text(row[2]) or normalize_text(payload.get("role")),
                        "status": normalize_text(row[4]) or normalize_text(payload.get("status")) or "active",
                    }
                    password_hash = normalize_text(row[3])
                    if password_hash:
                        merged["passwordHash"] = password_hash
                        merged["password"] = ""
                    rows.append(normalize_user_record(merged))
                return rows
    except Exception:
        return None


def save_users_to_db(users):
    if not isinstance(users, list):
        users = []
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                for user in users:
                    if not isinstance(user, dict):
                        continue
                    normalized_user = normalize_user_record(user, force_hash=True)
                    username = normalize_text(normalized_user.get("username"))
                    if not username:
                        continue
                    name = normalize_text(normalized_user.get("name"))
                    role = normalize_text(normalized_user.get("role")).lower() or "sales"
                    status = normalize_text(normalized_user.get("status")) or "active"
                    password_hash = normalize_text(normalized_user.get("passwordHash"))
                    payload = {**normalized_user, "password": ""}
                    cur.execute(
                        """
                        INSERT INTO users (username, name, role, password_hash, status, payload, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s)
                        ON CONFLICT (username)
                        DO UPDATE SET
                            name = EXCLUDED.name,
                            role = EXCLUDED.role,
                            password_hash = EXCLUDED.password_hash,
                            status = EXCLUDED.status,
                            payload = EXCLUDED.payload,
                            updated_at = EXCLUDED.updated_at
                        """,
                        (
                            username,
                            name,
                            role,
                            password_hash,
                            status,
                            json.dumps(payload, ensure_ascii=False),
                            datetime.now(),
                        ),
                    )
        return True
    except Exception:
        return False


def load_orders_from_db(updated_after_text=""):
    updated_after = parse_datetime_text(updated_after_text)
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if updated_after:
                    cur.execute(
                        "SELECT payload FROM orders WHERE updated_at > %s ORDER BY updated_at ASC",
                        (updated_after,),
                    )
                else:
                    cur.execute("SELECT payload FROM orders ORDER BY updated_at DESC")
                return [normalize_order_record(row[0]) for row in cur.fetchall() if isinstance(row[0], dict)]
    except Exception:
        return None


def save_orders_to_db(orders):
    if not isinstance(orders, list):
        orders = []
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                for order in orders:
                    if not isinstance(order, dict):
                        continue
                    order_id = normalize_text(order.get("id"))
                    if not order_id:
                        continue
                    payload = normalize_order_record(order)
                    
                    # Extract key fields for indexed columns
                    service_type = normalize_text(order.get("serviceType")) or "FILM"
                    status = normalize_order_status(order.get("status"))
                    customer_name = normalize_text(order.get("customerName"))
                    phone = normalize_text(order.get("phone"))
                    plate_number = normalize_text(order.get("plateNumber"))
                    car_model = normalize_text(order.get("carModel"))
                    sales_owner = normalize_text(order.get("salesBrandText"))
                    store = normalize_text(order.get("store"))
                    appointment_time = parse_appointment_datetime(order)
                    total_price = to_float(
                        order.get("priceSummary", {}).get("totalPrice") if isinstance(order.get("priceSummary"), dict) else 0,
                        0.0,
                    )
                    version = int(payload.get("version") or 0)
                    created_at = parse_datetime_text(order.get("createdAt")) or datetime.now()
                    updated_at = extract_updated_at_for_db(payload)
                    
                    cur.execute(
                        """
                        INSERT INTO orders (
                            order_id, service_type, status, customer_name, phone, plate_number, 
                            car_model, sales_owner, store, appointment_time, total_price, version, 
                            payload, created_at, updated_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                        ON CONFLICT (order_id)
                        DO UPDATE SET 
                            service_type = EXCLUDED.service_type,
                            status = EXCLUDED.status,
                            customer_name = EXCLUDED.customer_name,
                            phone = EXCLUDED.phone,
                            plate_number = EXCLUDED.plate_number,
                            car_model = EXCLUDED.car_model,
                            sales_owner = EXCLUDED.sales_owner,
                            store = EXCLUDED.store,
                            appointment_time = EXCLUDED.appointment_time,
                            total_price = EXCLUDED.total_price,
                            version = EXCLUDED.version,
                            payload = EXCLUDED.payload,
                            updated_at = EXCLUDED.updated_at
                        """,
                        (
                            order_id, service_type, status, customer_name, phone, plate_number,
                            car_model, sales_owner, store, appointment_time, total_price, version,
                            json.dumps(payload, ensure_ascii=False), created_at, updated_at
                        ),
                    )
        return True
    except Exception as e:
        print(f"Error saving orders to DB: {e}")
        return False


def save_order_to_db(order):
    return save_orders_to_db([order])


def load_finance_sync_logs_from_db():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT payload FROM finance_sync_logs ORDER BY created_at DESC")
                return [row[0] for row in cur.fetchall() if isinstance(row[0], dict)]
    except Exception:
        return None


def save_finance_sync_logs_to_db(logs):
    if not isinstance(logs, list):
        logs = []
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                for item in logs:
                    if not isinstance(item, dict):
                        continue
                    log_id = normalize_text(item.get("id")) or uuid.uuid4().hex
                    payload = {**item, "id": log_id}
                    created_at = parse_datetime_text(payload.get("receivedAt")) or datetime.now()
                    cur.execute(
                        """
                        INSERT INTO finance_sync_logs (log_id, payload, created_at)
                        VALUES (%s, %s::jsonb, %s)
                        ON CONFLICT (log_id)
                        DO UPDATE SET payload = EXCLUDED.payload
                        """,
                        (log_id, json.dumps(payload, ensure_ascii=False), created_at),
                    )
        return True
    except Exception:
        return False


def build_finance_external_id(order_id):
    suffix = normalize_text(order_id)[-8:] or uuid.uuid4().hex[:8].upper()
    return f"FIN-{today_text().replace('-', '')}-{suffix}"


def sanitize_user(user):
    if not isinstance(user, dict):
        return {}
    role = normalize_text(user.get("role")).lower() or "sales"
    result = {
        "username": normalize_text(user.get("username")),
        "name": normalize_text(user.get("name")),
        "role": role,
        "permissions": get_permissions(role),
    }
    store = normalize_text(user.get("store"))
    if store:
        result["store"] = store
    return result


def get_permissions(role):
    role_key = normalize_text(role).lower()
    return ROLE_PERMISSIONS.get(
        role_key,
        {"canViewAll": False, "canViewMine": True, "canEditAll": False},
    )


def is_manager_user(user):
    return normalize_text(user.get("role")).lower() == "manager"


def find_user_by_username(users, username):
    target = normalize_text(username)
    if not target:
        return None
    for user in users if isinstance(users, list) else []:
        if not isinstance(user, dict):
            continue
        if normalize_text(user.get("username")) == target:
            return user
    return None


def is_valid_password(password):
    text = normalize_text(password)
    return len(text) >= 4


def build_session_record(user):
    safe_user = sanitize_user(user if isinstance(user, dict) else {})
    now_ts = int(time.time())
    return {
        "username": normalize_text(safe_user.get("username")),
        "user": safe_user,
        "createdAt": now_ts,
        "updatedAt": now_ts,
        "expiresAt": now_ts + SESSION_TTL_SECONDS,
    }


def prune_local_sessions(cache):
    source = cache if isinstance(cache, dict) else {}
    now_ts = int(time.time())
    items = []
    for token, record in source.items():
        token_text = normalize_text(token)
        if not token_text or not isinstance(record, dict):
            continue
        try:
            expires_at = int(record.get("expiresAt") or 0)
        except (TypeError, ValueError):
            continue
        if expires_at <= now_ts:
            continue
        safe_user = sanitize_user(record.get("user"))
        if not normalize_text(safe_user.get("username")):
            continue
        try:
            updated_at = int(record.get("updatedAt") or record.get("createdAt") or now_ts)
        except (TypeError, ValueError):
            updated_at = now_ts
        try:
            created_at = int(record.get("createdAt") or updated_at)
        except (TypeError, ValueError):
            created_at = updated_at
        items.append(
            (
                token_text,
                {
                    "username": normalize_text(record.get("username")) or normalize_text(safe_user.get("username")),
                    "user": safe_user,
                    "createdAt": created_at,
                    "updatedAt": updated_at,
                    "expiresAt": expires_at,
                },
                updated_at,
            )
        )
    items.sort(key=lambda pair: pair[2], reverse=True)
    items = items[:SESSION_MAX_RECORDS]
    return {token: record for token, record, _ in items}


def load_local_sessions():
    source = load_json(SESSION_CACHE_FILE, {})
    return prune_local_sessions(source)


def save_local_sessions(cache):
    save_json(SESSION_CACHE_FILE, prune_local_sessions(cache))


def persist_session(token, record):
    token_text = normalize_text(token)
    if not token_text or not isinstance(record, dict):
        return False
    session_username = normalize_text(record.get("username"))
    session_user = sanitize_user(record.get("user"))
    if not session_username:
        session_username = normalize_text(session_user.get("username"))
    if not session_username:
        return False

    created_ts = int(record.get("createdAt") or int(time.time()))
    updated_ts = int(record.get("updatedAt") or created_ts)
    expires_ts = int(record.get("expiresAt") or (updated_ts + SESSION_TTL_SECONDS))
    payload = {
        **session_user,
        "username": session_username,
    }

    if db_enabled():
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO auth_sessions (session_token, username, user_payload, created_at, updated_at, expires_at)
                        VALUES (%s, %s, %s::jsonb, %s, %s, %s)
                        ON CONFLICT (session_token)
                        DO UPDATE SET
                            username = EXCLUDED.username,
                            user_payload = EXCLUDED.user_payload,
                            updated_at = EXCLUDED.updated_at,
                            expires_at = EXCLUDED.expires_at
                        """,
                        (
                            token_text,
                            session_username,
                            json.dumps(payload, ensure_ascii=False),
                            datetime.fromtimestamp(created_ts),
                            datetime.fromtimestamp(updated_ts),
                            datetime.fromtimestamp(expires_ts),
                        ),
                    )
                    cur.execute("DELETE FROM auth_sessions WHERE expires_at <= %s", (datetime.now(),))
            return True
        except Exception:
            return False

    cache = load_local_sessions()
    cache[token_text] = {
        "username": session_username,
        "user": payload,
        "createdAt": created_ts,
        "updatedAt": updated_ts,
        "expiresAt": expires_ts,
    }
    save_local_sessions(cache)
    return True


def create_auth_session(user):
    token = uuid.uuid4().hex
    record = build_session_record(user)
    if persist_session(token, record):
        return token
    return ""


def get_auth_session_user(token):
    token_text = normalize_text(token)
    if not token_text:
        return None
    now_ts = int(time.time())
    now_dt = datetime.now()

    if db_enabled():
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT username, user_payload, created_at, updated_at, expires_at
                        FROM auth_sessions
                        WHERE session_token = %s
                        LIMIT 1
                        """,
                        (token_text,),
                    )
                    row = cur.fetchone()
                    if not row:
                        return None
                    expires_at = row[4]
                    if isinstance(expires_at, datetime) and expires_at <= now_dt:
                        cur.execute("DELETE FROM auth_sessions WHERE session_token = %s", (token_text,))
                        return None
                    payload = row[1] if isinstance(row[1], dict) else {}
                    safe_user = sanitize_user({**payload, "username": normalize_text(row[0]) or payload.get("username")})
                    next_expire_dt = now_dt + timedelta(seconds=SESSION_TTL_SECONDS)
                    cur.execute(
                        """
                        UPDATE auth_sessions
                        SET updated_at = %s, expires_at = %s, user_payload = %s::jsonb
                        WHERE session_token = %s
                        """,
                        (
                            now_dt,
                            next_expire_dt,
                            json.dumps(safe_user, ensure_ascii=False),
                            token_text,
                        ),
                    )
                    return safe_user
        except Exception:
            return None

    cache = load_local_sessions()
    record = cache.get(token_text)
    if not isinstance(record, dict):
        return None
    try:
        expires_ts = int(record.get("expiresAt") or 0)
    except (TypeError, ValueError):
        expires_ts = 0
    if expires_ts <= now_ts:
        cache.pop(token_text, None)
        save_local_sessions(cache)
        return None
    safe_user = sanitize_user(record.get("user"))
    if not normalize_text(safe_user.get("username")):
        cache.pop(token_text, None)
        save_local_sessions(cache)
        return None
    record["user"] = safe_user
    record["updatedAt"] = now_ts
    record["expiresAt"] = now_ts + SESSION_TTL_SECONDS
    cache[token_text] = record
    save_local_sessions(cache)
    return safe_user


def delete_auth_session(token):
    token_text = normalize_text(token)
    if not token_text:
        return
    if db_enabled():
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM auth_sessions WHERE session_token = %s", (token_text,))
            return
        except Exception:
            return
    cache = load_local_sessions()
    if token_text in cache:
        cache.pop(token_text, None)
        save_local_sessions(cache)


def remove_auth_sessions_for_username(username, exclude_token=""):
    target = normalize_text(username)
    if not target:
        return
    skip = normalize_text(exclude_token)
    if db_enabled():
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    if skip:
                        cur.execute(
                            "DELETE FROM auth_sessions WHERE username = %s AND session_token <> %s",
                            (target, skip),
                        )
                    else:
                        cur.execute("DELETE FROM auth_sessions WHERE username = %s", (target,))
            return
        except Exception:
            return

    cache = load_local_sessions()
    remove_keys = []
    for token, record in cache.items():
        if normalize_text(token) == skip:
            continue
        session_user = record.get("user") if isinstance(record, dict) else {}
        session_username = normalize_text(record.get("username")) if isinstance(record, dict) else ""
        if session_username == target or normalize_text(session_user.get("username")) == target:
            remove_keys.append(token)
    if remove_keys:
        for token in remove_keys:
            cache.pop(token, None)
        save_local_sessions(cache)


def remove_tokens_for_username(username, exclude_token=""):
    remove_auth_sessions_for_username(username, exclude_token=exclude_token)


def read_internal_api_token_from_headers(handler):
    direct_token = normalize_text(handler.headers.get("X-Api-Token"))
    if direct_token:
        return direct_token
    auth_token = normalize_text(handler.headers.get("Authorization"))
    if auth_token.lower().startswith("bearer "):
        return normalize_text(auth_token[7:])
    return ""


def require_internal_api_token(handler):
    if not INTERNAL_API_TOKEN:
        handler.send_json(503, {"success": False, "message": "内部接口令牌未配置", "code": 503})
        return False

    token = read_internal_api_token_from_headers(handler)
    if token == INTERNAL_API_TOKEN:
        return True

    handler.send_json(401, {"success": False, "message": "内部接口鉴权失败", "code": 401})
    return False


def get_schedule_snapshot(order):
    dispatch = order.get("dispatchInfo")
    dispatch = dispatch if isinstance(dispatch, dict) else {}
    technician_names = normalize_name_list(
        dispatch.get("technicianNames") if isinstance(dispatch.get("technicianNames"), list) and dispatch.get("technicianNames")
        else dispatch.get("technicianName")
    )
    return {
        "date": normalize_date(dispatch.get("date") or order.get("appointmentDate")),
        "time": normalize_time(dispatch.get("time") or order.get("appointmentTime")),
        "workBay": normalize_text(dispatch.get("workBay")),
        "technicianName": technician_names[0] if technician_names else "",
        "technicianNames": technician_names,
    }


def is_order_mine(order, user):
    role = normalize_text(user.get("role")).lower()
    user_name = normalize_keyword(user.get("name"))
    if not user_name:
        return False

    if role == "sales":
        return normalize_keyword(order.get("salesBrandText")) == user_name

    if role == "technician":
        snapshot = get_schedule_snapshot(order)
        if any(normalize_keyword(name) == user_name for name in snapshot.get("technicianNames", [])):
            return True
        records = order.get("workPartRecords")
        if isinstance(records, list):
            for item in records:
                if not isinstance(item, dict):
                    continue
                if normalize_keyword(item.get("technicianName")) == user_name:
                    return True
        return False

    if role in ("manager", "finance"):
        return True

    return False


def scope_orders(orders, user, view):
    permissions = get_permissions(user.get("role"))
    view_key = normalize_text(view).upper() or "ALL"
    if view_key == "MINE":
        if not permissions.get("canViewMine"):
            raise PermissionError("当前账号不支持查看我的订单")
        return [item for item in orders if is_order_mine(item, user)]

    if not permissions.get("canViewAll"):
        raise PermissionError("当前账号无权查看全部订单")

    # 销售用户按门店过滤（只看本店订单）
    role = normalize_text(user.get("role")).lower()
    user_store = normalize_text(user.get("store")).upper()
    if role == "sales" and user_store:
        store_map = {"BOP": "BOP保镖上海工厂店", "LM": "龙膜精英店"}
        store_name = store_map.get(user_store, "")
        if store_name:
            return [item for item in orders if normalize_text(item.get("store")) == store_name]
    return orders


def build_order_stats(orders):
    source = orders if isinstance(orders, list) else []
    return {
        "total": len(source),
        "pending": len([item for item in source if normalize_order_status(item.get("status")) == "未完工"]),
        "confirmed": len([item for item in source if normalize_order_status(item.get("status")) == "已完工"]),
        "cancelled": len([item for item in source if normalize_text(item.get("status")) == "已取消"]),
    }


def order_sort_key(order):
    dt = parse_datetime_text(order.get("createdAt"))
    if dt:
        return dt
    updated = parse_datetime_text(order.get("updatedAt"))
    if updated:
        return updated
    return datetime.min


def order_matches_keyword(order, keyword):
    source = normalize_keyword(keyword)
    if not source:
        return True
    fields = [
        order.get("id"),
        order.get("customerName"),
        order.get("phone"),
        order.get("plateNumber"),
        order.get("carModel"),
        order.get("salesBrandText"),
        order.get("packageLabel"),
    ]
    return any(source in normalize_keyword(item) for item in fields)


def normalize_followup_records(records):
    result = {}
    if not isinstance(records, list):
        return result
    for record in records:
        if not isinstance(record, dict):
            continue
        type_key = normalize_text(record.get("type")).upper()
        if not type_key:
            continue
        result[type_key] = {
            "done": bool(record.get("done")),
            "doneAt": normalize_text(record.get("doneAt")),
            "remark": normalize_text(record.get("remark")),
        }
    return result


def pending_followup_status(due_date, today):
    if today > due_date:
        return "OVERDUE"
    if today == due_date:
        return "DUE_TODAY"
    return "PENDING"


def build_followup_items(order, today):
    if normalize_text(order.get("status")) == "已取消":
        return []
    if normalize_text(order.get("deliveryStatus")) != "交车通过":
        return []

    delivery = parse_datetime_text(order.get("deliveryPassedAt"))
    if not delivery:
        return []

    records = normalize_followup_records(order.get("followupRecords"))
    delivery_date = delivery.date()
    items = []
    for rule in FOLLOWUP_RULES:
        due_date = delivery_date + timedelta(days=rule["days"])
        record = records.get(rule["type"], {})
        done = bool(record.get("done"))
        status = "DONE" if done else pending_followup_status(due_date, today)
        items.append(
            {
                "reminderId": f"{order.get('id')}-{rule['type']}",
                "orderId": order.get("id"),
                "type": rule["type"],
                "label": rule["label"],
                "days": rule["days"],
                "dueDateText": due_date.strftime("%Y-%m-%d"),
                "status": status,
                "done": done,
                "doneAt": record.get("doneAt", ""),
                "remark": record.get("remark", ""),
                "customerName": normalize_text(order.get("customerName")),
                "phone": normalize_text(order.get("phone")),
                "carModel": normalize_text(order.get("carModel")),
                "plateNumber": normalize_text(order.get("plateNumber")),
                "salesOwner": normalize_text(order.get("salesBrandText")),
                "deliveryPassedAt": normalize_text(order.get("deliveryPassedAt")),
            }
        )
    return items


def summarize_followups(items):
    source = items if isinstance(items, list) else []
    return {
        "total": len(source),
        "dueToday": len([item for item in source if item.get("status") == "DUE_TODAY"]),
        "overdue": len([item for item in source if item.get("status") == "OVERDUE"]),
        "pending": len([item for item in source if item.get("status") == "PENDING"]),
        "done": len([item for item in source if item.get("status") == "DONE"]),
    }


def followup_sort_key(item):
    priority_map = {"OVERDUE": 0, "DUE_TODAY": 1, "PENDING": 2, "DONE": 3}
    priority = priority_map.get(item.get("status"), 9)
    due = normalize_text(item.get("dueDateText"))
    order_id = normalize_text(item.get("orderId"))
    type_key = normalize_text(item.get("type"))
    return (priority, due, order_id, type_key)


def build_dispatch_entries(orders, selected_date):
    entries = []
    for order in orders:
        if normalize_text(order.get("status")) == "已取消":
            continue
        snapshot = get_schedule_snapshot(order)
        if snapshot["date"] != selected_date:
            continue
        entries.append(
            {
                "id": order.get("id"),
                "customerName": normalize_text(order.get("customerName")),
                "phone": normalize_text(order.get("phone")),
                "carModel": normalize_text(order.get("carModel")),
                "plateNumber": normalize_text(order.get("plateNumber")),
                "salesOwner": normalize_text(order.get("salesBrandText")),
                "store": normalize_text(order.get("store")),
                "date": snapshot["date"],
                "time": snapshot["time"],
                "workBay": snapshot["workBay"],
                "technicianName": snapshot["technicianName"],
                "technicianNames": snapshot["technicianNames"],
                "assigned": bool(snapshot["workBay"] and len(snapshot["technicianNames"]) > 0),
                "conflicts": [],
            }
        )

    bay_map = {}
    technician_map = {}
    for index, item in enumerate(entries):
        if item["time"] and item["workBay"]:
            bay_key = f"{item['time']}::{item['workBay']}"
            bay_map.setdefault(bay_key, []).append(index)
        if item["time"] and item["technicianNames"]:
            for name in item["technicianNames"]:
                tech_key = f"{item['time']}::{name}"
                technician_map.setdefault(tech_key, []).append(index)

    for indexes in bay_map.values():
        if len(indexes) <= 1:
            continue
        for idx in indexes:
            entries[idx]["conflicts"].append("工位冲突")

    for indexes in technician_map.values():
        if len(indexes) <= 1:
            continue
        for idx in indexes:
            entries[idx]["conflicts"].append("技师冲突")

    for item in entries:
        item["conflictText"] = " / ".join(item["conflicts"])
        item["workBayDisplay"] = item["workBay"] or "未分配工位"
        item["technicianDisplay"] = " / ".join(item["technicianNames"]) if item["technicianNames"] else "未分配技师"

    entries.sort(key=lambda x: (normalize_text(x.get("time")) or "99:99", normalize_text(x.get("id"))))
    return entries


def build_dispatch_capacity(entries):
    store_map = {}
    for item in entries:
        store = normalize_text(item.get("store")) or "未填写门店"
        if store not in store_map:
            store_map[store] = {"store": store, "total": 0, "assigned": 0}
        store_map[store]["total"] += 1
        if normalize_text(item.get("workBay")):
            store_map[store]["assigned"] += 1

    result = []
    for store, data in store_map.items():
        assigned = data["assigned"]
        result.append(
            {
                "store": store,
                "assigned": assigned,
                "limit": DAILY_WORK_BAY_LIMIT,
                "remaining": max(0, DAILY_WORK_BAY_LIMIT - assigned),
                "full": assigned >= DAILY_WORK_BAY_LIMIT,
                "total": data["total"],
            }
        )

    result.sort(key=lambda x: x["store"])
    return result


# ─── 线索推送辅助函数 ───

def _build_lead_remark(lead):
    """从线索数据构建备注文本"""
    parts = []
    grade = normalize_text(lead.get("grade"))
    if grade:
        parts.append(f"【{grade}级线索】")
    score = lead.get("gradeScore")
    if score:
        parts.append(f"评分{score}分")
    reasons = lead.get("gradeReasons", [])
    if reasons:
        parts.append(" / ".join(reasons[:3]))
    budget = normalize_text(lead.get("budgetRange"))
    if budget:
        parts.append(f"预算: {budget}")
    summary = normalize_text(lead.get("conversationSummary"))
    if summary:
        # 截取前200字
        parts.append(f"\n--- AI对话摘要 ---\n{summary[:200]}")
    return "\n".join(parts) if parts else ""


def _build_followup_records(suggested_days):
    """根据建议回访天数构建回访记录"""
    if not isinstance(suggested_days, list):
        return []
    day_to_type = {1: "D1", 3: "D3", 7: "D7", 30: "D30", 60: "D60", 180: "D180"}
    records = []
    for d in suggested_days:
        ftype = day_to_type.get(d, f"D{d}")
        records.append({"type": ftype, "done": False, "doneAt": "", "remark": ""})
    return records


class AdminHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Token, Idempotency-Key")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            try:
                self.handle_api_get(parsed)
            except RuntimeError as error:
                self.send_json(500, {"ok": False, "success": False, "message": str(error), "code": 500})
            return
        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            try:
                self.handle_api_post(parsed)
            except RuntimeError as error:
                self.send_json(500, {"ok": False, "success": False, "message": str(error), "code": 500})
            return
        self.send_json(404, {"ok": False, "message": "Not Found"})

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            try:
                self.handle_api_put(parsed)
            except RuntimeError as error:
                self.send_json(500, {"ok": False, "success": False, "message": str(error), "code": 500})
            return
        self.send_json(404, {"ok": False, "message": "Not Found"})

    def do_PATCH(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            try:
                self.handle_api_patch(parsed)
            except RuntimeError as error:
                self.send_json(500, {"ok": False, "success": False, "message": str(error), "code": 500})
            return
        self.send_json(404, {"ok": False, "message": "Not Found"})

    def handle_api_get(self, parsed):
        if parsed.path == "/api/health/db":
            start = time.perf_counter()
            if not ENABLE_DB_STORAGE:
                self.send_json(200, {"ok": True, "dbEnabled": False, "message": "DB storage disabled"})
                return
            if psycopg is None:
                self.send_json(500, {"ok": False, "dbEnabled": True, "message": "psycopg not installed"})
                return
            try:
                with get_db_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT 1")
                        cur.fetchone()
                latency_ms = round((time.perf_counter() - start) * 1000, 2)
                self.send_json(200, {"ok": True, "dbEnabled": True, "latencyMs": latency_ms})
                return
            except Exception as error:
                self.send_json(500, {"ok": False, "dbEnabled": True, "message": str(error)})
                return

        if parsed.path == "/api/health":
            self.send_json(200, {"ok": True, "time": now_text()})
            return

        if parsed.path == "/api/v1/orders":
            if not require_internal_api_token(self):
                return

            params = parse_qs(parsed.query)
            updated_after = normalize_text(get_first(params, "updatedAfter", ""))
            if ENABLE_DB_STORAGE:
                rows = load_orders_from_db(updated_after)
                if rows is None:
                    self.send_json(500, {"success": False, "message": "数据库读取失败", "code": 500})
                    return
                items = rows
            else:
                items = load_orders()
                threshold = parse_datetime_text(updated_after)
                if threshold:
                    items = [
                        item for item in items
                        if (parse_datetime_text(item.get("updatedAt")) or datetime.min) > threshold
                    ]

            self.send_json(200, {"success": True, "code": 0, "items": items, "count": len(items)})
            return

        if parsed.path == "/api/v1/internal/orders":
            if not require_internal_api_token(self):
                return

            params = parse_qs(parsed.query)
            updated_after = normalize_text(get_first(params, "updatedAfter", ""))
            items = filter_orders_by_updated_after(load_orders(), updated_after)
            self.send_json(
                200,
                {
                    "success": True,
                    "items": items,
                    "count": len(items),
                    "updatedAt": now_text(),
                },
            )
            return

        user = self.require_auth()
        if not user:
            return

        if parsed.path == "/api/me":
            self.send_json(200, {"ok": True, "user": user})
            return

        if parsed.path == "/api/users":
            if not is_manager_user(user):
                self.send_json(403, {"ok": False, "message": "仅店长可查看员工列表"})
                return

            users = load_users()
            items = [sanitize_user(item) for item in users if isinstance(item, dict)]
            items = [item for item in items if normalize_text(item.get("username"))]
            items.sort(key=lambda item: (normalize_text(item.get("role")), normalize_text(item.get("name"))))
            self.send_json(200, {"ok": True, "items": items})
            return

        if parsed.path == "/api/orders":
            params = parse_qs(parsed.query)
            view = normalize_text(get_first(params, "view", "ALL")).upper()
            status = normalize_text(get_first(params, "status", "ALL"))
            keyword = normalize_text(get_first(params, "keyword", ""))
            sales_owner = normalize_text(get_first(params, "salesOwner", ""))

            orders = load_orders()
            try:
                scoped = scope_orders(orders, user, view)
            except PermissionError as error:
                self.send_json(403, {"ok": False, "message": str(error)})
                return

            if status and status != "ALL":
                scoped = [item for item in scoped if normalize_text(item.get("status")) == status]

            if sales_owner:
                target = normalize_keyword(sales_owner)
                scoped = [item for item in scoped if normalize_keyword(item.get("salesBrandText")) == target]

            if keyword:
                scoped = [item for item in scoped if order_matches_keyword(item, keyword)]

            scoped.sort(key=order_sort_key, reverse=True)
            self.send_json(
                200,
                {
                    "ok": True,
                    "items": scoped,
                    "stats": build_order_stats(scoped),
                    "meta": {
                        "view": view,
                        "status": status,
                        "keyword": keyword,
                        "salesOwner": sales_owner,
                    },
                },
            )
            return

        if parsed.path == "/api/dispatch":
            params = parse_qs(parsed.query)
            selected_date = normalize_date(get_first(params, "date", today_text())) or today_text()
            view = normalize_text(get_first(params, "view", "ALL")).upper()

            orders = load_orders()
            try:
                scoped = scope_orders(orders, user, view)
            except PermissionError as error:
                self.send_json(403, {"ok": False, "message": str(error)})
                return

            entries = build_dispatch_entries(scoped, selected_date)
            conflict_count = len([item for item in entries if len(item.get("conflicts", [])) > 0])
            assigned = len([item for item in entries if item.get("assigned")])
            self.send_json(
                200,
                {
                    "ok": True,
                    "selectedDate": selected_date,
                    "entries": entries,
                    "capacity": build_dispatch_capacity(entries),
                    "stats": {
                        "total": len(entries),
                        "assigned": assigned,
                        "unassigned": max(0, len(entries) - assigned),
                        "conflict": conflict_count,
                    },
                },
            )
            return

        # ─── 抖音线索列表 ───
        if parsed.path == "/api/leads":
            params = parse_qs(parsed.query)
            grade_filter = normalize_text(get_first(params, "grade", "ALL")).upper()
            status_filter = normalize_text(get_first(params, "status", "ALL")).upper()
            view = normalize_text(get_first(params, "view", "ALL")).upper()

            orders = load_orders()
            try:
                scoped = scope_orders(orders, user, view)
            except PermissionError as error:
                self.send_json(403, {"ok": False, "message": str(error)})
                return

            # 只筛选来自抖音 AI 的线索
            leads = [o for o in scoped if normalize_text(o.get("leadSource")) == "douyin_ai"]

            if grade_filter and grade_filter != "ALL":
                leads = [o for o in leads if normalize_text(o.get("leadGrade")).upper() == grade_filter]

            if status_filter and status_filter != "ALL":
                leads = [o for o in leads if normalize_text(o.get("status")) == ORDER_STATUS_ALIAS.get(status_filter, status_filter)]

            # 按分级排序: S > A > B > C，同级按时间倒序
            grade_order = {"S": 0, "A": 1, "B": 2, "C": 3}
            leads.sort(key=lambda x: (grade_order.get(normalize_text(x.get("leadGrade")).upper(), 9), -(x.get("leadGradeScore") or 0)))

            stats = {"total": len(leads)}
            for g in ("S", "A", "B", "C"):
                stats[g] = len([o for o in leads if normalize_text(o.get("leadGrade")).upper() == g])

            # 兼容老数据：补 leadStatus 默认值
            for o in leads:
                if not o.get("leadStatus"):
                    o["leadStatus"] = "待联系"

            self.send_json(200, {"ok": True, "items": leads, "stats": stats})
            return

        # ─── 线索回访到期提醒 ───
        if parsed.path == "/api/leads/followup-due":
            orders = load_orders()
            try:
                scoped = scope_orders(orders, user, "ALL")
            except PermissionError as error:
                self.send_json(403, {"ok": False, "message": str(error)})
                return

            today = date.today()
            leads = [o for o in scoped if normalize_text(o.get("leadSource")) == "douyin_ai"]
            due_items = []
            for lead in leads:
                records = lead.get("followupRecords")
                if not isinstance(records, list):
                    continue
                created = lead.get("createdAt", "")
                try:
                    base_date = datetime.strptime(created[:10], "%Y-%m-%d").date() if len(created) >= 10 else today
                except (ValueError, TypeError):
                    base_date = today
                for rec in records:
                    if rec.get("done"):
                        continue
                    ftype = rec.get("type", "")
                    try:
                        days = int(ftype.replace("D", ""))
                    except (ValueError, TypeError):
                        continue
                    due_date = base_date + timedelta(days=days)
                    if due_date <= today:
                        due_items.append({
                            "leadId": lead.get("id"),
                            "customerName": lead.get("customerName", ""),
                            "phone": lead.get("phone", ""),
                            "leadGrade": lead.get("leadGrade", ""),
                            "followupType": ftype,
                            "dueDate": due_date.isoformat(),
                            "overdueDays": (today - due_date).days,
                        })
            due_items.sort(key=lambda x: (-x["overdueDays"], x.get("leadGrade", "Z")))
            self.send_json(200, {"ok": True, "items": due_items, "total": len(due_items)})
            return

        if parsed.path == "/api/followups":
            params = parse_qs(parsed.query)
            status = normalize_text(get_first(params, "status", "ALL")).upper()
            view = normalize_text(get_first(params, "view", "ALL")).upper()
            orders = load_orders()

            try:
                scoped = scope_orders(orders, user, view)
            except PermissionError as error:
                self.send_json(403, {"ok": False, "message": str(error)})
                return

            today = date.today()
            items = []
            for order in scoped:
                items.extend(build_followup_items(order, today))

            if status and status != "ALL":
                if status == "PENDING":
                    items = [item for item in items if item.get("status") in ("PENDING", "DUE_TODAY", "OVERDUE")]
                else:
                    items = [item for item in items if item.get("status") == status]

            items.sort(key=followup_sort_key)
            self.send_json(
                200,
                {
                    "ok": True,
                    "items": items,
                    "stats": summarize_followups(items),
                },
            )
            return

        if parsed.path == "/api/finance/sync-logs":
            role = normalize_text(user.get("role")).lower()
            if role not in ("manager", "finance"):
                self.send_json(403, {"ok": False, "message": "仅店长或财务可查看财务日志"})
                return

            params = parse_qs(parsed.query)
            keyword = normalize_text(get_first(params, "keyword", ""))
            event_type = normalize_text(get_first(params, "eventType", "ALL")).upper()
            service_type = normalize_text(get_first(params, "serviceType", "ALL")).upper()
            limit_text = normalize_text(get_first(params, "limit", "200"))
            limit = 200
            if limit_text.isdigit():
                parsed_limit = int(limit_text)
                if parsed_limit > 0:
                    limit = min(parsed_limit, 1000)

            logs = load_finance_sync_logs()
            if keyword:
                source = normalize_keyword(keyword)
                logs = [
                    item
                    for item in logs
                    if source in normalize_keyword(item.get("orderId"))
                    or source in normalize_keyword(item.get("eventType"))
                    or source in normalize_keyword(item.get("serviceType"))
                ]

            if event_type and event_type != "ALL":
                logs = [item for item in logs if normalize_text(item.get("eventType")).upper() == event_type]

            if service_type and service_type != "ALL":
                logs = [item for item in logs if normalize_text(item.get("serviceType")).upper() == service_type]

            logs = logs[:limit]
            normalized_logs = []
            for item in logs:
                entry = dict(item) if isinstance(item, dict) else {}
                result_text = normalize_text(entry.get("result")).upper()
                if not result_text:
                    # Backward compatibility for old logs without result field.
                    result_text = "SUCCESS"
                entry["result"] = result_text
                if not normalize_text(entry.get("externalId")):
                    entry["externalId"] = build_finance_external_id(entry.get("orderId"))
                normalized_logs.append(entry)

            success_count = len([item for item in normalized_logs if normalize_text(item.get("result")) == "SUCCESS"])
            failed_count = len([item for item in normalized_logs if normalize_text(item.get("result")) == "FAILED"])
            total_amount = 0
            for item in normalized_logs:
                try:
                    total_amount += float(item.get("totalPrice") or 0)
                except (TypeError, ValueError):
                    continue

            self.send_json(
                200,
                {
                    "ok": True,
                    "items": normalized_logs,
                    "stats": {
                        "total": len(normalized_logs),
                        "success": success_count,
                        "failed": failed_count,
                        "totalAmount": round(total_amount, 2),
                    },
                },
            )
            return

        self.send_json(404, {"ok": False, "message": "接口不存在"})

    def handle_api_post(self, parsed):
        # ─── 抖音 AI 线索推送（养龙虾系统 → 蔚蓝） ───
        if parsed.path == "/api/v1/internal/leads/push":
            if not require_internal_api_token(self):
                return
            body = self.read_json_body()
            lead = body.get("lead") if isinstance(body, dict) else None
            if not isinstance(lead, dict) or not lead.get("customerName") and not lead.get("carModel"):
                self.send_json(400, {"success": False, "message": "线索数据不完整"})
                return

            lead_id = normalize_text(lead.get("id")) or f"DY{now_text().replace('-','').replace(':','').replace(' ','')[:14]}{uuid.uuid4().hex[:4]}"
            grade = normalize_text(lead.get("grade")) or "C"
            store = normalize_text(lead.get("storeCode")) or "BOP保镖上海工厂店"
            if "BOP" in store.upper():
                store = "BOP保镖上海工厂店"
            elif "LM" in store.upper() or "龙膜" in store:
                store = "龙膜精英店"

            # 构建蔚蓝标准订单对象
            order_obj = {
                "id": lead_id,
                "serviceType": "FILM",
                "status": "未完工",
                "version": 0,
                "customerName": normalize_text(lead.get("customerName")),
                "phone": normalize_text(lead.get("phone")),
                "carModel": normalize_text(lead.get("carModel")),
                "plateNumber": "",
                "sourceChannel": "抖音私信",
                "store": store,
                "salesBrandText": normalize_text(lead.get("assignedSales")),
                "packageLabel": normalize_text(lead.get("serviceType")),
                "packageDesc": "",
                "appointmentDate": "",
                "appointmentTime": "",
                "depositAmount": 0,
                "remark": _build_lead_remark(lead),
                "priceSummary": {"packagePrice": 0, "addOnFee": 0, "totalPrice": 0, "deposit": 0},
                "createdAt": lead.get("createdAt") or now_text(),
                "updatedAt": now_text(),
                # 线索专属字段存入 remark 和自定义字段
                "leadSource": "douyin_ai",
                "leadStatus": "待联系",
                "leadGrade": grade,
                "leadGradeScore": lead.get("gradeScore", 0),
                "leadGradeReasons": lead.get("gradeReasons", []),
                "leadBudgetRange": normalize_text(lead.get("budgetRange")),
                "leadConversationSummary": normalize_text(lead.get("conversationSummary")),
                "leadFollowupPriority": normalize_text(lead.get("followupPriority")),
                "leadSuggestedFollowupDays": lead.get("suggestedFollowupDays", []),
                "leadWechat": normalize_text(lead.get("wechat")),
                "leadPlatform": normalize_text(lead.get("platform")),
                "leadAccountCode": normalize_text(lead.get("accountCode")),
                # 回访：如果是 S/A 级别，自动生成回访计划
                "followupRecords": _build_followup_records(lead.get("suggestedFollowupDays", [])),
                "followupLastUpdatedAt": now_text(),
            }

            # 用 apply_incremental_order_sync 写入（复用已有的存储逻辑）
            try:
                result = apply_incremental_order_sync([order_obj])
            except RuntimeError as error:
                self.send_json(500, {"success": False, "message": str(error)})
                return

            self.send_json(200, {
                "success": True,
                "code": 0,
                "message": f"线索已接收 ({grade}级)",
                "data": {
                    "orderId": lead_id,
                    "grade": grade,
                    "assignedSales": order_obj.get("salesBrandText", ""),
                    "receivedAt": now_text(),
                },
            })
            return

        # ─── 线索状态更新（小程序调用） ───
        if parsed.path == "/api/leads/update-status":
            user = self.require_auth()
            if not user:
                return
            body = self.read_json_body()
            if not isinstance(body, dict):
                self.send_json(400, {"ok": False, "message": "请求体必须是 JSON 对象"})
                return
            lead_id = normalize_text(body.get("id"))
            new_status = normalize_text(body.get("leadStatus"))
            if not lead_id or not new_status:
                self.send_json(400, {"ok": False, "message": "id 和 leadStatus 必填"})
                return
            valid_statuses = {"待联系", "已联系", "已到店", "已成交", "已流失"}
            if new_status not in valid_statuses:
                self.send_json(400, {"ok": False, "message": f"无效状态: {new_status}"})
                return
            orders = load_orders()
            target = None
            for item in orders:
                if normalize_text(item.get("id")) == lead_id:
                    target = item
                    break
            if not target:
                self.send_json(404, {"ok": False, "message": "线索不存在"})
                return
            target["leadStatus"] = new_status
            target["updatedAt"] = now_text()
            target["version"] = int(target.get("version") or 0) + 1
            try:
                save_orders(orders)
            except RuntimeError as error:
                self.send_json(500, {"ok": False, "message": str(error)})
                return
            self.send_json(200, {"ok": True, "leadStatus": new_status})
            return

        if parsed.path == "/api/v1/internal/orders/sync":
            if not require_internal_api_token(self):
                return

            body = self.read_json_body()
            idempotency_key = normalize_text(self.headers.get("Idempotency-Key"))
            if not idempotency_key and isinstance(body, dict):
                idempotency_key = normalize_text(body.get("idempotencyKey"))
            if idempotency_key:
                cached_response = load_idempotent_response(parsed.path, idempotency_key)
                if isinstance(cached_response, dict):
                    self.send_json(
                        int(cached_response.get("statusCode") or 200),
                        cached_response.get("payload") if isinstance(cached_response.get("payload"), dict) else {},
                    )
                    return

            orders = body.get("orders") if isinstance(body, dict) else None
            if not isinstance(orders, list):
                self.send_json(400, {"success": False, "message": "orders 必须是数组", "code": 400})
                return

            try:
                result = apply_incremental_order_sync(orders)
            except RuntimeError as error:
                self.send_json(500, {"success": False, "message": str(error), "code": 500})
                return
            response_payload = {
                "success": True,
                "code": 0,
                "message": "订单增量同步完成",
                "count": len(orders),
                "acceptedCount": result.get("acceptedCount", 0),
                "acceptedIds": result.get("acceptedIds", []),
                "conflictCount": result.get("conflictCount", 0),
                "conflicts": result.get("conflicts", []),
                "updatedAt": now_text(),
            }
            if idempotency_key:
                save_idempotent_response(parsed.path, idempotency_key, 200, response_payload)
            self.send_json(200, response_payload)
            return

        if parsed.path == "/api/v1/internal/work-orders/sync":
            if not require_internal_api_token(self):
                return

            body = self.read_json_body()
            idempotency_key = normalize_text(self.headers.get("Idempotency-Key"))
            if not idempotency_key and isinstance(body, dict):
                idempotency_key = normalize_text(body.get("idempotencyKey"))
            if idempotency_key:
                cached_response = load_idempotent_response(parsed.path, idempotency_key)
                if isinstance(cached_response, dict):
                    self.send_json(
                        int(cached_response.get("statusCode") or 200),
                        cached_response.get("payload") if isinstance(cached_response.get("payload"), dict) else {},
                    )
                    return

            order = body.get("order") if isinstance(body, dict) else {}
            order_id = normalize_text(order.get("id")) if isinstance(order, dict) else ""
            if not order_id:
                self.send_json(400, {"success": False, "message": "缺少订单ID", "code": 400})
                return

            event_type = normalize_text(body.get("eventType")) if isinstance(body, dict) else ""
            source = normalize_text(body.get("source")) if isinstance(body, dict) else ""
            external_id = build_finance_external_id(order_id)

            logs = load_finance_sync_logs()
            logs.insert(
                0,
                {
                    "id": uuid.uuid4().hex,
                    "receivedAt": now_text(),
                    "eventType": event_type,
                    "source": source,
                    "orderId": order_id,
                    "serviceType": normalize_text(order.get("serviceType")) if isinstance(order, dict) else "",
                    "orderStatus": normalize_text(order.get("status")) if isinstance(order, dict) else "",
                    "totalPrice": (
                        order.get("priceSummary", {}).get("totalPrice")
                        if isinstance(order, dict) and isinstance(order.get("priceSummary"), dict)
                        else 0
                    ),
                    "externalId": external_id,
                    "result": "SUCCESS",
                    "payload": body if isinstance(body, dict) else {},
                },
            )
            # Keep recent 1000 records.
            try:
                save_finance_sync_logs(logs[:1000])
            except RuntimeError as error:
                self.send_json(500, {"success": False, "message": str(error), "code": 500})
                return

            response_payload = {
                "success": True,
                "code": 0,
                "message": "财务系统入账成功",
                "data": {
                    "externalId": external_id,
                    "orderId": order_id,
                    "receivedAt": now_text(),
                },
            }
            if idempotency_key:
                save_idempotent_response(parsed.path, idempotency_key, 200, response_payload)
            self.send_json(200, response_payload)
            return

        if parsed.path == "/api/login":
            body = self.read_json_body()
            username = normalize_text(body.get("username"))
            password = normalize_text(body.get("password"))
            users = load_users()
            matched = None
            for user in users:
                if normalize_text(user.get("username")) != username:
                    continue
                if verify_password(password, extract_user_secret(user)):
                    matched = user
                    break
            if not matched:
                self.send_json(401, {"ok": False, "message": "账号或密码错误"})
                return

            if maybe_upgrade_user_password_hash(matched, password):
                try:
                    save_users(users)
                except RuntimeError:
                    pass

            safe_user = sanitize_user(matched)
            token = create_auth_session(safe_user)
            if not token:
                self.send_json(500, {"ok": False, "message": "会话创建失败，请稍后重试"})
                return
            self.send_json(200, {"ok": True, "token": token, "user": safe_user})
            return

        user = self.require_auth()
        if not user:
            return

        if parsed.path == "/api/logout":
            token = self.get_token_from_header()
            delete_auth_session(token)
            self.send_json(200, {"ok": True})
            return

        if parsed.path == "/api/password/change":
            body = self.read_json_body()
            current_password = normalize_text(body.get("currentPassword"))
            new_password = normalize_text(body.get("newPassword"))
            if not current_password or not new_password:
                self.send_json(400, {"ok": False, "message": "请填写当前密码和新密码"})
                return
            if not is_valid_password(new_password):
                self.send_json(400, {"ok": False, "message": "新密码至少 4 位"})
                return

            users = load_users()
            username = normalize_text(user.get("username"))
            target = find_user_by_username(users, username)
            if not target:
                self.send_json(404, {"ok": False, "message": "账号不存在"})
                return
            if not verify_password(current_password, extract_user_secret(target)):
                self.send_json(400, {"ok": False, "message": "当前密码错误"})
                return
            if verify_password(new_password, extract_user_secret(target)):
                self.send_json(400, {"ok": False, "message": "新密码不能与当前密码相同"})
                return

            target["passwordHash"] = hash_password(new_password)
            target["password"] = ""
            try:
                save_users(users)
            except RuntimeError as error:
                self.send_json(500, {"ok": False, "message": str(error)})
                return
            keep_token = self.get_token_from_header()
            remove_tokens_for_username(username, exclude_token=keep_token)
            self.send_json(200, {"ok": True, "message": "密码修改成功"})
            return

        if parsed.path == "/api/users/reset-password":
            if not is_manager_user(user):
                self.send_json(403, {"ok": False, "message": "仅店长可重置密码"})
                return

            body = self.read_json_body()
            username = normalize_text(body.get("username"))
            new_password = normalize_text(body.get("newPassword"))
            if not username or not new_password:
                self.send_json(400, {"ok": False, "message": "请填写账号和新密码"})
                return
            if not is_valid_password(new_password):
                self.send_json(400, {"ok": False, "message": "新密码至少 4 位"})
                return

            users = load_users()
            target = find_user_by_username(users, username)
            if not target:
                self.send_json(404, {"ok": False, "message": "账号不存在"})
                return

            target["passwordHash"] = hash_password(new_password)
            target["password"] = ""
            try:
                save_users(users)
            except RuntimeError as error:
                self.send_json(500, {"ok": False, "message": str(error)})
                return
            current_username = normalize_text(user.get("username"))
            keep_token = self.get_token_from_header() if current_username == username else ""
            remove_tokens_for_username(username, exclude_token=keep_token)
            self.send_json(200, {"ok": True, "message": f"{username} 密码已重置"})
            return

        if parsed.path == "/api/followups/mark-done":
            body = self.read_json_body()
            order_id = normalize_text(body.get("orderId"))
            type_key = normalize_text(body.get("type")).upper()
            remark = normalize_text(body.get("remark"))
            if not order_id or not type_key:
                self.send_json(400, {"ok": False, "message": "缺少 orderId 或 type"})
                return

            orders = load_orders()
            target = None
            for item in orders:
                if normalize_text(item.get("id")) == order_id:
                    target = item
                    break

            if not target:
                self.send_json(404, {"ok": False, "message": "订单不存在"})
                return

            if not can_edit_order(user, target):
                self.send_json(403, {"ok": False, "message": "无权更新该订单"})
                return

            records = target.get("followupRecords")
            records = records if isinstance(records, list) else []
            next_records = []
            replaced = False
            for record in records:
                if not isinstance(record, dict):
                    continue
                if normalize_text(record.get("type")).upper() == type_key:
                    next_records.append(
                        {"type": type_key, "done": True, "doneAt": now_text(), "remark": remark}
                    )
                    replaced = True
                else:
                    next_records.append(record)

            if not replaced:
                next_records.append({"type": type_key, "done": True, "doneAt": now_text(), "remark": remark})

            target["followupRecords"] = next_records
            target["followupLastUpdatedAt"] = now_text()
            target["updatedAt"] = now_text()
            target["version"] = int(target.get("version") or 0) + 1
            try:
                save_orders(orders)
            except RuntimeError as error:
                self.send_json(500, {"ok": False, "message": str(error)})
                return
            self.send_json(200, {"ok": True, "message": "回访已标记完成"})
            return

        if parsed.path == "/api/orders/import":
            if normalize_text(user.get("role")).lower() != "manager":
                self.send_json(403, {"ok": False, "message": "仅店长可导入订单"})
                return
            body = self.read_json_body()
            orders = body.get("orders")
            if not isinstance(orders, list):
                self.send_json(400, {"ok": False, "message": "orders 必须是数组"})
                return
            try:
                save_orders(orders)
            except RuntimeError as error:
                self.send_json(500, {"ok": False, "message": str(error)})
                return
            self.send_json(200, {"ok": True, "message": f"已导入 {len(orders)} 条订单"})
            return

        self.send_json(404, {"ok": False, "message": "接口不存在"})

    def handle_api_put(self, parsed):
        user = self.require_auth()
        if not user:
            return

        match = re.fullmatch(r"/api/orders/([^/]+)", parsed.path)
        if not match:
            self.send_json(404, {"ok": False, "message": "接口不存在"})
            return

        order_id = match.group(1)
        body = self.read_json_body()
        if not isinstance(body, dict):
            self.send_json(400, {"ok": False, "message": "请求体必须是 JSON 对象"})
            return

        orders = load_orders()
        target = None
        for item in orders:
            if normalize_text(item.get("id")) == normalize_text(order_id):
                target = item
                break
        if not target:
            self.send_json(404, {"ok": False, "message": "订单不存在"})
            return

        if not can_edit_order(user, target):
            self.send_json(403, {"ok": False, "message": "无权更新该订单"})
            return

        patch = sanitize_order_patch(body)
        if len(patch) == 0:
            self.send_json(400, {"ok": False, "message": "没有可更新字段"})
            return

        incoming_version = body.get("version")
        try:
            incoming_version = int(incoming_version)
        except (TypeError, ValueError):
            self.send_json(400, {"ok": False, "message": "version 必须是数字"})
            return

        current_version = int(target.get("version") or 0)
        if incoming_version != current_version:
            self.send_json(
                409,
                {
                    "ok": False,
                    "code": "ORDER_VERSION_CONFLICT",
                    "message": "订单已被更新，请刷新后重试",
                    "currentVersion": current_version,
                },
            )
            return

        target.update(patch)
        target["updatedAt"] = now_text()
        target["version"] = current_version + 1
        try:
            save_orders(orders)
        except RuntimeError as error:
            self.send_json(500, {"ok": False, "message": str(error)})
            return
        self.send_json(200, {"ok": True, "item": target})

    def handle_api_patch(self, parsed):
        match = re.fullmatch(r"/api/v1/orders/([^/]+)", parsed.path)
        if not match:
            self.send_json(404, {"success": False, "message": "接口不存在", "code": 404})
            return
        if not require_internal_api_token(self):
            return

        order_id = match.group(1)
        body = self.read_json_body()
        if not isinstance(body, dict):
            self.send_json(400, {"success": False, "message": "请求体必须是 JSON 对象", "code": 400})
            return

        incoming_version = body.get("version")
        try:
            incoming_version = int(incoming_version)
        except (TypeError, ValueError):
            self.send_json(400, {"success": False, "message": "version 必须是数字", "code": 400})
            return

        patch = sanitize_order_patch(body)
        if len(patch) == 0:
            self.send_json(400, {"success": False, "message": "没有可更新字段", "code": 400})
            return

        orders = load_orders()
        target = None
        for item in orders:
            if normalize_text(item.get("id")) == normalize_text(order_id):
                target = item
                break
        if not target:
            self.send_json(404, {"success": False, "message": "订单不存在", "code": 404})
            return

        current_version = int(target.get("version") or 0)
        if incoming_version != current_version:
            self.send_json(
                409,
                {
                    "success": False,
                    "code": "ORDER_VERSION_CONFLICT",
                    "message": "订单已被更新，请刷新后重试",
                    "currentVersion": current_version,
                },
            )
            return

        target.update(patch)
        target["updatedAt"] = now_text()
        target["version"] = current_version + 1
        try:
            save_orders(orders)
        except RuntimeError as error:
            self.send_json(500, {"success": False, "message": str(error), "code": 500})
            return
        self.send_json(200, {"success": True, "code": 0, "item": target})

    def get_token_from_header(self):
        source = normalize_text(self.headers.get("Authorization"))
        if not source.lower().startswith("bearer "):
            return ""
        return normalize_text(source[7:])

    def require_auth(self):
        token = self.get_token_from_header()
        user = get_auth_session_user(token)
        if not user:
            self.send_json(401, {"ok": False, "message": "请先登录"})
            return None
        return user

    def read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        body = self.rfile.read(length) if length > 0 else b"{}"
        if not body:
            return {}
        try:
            return json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def send_json(self, status_code, payload):
        response = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)


def can_edit_order(user, order):
    permissions = get_permissions(user.get("role"))
    if permissions.get("canEditAll"):
        return True
    return is_order_mine(order, user)


def sanitize_order_patch(body):
    allowed_fields = {
        "status",
        "salesBrandText",
        "store",
        "appointmentDate",
        "appointmentTime",
        "dispatchInfo",
        "remark",
        "deliveryStatus",
        "deliveryPassedAt",
        "commissionStatus",
        "commissionTotal",
        "followupRecords",
        "followupLastUpdatedAt",
    }
    patch = {}
    for key in allowed_fields:
        if key in body:
            patch[key] = body[key]
    return patch


def get_first(query, key, fallback=""):
    values = query.get(key)
    if not values:
        return fallback
    return values[0]


def ensure_seed_files():
    if not USERS_FILE.exists():
        save_json(
            USERS_FILE,
            [
                {
                    "username": "manager",
                    "password": "",
                    "passwordHash": "pbkdf2_sha256$260000$manager_seed_2026$e7c1497cdb5acd39d9a267b4023b4bda9504500d7d51792a13c833f86203dc07",
                    "name": "店长",
                    "role": "manager",
                },
                {
                    "username": "salesa",
                    "password": "",
                    "passwordHash": "pbkdf2_sha256$260000$salesa_seed_2026$104c2d347112e22668561ecb1c67ed28af32154cfdd5c9eb32369f62a79d9fa9",
                    "name": "销售A",
                    "role": "sales",
                },
                {
                    "username": "salesb",
                    "password": "",
                    "passwordHash": "pbkdf2_sha256$260000$salesb_seed_2026$ea6f0ea012b3e7870b4330eafd1d79050faab6b15252074ba504775526921efb",
                    "name": "销售B",
                    "role": "sales",
                },
                {
                    "username": "techa",
                    "password": "",
                    "passwordHash": "pbkdf2_sha256$260000$techa_seed_2026$3cdda7390db61b8083a6f0931d6e16618748fcfb2861ac2704b10a1db6efa119",
                    "name": "技师A",
                    "role": "technician",
                },
            ],
        )

    if not ORDERS_FILE.exists():
        save_json(
            ORDERS_FILE,
            [
                {
                    "id": "TM20260304100100123",
                    "status": "未完工",
                    "createdAt": "2026-03-04 10:01",
                    "customerName": "王总",
                    "phone": "13800001234",
                    "carModel": "Tesla Model Y",
                    "plateNumber": "沪A12345",
                    "sourceChannel": "抖音",
                    "salesBrandText": "销售A",
                    "store": "BOP 保镖上海工厂店",
                    "appointmentDate": "2026-03-06",
                    "appointmentTime": "10:00",
                    "packageLabel": "BOP G75",
                    "packageDesc": "整车",
                    "priceSummary": {"totalPrice": 6800},
                    "dispatchInfo": {
                        "date": "2026-03-06",
                        "time": "10:00",
                        "workBay": "1号工位",
                        "technicianName": "技师A",
                        "remark": "",
                        "updatedAt": "2026-03-04 11:00",
                    },
                    "deliveryStatus": "待交车验收",
                    "deliveryPassedAt": "",
                    "followupRecords": [],
                    "workPartRecords": [{"technicianName": "技师A", "partLabel": "前杠机盖"}],
                },
                {
                    "id": "TM20260102103000321",
                    "status": "已完工",
                    "createdAt": "2026-01-02 10:30",
                    "customerName": "李先生",
                    "phone": "13900005678",
                    "carModel": "BMW 5系",
                    "plateNumber": "沪B88990",
                    "sourceChannel": "老客户转介绍",
                    "salesBrandText": "销售B",
                    "store": "龙膜精英店",
                    "appointmentDate": "2026-01-03",
                    "appointmentTime": "09:30",
                    "packageLabel": "龙膜 AIR80 + LATI35",
                    "packageDesc": "前挡+侧后挡",
                    "priceSummary": {"totalPrice": 4960},
                    "dispatchInfo": {
                        "date": "2026-01-03",
                        "time": "09:30",
                        "workBay": "2号工位",
                        "technicianName": "技师A",
                        "remark": "",
                        "updatedAt": "2026-01-02 11:00",
                    },
                    "deliveryStatus": "交车通过",
                    "deliveryPassedAt": "2026-01-05 17:20",
                    "followupRecords": [{"type": "D7", "done": True, "doneAt": "2026-01-12 11:00", "remark": ""}],
                    "workPartRecords": [{"technicianName": "技师A", "partLabel": "左侧面"}],
                },
                {
                    "id": "TM20260301150000777",
                    "status": "未完工",
                    "createdAt": "2026-03-01 15:00",
                    "customerName": "张女士",
                    "phone": "13500003456",
                    "carModel": "Mercedes GLC",
                    "plateNumber": "沪C77661",
                    "sourceChannel": "大众点评",
                    "salesBrandText": "销售A",
                    "store": "BOP 保镖上海工厂店",
                    "appointmentDate": "2026-03-06",
                    "appointmentTime": "10:30",
                    "packageLabel": "BOP 风狂者",
                    "packageDesc": "整车",
                    "priceSummary": {"totalPrice": 9800},
                    "dispatchInfo": {
                        "date": "2026-03-06",
                        "time": "10:30",
                        "workBay": "3号工位",
                        "technicianName": "技师A",
                        "remark": "",
                        "updatedAt": "2026-03-02 09:00",
                    },
                    "deliveryStatus": "待交车验收",
                    "deliveryPassedAt": "",
                    "followupRecords": [],
                    "workPartRecords": [{"technicianName": "技师A", "partLabel": "右侧面"}],
                },
            ],
        )


def run_server(port):
    ensure_seed_files()
    init_database_if_needed()
    server = ThreadingHTTPServer(("0.0.0.0", port), AdminHandler)
    print(f"Admin console running: http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run_server(DEFAULT_PORT)
