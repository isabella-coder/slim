"""经营系统统一服务（认证、订单、线索、内部同步）。"""

from __future__ import annotations

from datetime import date, datetime, timedelta
import hashlib
import hmac
import re
import uuid
from typing import Dict, Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.config import settings
from app.models import StoreAuthSession, StoreOrder, StoreUser
from app.services.auth_service import get_profile_by_token


PASSWORD_HASH_ALGO = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 260000

ORDER_STATUS_ALIAS = {
    "待确认": "未完工",
    "已确认": "已完工",
    "未完工": "未完工",
    "已完工": "已完工",
    "已取消": "已取消",
}

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

STORE_CODE_TO_NAME = {
    "BOP": "BOP保镖上海工厂店",
    "LM": "龙膜精英店",
}

LEAD_STATUSES = {"待联系", "已联系", "已到店", "已成交", "已流失"}


class StoreApiError(Exception):
    def __init__(self, message: str, status_code: int = 400, code: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


def normalize_text(value) -> str:
    return str(value or "").strip()


def normalize_keyword(value) -> str:
    return re.sub(r"\s+", "", normalize_text(value)).lower()


def normalize_role(value: str) -> str:
    role = normalize_text(value).lower()
    return role or "sales"


def normalize_store_code(value: str) -> str:
    return normalize_text(value).upper()


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def parse_datetime_text(value: str) -> Optional[datetime]:
    source = normalize_text(value)
    if not source:
        return None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y/%m/%d %H:%M", "%Y/%m/%d"):
        try:
            return datetime.strptime(source, fmt)
        except ValueError:
            continue
    return None


def normalize_order_status(value: str) -> str:
    text = normalize_text(value)
    if text in ORDER_STATUS_ALIAS:
        return ORDER_STATUS_ALIAS[text]
    return text or "未完工"


def parse_bearer_token(authorization: str = "") -> str:
    source = normalize_text(authorization)
    if not source:
        return ""
    if not source.lower().startswith("bearer "):
        return ""
    return normalize_text(source[7:])


def read_internal_token(authorization: str = "", x_api_token: str = "") -> str:
    header_token = normalize_text(x_api_token)
    if header_token:
        return header_token
    return parse_bearer_token(authorization)


def is_password_hash(value: str) -> bool:
    text = normalize_text(value)
    if not text.startswith(f"{PASSWORD_HASH_ALGO}$"):
        return False
    parts = text.split("$")
    if len(parts) != 4:
        return False
    if not parts[1].isdigit():
        return False
    return bool(parts[2] and parts[3])


def hash_password(password: str, iterations: int = PASSWORD_HASH_ITERATIONS) -> str:
    secret = normalize_text(password)
    if not secret:
        return ""
    salt = uuid.uuid4().hex
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), salt.encode("utf-8"), iterations)
    return f"{PASSWORD_HASH_ALGO}${iterations}${salt}${digest.hex()}"


def verify_password(password: str, stored_secret: str) -> bool:
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


def build_user_profile(user: StoreUser) -> dict:
    return {
        "username": normalize_text(user.username),
        "name": normalize_text(user.name),
        "role": normalize_role(user.role),
        "store": normalize_store_code(user.store_code),
    }


def _get_session_ttl_seconds() -> int:
    minutes = int(getattr(settings, "MINIPROGRAM_TOKEN_EXPIRE_MINUTES", 10080) or 10080)
    return max(60, minutes * 60)


def _cleanup_expired_sessions(db: Session) -> None:
    now = datetime.utcnow()
    db.query(StoreAuthSession).filter(StoreAuthSession.expires_at <= now).delete(synchronize_session=False)


def _find_session_profile(db: Session, token: str) -> Optional[dict]:
    session_token = normalize_text(token)
    if not session_token:
        return None

    row = db.query(StoreAuthSession).filter(StoreAuthSession.session_token == session_token).first()
    if not row:
        return None

    now = datetime.utcnow()
    if row.expires_at <= now:
        db.delete(row)
        db.commit()
        return None

    user = row.user
    if not user or not user.is_active:
        db.delete(row)
        db.commit()
        return None

    profile = build_user_profile(user)
    payload = row.user_payload if isinstance(row.user_payload, dict) else {}
    payload = {
        **payload,
        **profile,
    }

    ttl_seconds = _get_session_ttl_seconds()
    row.user_payload = payload
    row.updated_at = now
    row.expires_at = now + timedelta(seconds=ttl_seconds)
    db.commit()
    return payload


def authenticate_store_user(db: Session, username: str, password: str) -> dict:
    target_username = normalize_text(username)
    secret = normalize_text(password)
    if not target_username or not secret:
        raise StoreApiError("请输入账号和密码", status_code=400)

    user = (
        db.query(StoreUser)
        .filter(StoreUser.username == target_username, StoreUser.is_active == True)
        .first()
    )
    if not user:
        raise StoreApiError("账号不存在或已停用", status_code=401)

    if not verify_password(secret, user.password_hash):
        raise StoreApiError("账号或密码错误", status_code=401)

    # 登录成功后将历史明文密码升级成哈希。
    if user.password_hash and not is_password_hash(user.password_hash):
        user.password_hash = hash_password(secret)
        user.updated_at = datetime.utcnow()
        db.commit()

    return build_user_profile(user)


def create_store_session(db: Session, profile: dict) -> str:
    _cleanup_expired_sessions(db)

    token = uuid.uuid4().hex
    now = datetime.utcnow()
    ttl_seconds = _get_session_ttl_seconds()
    session = StoreAuthSession(
        session_token=token,
        username=normalize_text(profile.get("username")),
        user_payload=dict(profile),
        created_at=now,
        updated_at=now,
        expires_at=now + timedelta(seconds=ttl_seconds),
    )
    db.add(session)
    db.commit()
    return token


def resolve_store_profile(
    db: Session,
    authorization: str = "",
    x_api_token: str = "",
    allow_internal_token: bool = False,
) -> Optional[dict]:
    candidates: List[str] = []
    bearer_token = parse_bearer_token(authorization)
    if bearer_token:
        candidates.append(bearer_token)

    direct_token = normalize_text(x_api_token)
    if direct_token and direct_token not in candidates:
        candidates.append(direct_token)

    for token in candidates:
        profile = _find_session_profile(db, token)
        if profile:
            return profile

        legacy_profile = get_profile_by_token(token)
        if legacy_profile:
            return {
                "username": normalize_text(legacy_profile.get("sales_id")),
                "name": normalize_text(legacy_profile.get("sales_name")),
                "role": "sales",
                "store": normalize_store_code(legacy_profile.get("store_code")),
                "is_legacy_auth": True,
            }

    if allow_internal_token:
        expected = normalize_text(getattr(settings, "WEILAN_API_TOKEN", ""))
        provided = read_internal_token(authorization, x_api_token)
        if expected and provided and hmac.compare_digest(expected, provided):
            return {
                "username": "internal_bridge",
                "name": "内部桥接",
                "role": "manager",
                "store": "",
                "is_internal": True,
            }

    return None


def logout_store_session(db: Session, authorization: str = "", x_api_token: str = "") -> None:
    candidates = [parse_bearer_token(authorization), normalize_text(x_api_token)]
    cleaned = [item for item in candidates if item]
    if not cleaned:
        return

    db.query(StoreAuthSession).filter(StoreAuthSession.session_token.in_(cleaned)).delete(synchronize_session=False)
    db.commit()


def _normalize_order_payload(source: dict) -> Optional[dict]:
    if not isinstance(source, dict):
        return None

    payload = dict(source)
    order_id = normalize_text(payload.get("id") or payload.get("order_id") or payload.get("orderId"))
    if not order_id:
        return None

    try:
        version = int(payload.get("version") or 0)
    except (TypeError, ValueError):
        version = 0

    payload["id"] = order_id
    payload["status"] = normalize_order_status(payload.get("status"))
    payload["version"] = max(0, version)

    created_at = normalize_text(payload.get("createdAt")) or now_text()
    updated_at = normalize_text(payload.get("updatedAt")) or created_at
    payload["createdAt"] = created_at
    payload["updatedAt"] = updated_at

    return payload


def _record_to_order_payload(record: StoreOrder) -> dict:
    payload = dict(record.payload or {})
    payload["id"] = normalize_text(payload.get("id") or record.order_id)
    payload["status"] = normalize_order_status(payload.get("status") or record.status)
    payload["version"] = int(payload.get("version") or record.version or 0)
    payload["createdAt"] = normalize_text(payload.get("createdAt") or record.created_at_text)
    payload["updatedAt"] = normalize_text(payload.get("updatedAt") or record.updated_at_text)
    return payload


def _sync_order_columns(record: StoreOrder, payload: dict) -> None:
    payload = _normalize_order_payload(payload) or {}
    record.order_id = normalize_text(payload.get("id"))
    record.status = normalize_order_status(payload.get("status"))
    record.version = int(payload.get("version") or 0)

    record.store_name = normalize_text(payload.get("store"))
    record.sales_brand_text = normalize_text(payload.get("salesBrandText"))
    record.customer_name = normalize_text(payload.get("customerName"))
    record.phone = normalize_text(payload.get("phone"))
    record.car_model = normalize_text(payload.get("carModel"))

    record.lead_source = normalize_text(payload.get("leadSource"))
    record.lead_grade = normalize_text(payload.get("leadGrade")).upper()
    record.lead_status = normalize_text(payload.get("leadStatus"))

    record.created_at_text = normalize_text(payload.get("createdAt"))
    record.updated_at_text = normalize_text(payload.get("updatedAt"))
    record.created_at_dt = parse_datetime_text(record.created_at_text) or datetime.utcnow()
    record.updated_at_dt = parse_datetime_text(record.updated_at_text) or datetime.utcnow()

    record.payload = payload


def _order_sort_key(order: dict) -> datetime:
    updated = parse_datetime_text(order.get("updatedAt"))
    if updated:
        return updated
    created = parse_datetime_text(order.get("createdAt"))
    if created:
        return created
    return datetime.min


def _get_permissions(role: str) -> dict:
    return ROLE_PERMISSIONS.get(normalize_role(role), {"canViewAll": False, "canViewMine": False, "canEditAll": False})


def _is_order_mine(order: dict, user: dict) -> bool:
    role = normalize_role(user.get("role"))
    me = normalize_keyword(user.get("name"))
    if not me:
        return False

    if role == "sales":
        return normalize_keyword(order.get("salesBrandText")) == me

    if role == "technician":
        dispatch = order.get("dispatchInfo") if isinstance(order.get("dispatchInfo"), dict) else {}
        names = []
        if isinstance(dispatch.get("technicianNames"), list):
            names.extend(dispatch.get("technicianNames"))
        names.append(dispatch.get("technicianName"))
        if any(normalize_keyword(item) == me for item in names):
            return True

        records = order.get("workPartRecords") if isinstance(order.get("workPartRecords"), list) else []
        for item in records:
            if not isinstance(item, dict):
                continue
            if normalize_keyword(item.get("technicianName")) == me:
                return True
        return False

    if role in ("manager", "finance"):
        return True

    return False


def _scope_orders(orders: Iterable[dict], user: dict, view: str) -> List[dict]:
    source = list(orders)
    permissions = _get_permissions(user.get("role"))
    view_key = normalize_text(view).upper() or "ALL"

    if view_key == "MINE":
        if not permissions.get("canViewMine"):
            raise StoreApiError("当前账号不支持查看我的订单", status_code=403)
        return [item for item in source if _is_order_mine(item, user)]

    if not permissions.get("canViewAll"):
        raise StoreApiError("当前账号无权查看全部订单", status_code=403)

    role = normalize_role(user.get("role"))
    store_code = normalize_store_code(user.get("store"))
    if role == "sales" and store_code:
        store_name = STORE_CODE_TO_NAME.get(store_code, "")
        if store_name:
            return [item for item in source if normalize_text(item.get("store")) == store_name]
    return source


def _order_matches_keyword(order: dict, keyword: str) -> bool:
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


def _build_order_stats(orders: Iterable[dict]) -> dict:
    items = list(orders)
    return {
        "total": len(items),
        "pending": len([item for item in items if normalize_order_status(item.get("status")) == "未完工"]),
        "confirmed": len([item for item in items if normalize_order_status(item.get("status")) == "已完工"]),
        "cancelled": len([item for item in items if normalize_text(item.get("status")) == "已取消"]),
    }


def list_store_orders(
    db: Session,
    user: dict,
    view: str = "ALL",
    status: str = "ALL",
    keyword: str = "",
    sales_owner: str = "",
    updated_after: str = "",
) -> dict:
    query = db.query(StoreOrder)
    threshold = parse_datetime_text(updated_after)
    if threshold:
        query = query.filter(StoreOrder.updated_at_dt > threshold)

    rows = query.order_by(StoreOrder.updated_at_dt.desc(), StoreOrder.created_at_dt.desc()).all()
    scoped = _scope_orders([_record_to_order_payload(row) for row in rows], user, view)

    status_key = normalize_text(status)
    if status_key and status_key != "ALL":
        scoped = [item for item in scoped if normalize_order_status(item.get("status")) == normalize_order_status(status_key)]

    owner = normalize_text(sales_owner)
    if owner:
        target = normalize_keyword(owner)
        scoped = [item for item in scoped if normalize_keyword(item.get("salesBrandText")) == target]

    search_keyword = normalize_text(keyword)
    if search_keyword:
        scoped = [item for item in scoped if _order_matches_keyword(item, search_keyword)]

    scoped.sort(key=_order_sort_key, reverse=True)
    return {
        "items": scoped,
        "count": len(scoped),
        "stats": _build_order_stats(scoped),
    }


def get_store_order_payload(db: Session, order_id: str) -> Optional[dict]:
    target_id = normalize_text(order_id)
    if not target_id:
        return None
    row = db.query(StoreOrder).filter(StoreOrder.order_id == target_id).first()
    if not row:
        return None
    return _record_to_order_payload(row)


def can_edit_order(user: dict, order: dict) -> bool:
    permissions = _get_permissions(user.get("role"))
    if permissions.get("canEditAll"):
        return True
    return _is_order_mine(order, user)


def update_store_order(db: Session, order_id: str, body: dict) -> dict:
    target_id = normalize_text(order_id)
    if not target_id:
        raise StoreApiError("缺少订单ID", status_code=400)

    if not isinstance(body, dict):
        raise StoreApiError("请求体必须是 JSON 对象", status_code=400)

    raw_version = body.get("version")
    try:
        incoming_version = int(raw_version)
    except (TypeError, ValueError):
        raise StoreApiError("version 必须是数字", status_code=400)

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
    patch = {key: body[key] for key in allowed_fields if key in body}
    if not patch:
        raise StoreApiError("没有可更新字段", status_code=400)

    row = db.query(StoreOrder).filter(StoreOrder.order_id == target_id).first()
    if not row:
        raise StoreApiError("订单不存在", status_code=404)

    payload = _record_to_order_payload(row)
    current_version = int(payload.get("version") or 0)
    if incoming_version != current_version:
        error = StoreApiError("订单已被更新，请刷新后重试", status_code=409, code="ORDER_VERSION_CONFLICT")
        error.current_version = current_version
        raise error

    if "status" in patch:
        patch["status"] = normalize_order_status(patch.get("status"))

    payload.update(patch)
    payload["updatedAt"] = now_text()
    payload["version"] = current_version + 1

    _sync_order_columns(row, payload)
    row.updated_at_dt = datetime.utcnow()
    db.add(row)
    db.commit()

    return _record_to_order_payload(row)


def apply_incremental_order_sync(db: Session, incoming_orders: list) -> dict:
    incoming = incoming_orders if isinstance(incoming_orders, list) else []

    accepted_ids: List[str] = []
    conflicts: List[dict] = []

    for item in incoming:
        candidate = _normalize_order_payload(item)
        if not candidate:
            continue

        order_id = candidate["id"]
        row = db.query(StoreOrder).filter(StoreOrder.order_id == order_id).first()
        current = _record_to_order_payload(row) if row else None

        incoming_version = int(candidate.get("version") or 0)
        current_version = int(current.get("version") or 0) if current else 0

        if current:
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
            if incoming_version == current_version and candidate != current:
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
            candidate["createdAt"] = normalize_text(current.get("createdAt")) if current else now_text()
        if not normalize_text(candidate.get("updatedAt")):
            candidate["updatedAt"] = now_text()

        if not row:
            row = StoreOrder(order_id=order_id, payload={})

        _sync_order_columns(row, candidate)
        db.add(row)
        accepted_ids.append(order_id)

    if accepted_ids:
        db.commit()

    return {
        "acceptedIds": accepted_ids,
        "acceptedCount": len(accepted_ids),
        "conflicts": conflicts,
        "conflictCount": len(conflicts),
    }


def list_store_leads(db: Session, user: dict, grade: str = "ALL", status: str = "ALL", view: str = "ALL") -> dict:
    rows = db.query(StoreOrder).order_by(StoreOrder.updated_at_dt.desc(), StoreOrder.created_at_dt.desc()).all()
    scoped = _scope_orders([_record_to_order_payload(row) for row in rows], user, view)

    leads = [item for item in scoped if normalize_text(item.get("leadSource")) == "douyin_ai"]

    grade_filter = normalize_text(grade).upper()
    if grade_filter and grade_filter != "ALL":
        leads = [item for item in leads if normalize_text(item.get("leadGrade")).upper() == grade_filter]

    status_filter = normalize_text(status).upper()
    if status_filter and status_filter != "ALL":
        target_status = ORDER_STATUS_ALIAS.get(status_filter, status_filter)
        leads = [item for item in leads if normalize_text(item.get("status")) == target_status]

    grade_order = {"S": 0, "A": 1, "B": 2, "C": 3}
    leads.sort(
        key=lambda item: (
            grade_order.get(normalize_text(item.get("leadGrade")).upper(), 9),
            -(int(item.get("leadGradeScore") or 0)),
        )
    )

    for item in leads:
        if not item.get("leadStatus"):
            item["leadStatus"] = "待联系"

    stats = {"total": len(leads), "S": 0, "A": 0, "B": 0, "C": 0}
    for g in ("S", "A", "B", "C"):
        stats[g] = len([item for item in leads if normalize_text(item.get("leadGrade")).upper() == g])

    return {
        "items": leads,
        "stats": stats,
    }


def list_followup_due(db: Session, user: dict) -> dict:
    rows = db.query(StoreOrder).order_by(StoreOrder.updated_at_dt.desc()).all()
    scoped = _scope_orders([_record_to_order_payload(row) for row in rows], user, "ALL")
    leads = [item for item in scoped if normalize_text(item.get("leadSource")) == "douyin_ai"]

    today = date.today()
    due_items = []

    for lead in leads:
        records = lead.get("followupRecords") if isinstance(lead.get("followupRecords"), list) else []
        created_text = normalize_text(lead.get("createdAt"))
        try:
            base_date = datetime.strptime(created_text[:10], "%Y-%m-%d").date() if len(created_text) >= 10 else today
        except (ValueError, TypeError):
            base_date = today

        for record in records:
            if not isinstance(record, dict):
                continue
            if record.get("done"):
                continue

            follow_type = normalize_text(record.get("type"))
            try:
                days = int(follow_type.replace("D", ""))
            except (TypeError, ValueError):
                continue

            due_date = base_date + timedelta(days=days)
            if due_date <= today:
                due_items.append(
                    {
                        "leadId": lead.get("id"),
                        "customerName": normalize_text(lead.get("customerName")),
                        "phone": normalize_text(lead.get("phone")),
                        "leadGrade": normalize_text(lead.get("leadGrade")),
                        "followupType": follow_type,
                        "dueDate": due_date.isoformat(),
                        "overdueDays": (today - due_date).days,
                    }
                )

    due_items.sort(key=lambda item: (-int(item.get("overdueDays") or 0), normalize_text(item.get("leadGrade") or "Z")))
    return {
        "items": due_items,
        "total": len(due_items),
    }


def update_lead_status(db: Session, lead_id: str, lead_status: str) -> dict:
    target_id = normalize_text(lead_id)
    next_status = normalize_text(lead_status)
    if not target_id or not next_status:
        raise StoreApiError("id 和 leadStatus 必填", status_code=400)
    if next_status not in LEAD_STATUSES:
        raise StoreApiError(f"无效状态: {next_status}", status_code=400)

    row = db.query(StoreOrder).filter(StoreOrder.order_id == target_id).first()
    if not row:
        raise StoreApiError("线索不存在", status_code=404)

    payload = _record_to_order_payload(row)
    payload["leadStatus"] = next_status
    payload["updatedAt"] = now_text()
    payload["version"] = int(payload.get("version") or 0) + 1

    _sync_order_columns(row, payload)
    db.add(row)
    db.commit()

    return payload


def build_work_order_sync_response(order: dict, event_type: str = "", source: str = "") -> dict:
    order_id = normalize_text(order.get("id") if isinstance(order, dict) else "")
    if not order_id:
        raise StoreApiError("缺少订单ID", status_code=400)

    external_id = f"FIN-{datetime.now().strftime('%Y%m%d%H%M%S')}-{order_id}"
    return {
        "success": True,
        "code": 0,
        "message": "财务系统入账成功",
        "data": {
            "externalId": external_id,
            "orderId": order_id,
            "eventType": normalize_text(event_type),
            "source": normalize_text(source),
            "receivedAt": now_text(),
        },
    }
