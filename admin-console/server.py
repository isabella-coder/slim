#!/usr/bin/env python3
import json
import os
import re
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
DEFAULT_PORT = 8080
DAILY_WORK_BAY_LIMIT = 10
INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN", "").strip()
ENABLE_DB_STORAGE = os.getenv("ENABLE_DB_STORAGE", "0").strip().lower() in ("1", "true", "yes", "on")
POSTGRES_DSN = os.getenv("POSTGRES_DSN", "").strip() or os.getenv("DATABASE_URL", "").strip()
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "127.0.0.1").strip()
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432").strip() or "5432")
POSTGRES_DB = os.getenv("POSTGRES_DB", "slim").strip()
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres").strip()
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "").strip()

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

TOKENS = {}


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
        return db_rows if isinstance(db_rows, list) else []
    source = load_json(ORDERS_FILE, [])
    if isinstance(source, list):
        return [normalize_order_record(item) for item in source if isinstance(item, dict)]
    return []


def save_orders(orders):
    source = orders if isinstance(orders, list) else []
    normalized = [normalize_order_record(item) for item in source if isinstance(item, dict)]
    if ENABLE_DB_STORAGE:
        save_orders_to_db(normalized)
        return
    save_json(ORDERS_FILE, normalized)


def load_users():
    if ENABLE_DB_STORAGE:
        db_rows = load_users_from_db()
        return db_rows if isinstance(db_rows, list) else []
    source = load_json(USERS_FILE, [])
    if isinstance(source, list):
        return source
    return []

def save_users(users):
    source = users if isinstance(users, list) else []
    if ENABLE_DB_STORAGE:
        save_users_to_db(source)
        return
    save_json(USERS_FILE, source)


def load_finance_sync_logs():
    if ENABLE_DB_STORAGE:
        db_rows = load_finance_sync_logs_from_db()
        return db_rows if isinstance(db_rows, list) else []
    source = load_json(FINANCE_SYNC_LOG_FILE, [])
    if isinstance(source, list):
        return source
    return []


def save_finance_sync_logs(logs):
    if ENABLE_DB_STORAGE:
        save_finance_sync_logs_to_db(logs)
        return
    save_json(FINANCE_SYNC_LOG_FILE, logs)


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
                        payload JSONB NOT NULL,
                        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
                    );
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS orders (
                        order_id TEXT PRIMARY KEY,
                        payload JSONB NOT NULL,
                        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
                    );
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS finance_sync_logs (
                        log_id TEXT PRIMARY KEY,
                        payload JSONB NOT NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT NOW()
                    );
                    """
                )

            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM users")
                users_count = cur.fetchone()[0]
            if users_count == 0:
                save_users_to_db(load_json(USERS_FILE, []))

            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM orders")
                orders_count = cur.fetchone()[0]
            if orders_count == 0:
                save_orders_to_db(load_json(ORDERS_FILE, []))

            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM finance_sync_logs")
                logs_count = cur.fetchone()[0]
            if logs_count == 0:
                save_finance_sync_logs_to_db(load_json(FINANCE_SYNC_LOG_FILE, []))

        DB_INIT_ERROR = ""
    except Exception as error:
        DB_INIT_ERROR = str(error)


def load_users_from_db():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT payload FROM users ORDER BY username ASC")
                return [row[0] for row in cur.fetchall() if isinstance(row[0], dict)]
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
                    username = normalize_text(user.get("username"))
                    if not username:
                        continue
                    cur.execute(
                        """
                        INSERT INTO users (username, payload, updated_at)
                        VALUES (%s, %s::jsonb, %s)
                        ON CONFLICT (username)
                        DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
                        """,
                        (username, json.dumps(user, ensure_ascii=False), datetime.now()),
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
                    cur.execute(
                        """
                        INSERT INTO orders (order_id, payload, updated_at)
                        VALUES (%s, %s::jsonb, %s)
                        ON CONFLICT (order_id)
                        DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at
                        """,
                        (order_id, json.dumps(payload, ensure_ascii=False), extract_updated_at_for_db(payload)),
                    )
        return True
    except Exception:
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
    return {
        "username": normalize_text(user.get("username")),
        "name": normalize_text(user.get("name")),
        "role": role,
        "permissions": get_permissions(role),
    }


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


def remove_tokens_for_username(username, exclude_token=""):
    target = normalize_text(username)
    if not target:
        return
    skip = normalize_text(exclude_token)
    remove_keys = []
    for token, user in TOKENS.items():
        if normalize_text(token) == skip:
            continue
        if normalize_text(user.get("username")) == target:
            remove_keys.append(token)
    for token in remove_keys:
        TOKENS.pop(token, None)


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


class AdminHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_get(parsed)
            return
        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_post(parsed)
            return
        self.send_json(404, {"ok": False, "message": "Not Found"})

    def do_PUT(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_put(parsed)
            return
        self.send_json(404, {"ok": False, "message": "Not Found"})

    def do_PATCH(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_patch(parsed)
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

            self.send_json(
                200,
                {
                    "success": True,
                    "items": load_orders(),
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
        if parsed.path == "/api/v1/internal/orders/sync":
            if not require_internal_api_token(self):
                return

            body = self.read_json_body()
            orders = body.get("orders") if isinstance(body, dict) else None
            if not isinstance(orders, list):
                self.send_json(400, {"success": False, "message": "orders 必须是数组", "code": 400})
                return

            save_orders(orders)
            self.send_json(
                200,
                {
                    "success": True,
                    "code": 0,
                    "message": "订单同步成功",
                    "count": len(orders),
                    "updatedAt": now_text(),
                },
            )
            return

        if parsed.path == "/api/v1/internal/work-orders/sync":
            if not require_internal_api_token(self):
                return

            body = self.read_json_body()
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
            save_finance_sync_logs(logs[:1000])

            self.send_json(
                200,
                {
                    "success": True,
                    "code": 0,
                    "message": "财务系统入账成功",
                    "data": {
                        "externalId": external_id,
                        "orderId": order_id,
                        "receivedAt": now_text(),
                    },
                },
            )
            return

        if parsed.path == "/api/login":
            body = self.read_json_body()
            username = normalize_text(body.get("username"))
            password = normalize_text(body.get("password"))
            users = load_users()
            matched = None
            for user in users:
                if normalize_text(user.get("username")) == username and normalize_text(user.get("password")) == password:
                    matched = user
                    break
            if not matched:
                self.send_json(401, {"ok": False, "message": "账号或密码错误"})
                return

            safe_user = sanitize_user(matched)
            token = uuid.uuid4().hex
            TOKENS[token] = safe_user
            self.send_json(200, {"ok": True, "token": token, "user": safe_user})
            return

        user = self.require_auth()
        if not user:
            return

        if parsed.path == "/api/logout":
            token = self.get_token_from_header()
            if token and token in TOKENS:
                TOKENS.pop(token, None)
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
            old_password = normalize_text(target.get("password"))
            if old_password != current_password:
                self.send_json(400, {"ok": False, "message": "当前密码错误"})
                return
            if old_password == new_password:
                self.send_json(400, {"ok": False, "message": "新密码不能与当前密码相同"})
                return

            target["password"] = new_password
            save_users(users)
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

            target["password"] = new_password
            save_users(users)
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
            save_orders(orders)
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
            save_orders(orders)
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
        save_orders(orders)
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
        save_orders(orders)
        self.send_json(200, {"success": True, "code": 0, "item": target})

    def get_token_from_header(self):
        source = normalize_text(self.headers.get("Authorization"))
        if not source.lower().startswith("bearer "):
            return ""
        return normalize_text(source[7:])

    def require_auth(self):
        token = self.get_token_from_header()
        user = TOKENS.get(token)
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
                {"username": "manager", "password": "manager123", "name": "店长", "role": "manager"},
                {"username": "salesa", "password": "sales123", "name": "销售A", "role": "sales"},
                {"username": "salesb", "password": "sales123", "name": "销售B", "role": "sales"},
                {"username": "techa", "password": "tech123", "name": "技师A", "role": "technician"},
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
