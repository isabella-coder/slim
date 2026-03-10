"""轻量认证服务（小程序销售登录）"""

from datetime import datetime, timedelta
import base64
import hashlib
import hmac
import json
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Sales


_login_failures = {}


def _now() -> datetime:
    return datetime.utcnow()


def _encode_b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("utf-8")


def _decode_b64url(raw: str) -> bytes:
    padding = "=" * ((4 - len(raw) % 4) % 4)
    return base64.urlsafe_b64decode((raw + padding).encode("utf-8"))


def _sign(signing_input: bytes) -> str:
    digest = hmac.new(
        settings.JWT_SECRET_KEY.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()
    return _encode_b64url(digest)


def _create_access_token(payload: dict, expires_minutes: int) -> tuple:
    now = _now()
    expires_at = now + timedelta(minutes=expires_minutes)

    header = {
        "alg": "HS256",
        "typ": "JWT",
    }
    body = {
        **payload,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }

    header_b64 = _encode_b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    body_b64 = _encode_b64url(json.dumps(body, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{body_b64}".encode("utf-8")
    signature_b64 = _sign(signing_input)
    token = f"{header_b64}.{body_b64}.{signature_b64}"
    return token, expires_at


def _decode_access_token(token: str) -> Optional[dict]:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None

        header_b64, body_b64, signature_b64 = parts
        signing_input = f"{header_b64}.{body_b64}".encode("utf-8")
        expected_sig = _sign(signing_input)
        if not hmac.compare_digest(expected_sig, signature_b64):
            return None

        body = json.loads(_decode_b64url(body_b64).decode("utf-8"))
        exp = int(body.get("exp", 0))
        if exp <= int(_now().timestamp()):
            return None
        return body
    except Exception:
        return None


def _attempt_key(sales_id: str, client_ip: str) -> str:
    return f"{sales_id}@{client_ip or 'unknown'}"


def _cleanup_attempts() -> None:
    now = _now()
    to_delete = []
    for key, item in _login_failures.items():
        blocked_until = item.get("blocked_until")
        window_start = item.get("window_start")
        if blocked_until and blocked_until > now:
            continue
        if window_start and (now - window_start) <= timedelta(minutes=settings.MINIPROGRAM_LOGIN_WINDOW_MINUTES):
            continue
        to_delete.append(key)

    for key in to_delete:
        _login_failures.pop(key, None)


def _ensure_not_blocked(sales_id: str, client_ip: str) -> None:
    _cleanup_attempts()
    key = _attempt_key(sales_id, client_ip)
    item = _login_failures.get(key)
    if not item:
        return

    blocked_until = item.get("blocked_until")
    if blocked_until and blocked_until > _now():
        remain = int((blocked_until - _now()).total_seconds() / 60) + 1
        raise ValueError(f"登录失败次数过多，请 {remain} 分钟后再试")


def _record_failed_attempt(sales_id: str, client_ip: str) -> None:
    now = _now()
    key = _attempt_key(sales_id, client_ip)
    item = _login_failures.get(key)

    if not item:
        item = {
            "count": 0,
            "window_start": now,
            "blocked_until": None,
        }

    window_start = item.get("window_start") or now
    if (now - window_start) > timedelta(minutes=settings.MINIPROGRAM_LOGIN_WINDOW_MINUTES):
        item["count"] = 0
        item["window_start"] = now
        item["blocked_until"] = None

    item["count"] = int(item.get("count", 0)) + 1
    if item["count"] >= settings.MINIPROGRAM_LOGIN_MAX_RETRIES:
        item["blocked_until"] = now + timedelta(minutes=settings.MINIPROGRAM_LOGIN_BLOCK_MINUTES)

    _login_failures[key] = item


def _clear_attempts(sales_id: str, client_ip: str) -> None:
    _login_failures.pop(_attempt_key(sales_id, client_ip), None)


def list_active_sales(db: Session):
    sales_list = db.query(Sales).filter(Sales.is_active == True).order_by(Sales.store_code, Sales.sales_id).all()
    return [
        {
            "sales_id": s.sales_id,
            "sales_name": s.sales_name,
            "store_code": s.store_code,
        }
        for s in sales_list
    ]


def login_sales(db: Session, sales_id: str, password: str, client_ip: str = "") -> dict:
    _ensure_not_blocked(sales_id, client_ip)

    expected_password = settings.MINIPROGRAM_SALES_PASSWORD
    if password != expected_password:
        _record_failed_attempt(sales_id, client_ip)
        raise ValueError("账号或密码错误")

    sales = db.query(Sales).filter(Sales.sales_id == sales_id, Sales.is_active == True).first()
    if not sales:
        _record_failed_attempt(sales_id, client_ip)
        raise ValueError("账号不存在或已停用")

    _clear_attempts(sales_id, client_ip)

    profile = {
        "sales_id": sales.sales_id,
        "sales_name": sales.sales_name,
        "store_code": sales.store_code,
    }
    token, expires_at = _create_access_token(
        payload=profile,
        expires_minutes=settings.MINIPROGRAM_TOKEN_EXPIRE_MINUTES,
    )

    return {
        "token": token,
        "expires_at": expires_at.isoformat() + "Z",
        **profile,
    }


def get_profile_by_token(token: str) -> Optional[dict]:
    if not token:
        return None

    payload = _decode_access_token(token)
    if not payload:
        return None

    exp = int(payload.get("exp", 0))
    expires_at = datetime.utcfromtimestamp(exp).isoformat() + "Z" if exp else ""

    return {
        "sales_id": payload["sales_id"],
        "sales_name": payload["sales_name"],
        "store_code": payload["store_code"],
        "expires_at": expires_at,
    }
