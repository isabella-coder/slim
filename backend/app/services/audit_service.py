"""订单操作审计服务。"""

import csv
from datetime import datetime
import io
import uuid
from typing import Dict, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import OrderOperationAudit


def _now_utc() -> datetime:
    return datetime.utcnow()


def create_order_operation_audit(
    db: Session,
    payload: Dict,
    actor_profile: Dict,
    actor_role: str = "sales",
) -> OrderOperationAudit:
    """写入一条订单操作审计记录。"""
    target_id = str(payload.get("target_id") or "").strip()
    action = str(payload.get("action") or "").strip()
    result = str(payload.get("result") or "").strip().lower()

    if not target_id:
        raise ValueError("缺少 target_id")
    if not action:
        raise ValueError("缺少 action")
    if result not in {"success", "failed", "skipped"}:
        raise ValueError("result 必须为 success/failed/skipped")

    actor_sales_id = str(actor_profile.get("sales_id") or "").strip()
    actor_sales_name = str(actor_profile.get("sales_name") or "").strip()
    store_code = str(actor_profile.get("store_code") or "").strip()

    if not actor_sales_id or not store_code:
        raise ValueError("当前登录信息不完整")

    row = OrderOperationAudit(
        audit_id=f"audit_{_now_utc().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}",
        store_code=store_code,
        actor_sales_id=actor_sales_id,
        actor_sales_name=actor_sales_name,
        actor_role=str(actor_role or "sales").strip().lower() or "sales",
        target_type=str(payload.get("target_type") or "order").strip() or "order",
        target_id=target_id,
        action=action,
        result=result,
        before_status=str(payload.get("before_status") or "").strip() or None,
        after_status=str(payload.get("after_status") or "").strip() or None,
        error_code=str(payload.get("error_code") or "").strip() or None,
        error_message=str(payload.get("error_message") or "").strip() or None,
        source=str(payload.get("source") or "").strip() or None,
        extra_data=payload.get("metadata") if isinstance(payload.get("metadata"), dict) else None,
        created_at=_now_utc(),
    )

    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_order_operation_audits(
    db: Session,
    *,
    store_code: str,
    target_id: Optional[str] = None,
    action: Optional[str] = None,
    result: Optional[str] = None,
    actor_sales_id: Optional[str] = None,
    created_from: Optional[datetime] = None,
    created_to: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 20,
) -> Tuple[list, int]:
    """查询订单操作审计（分页）。"""
    query = _build_audit_query(
        db,
        store_code=store_code,
        target_id=target_id,
        action=action,
        result=result,
        actor_sales_id=actor_sales_id,
        created_from=created_from,
        created_to=created_to,
    )

    total = query.count()
    items = (
        query.order_by(OrderOperationAudit.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items, total


def _build_audit_query(
    db: Session,
    *,
    store_code: str,
    target_id: Optional[str] = None,
    action: Optional[str] = None,
    result: Optional[str] = None,
    actor_sales_id: Optional[str] = None,
    created_from: Optional[datetime] = None,
    created_to: Optional[datetime] = None,
):
    query = db.query(OrderOperationAudit).filter(OrderOperationAudit.store_code == store_code)

    if target_id:
        query = query.filter(OrderOperationAudit.target_id == target_id)
    if action:
        query = query.filter(OrderOperationAudit.action == action)
    if result:
        query = query.filter(OrderOperationAudit.result == result)
    if actor_sales_id:
        query = query.filter(OrderOperationAudit.actor_sales_id == actor_sales_id)
    if created_from:
        query = query.filter(OrderOperationAudit.created_at >= created_from)
    if created_to:
        query = query.filter(OrderOperationAudit.created_at < created_to)

    return query


def _classify_error_type(error_code: Optional[str], error_message: Optional[str]) -> str:
    code = str(error_code or "").strip().upper()
    message = str(error_message or "").strip().lower()

    if "VERSION" in code or "CONFLICT" in code or any(word in message for word in ["version", "conflict", "版本", "冲突"]):
        return "VERSION_CONFLICT"
    if "PERMISSION" in code or any(word in message for word in ["permission", "权限"]):
        return "NO_PERMISSION"
    if any(word in code for word in ["NETWORK", "TIMEOUT", "REQUEST"]) or any(word in message for word in ["network", "timeout", "request", "网络", "超时", "请求"]):
        return "NETWORK"
    if "ALREADY_TARGET" in code or "ALREADY" in code or any(word in message for word in ["already", "已是目标状态"]):
        return "ALREADY_TARGET"
    if any(word in code for word in ["DATA_CHANGED", "NOT_FOUND_IN_VIEW"]) or any(word in message for word in ["changed", "refresh", "变化", "刷新"]):
        return "DATA_CHANGED"
    return "OTHER"


def summarize_order_operation_audits(
    db: Session,
    *,
    store_code: str,
    target_id: Optional[str] = None,
    action: Optional[str] = None,
    result: Optional[str] = None,
    actor_sales_id: Optional[str] = None,
    created_from: Optional[datetime] = None,
    created_to: Optional[datetime] = None,
) -> Dict:
    """聚合统计订单操作审计。"""
    query = _build_audit_query(
        db,
        store_code=store_code,
        target_id=target_id,
        action=action,
        result=result,
        actor_sales_id=actor_sales_id,
        created_from=created_from,
        created_to=created_to,
    )

    total = query.count()

    result_rows = (
        query.with_entities(OrderOperationAudit.result, func.count(OrderOperationAudit.audit_id))
        .group_by(OrderOperationAudit.result)
        .all()
    )
    result_counter = {str(row[0] or "").lower(): int(row[1] or 0) for row in result_rows}

    action_rows = (
        query.with_entities(OrderOperationAudit.action, func.count(OrderOperationAudit.audit_id))
        .group_by(OrderOperationAudit.action)
        .all()
    )
    action_counter = {str(row[0] or "").strip(): int(row[1] or 0) for row in action_rows if str(row[0] or "").strip()}

    error_rows = (
        query.filter(OrderOperationAudit.result.in_(["failed", "skipped"]))
        .with_entities(
            OrderOperationAudit.error_code,
            OrderOperationAudit.error_message,
            func.count(OrderOperationAudit.audit_id),
        )
        .group_by(OrderOperationAudit.error_code, OrderOperationAudit.error_message)
        .all()
    )

    reason_counter = {}
    for code, message, count in error_rows:
        key = _classify_error_type(code, message)
        reason_counter[key] = reason_counter.get(key, 0) + int(count or 0)

    labels = {
        "VERSION_CONFLICT": "版本冲突",
        "NO_PERMISSION": "权限不足",
        "NETWORK": "网络异常",
        "ALREADY_TARGET": "已是目标状态",
        "DATA_CHANGED": "数据已变化",
        "OTHER": "其他原因",
    }

    reason_stats = [
        {
            "type": key,
            "label": labels.get(key, "其他原因"),
            "count": reason_counter[key],
        }
        for key in reason_counter
    ]
    reason_stats.sort(key=lambda item: item["count"], reverse=True)

    action_labels = {
        "quick_status_update": "快捷改状态",
        "batch_status_update": "批量改状态",
        "detail_save_update": "详情页保存",
    }
    action_stats = [
        {
            "action": key,
            "label": action_labels.get(key, key),
            "count": action_counter[key],
        }
        for key in action_counter
    ]
    action_stats.sort(key=lambda item: item["count"], reverse=True)

    return {
        "total": total,
        "success_count": result_counter.get("success", 0),
        "failed_count": result_counter.get("failed", 0),
        "skipped_count": result_counter.get("skipped", 0),
        "action_stats": action_stats,
        "error_type_stats": reason_stats,
    }


def export_order_operation_audits_csv(
    db: Session,
    *,
    store_code: str,
    target_id: Optional[str] = None,
    action: Optional[str] = None,
    result: Optional[str] = None,
    actor_sales_id: Optional[str] = None,
    created_from: Optional[datetime] = None,
    created_to: Optional[datetime] = None,
    max_rows: int = 2000,
) -> Dict:
    """导出订单操作审计 CSV 文本。"""
    safe_max_rows = max(1, min(int(max_rows or 2000), 10000))

    query = _build_audit_query(
        db,
        store_code=store_code,
        target_id=target_id,
        action=action,
        result=result,
        actor_sales_id=actor_sales_id,
        created_from=created_from,
        created_to=created_to,
    )

    items = (
        query.order_by(OrderOperationAudit.created_at.desc())
        .limit(safe_max_rows)
        .all()
    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "audit_id",
        "created_at",
        "store_code",
        "actor_sales_id",
        "actor_sales_name",
        "actor_role",
        "target_type",
        "target_id",
        "action",
        "result",
        "before_status",
        "after_status",
        "error_code",
        "error_message",
        "source",
    ])

    for item in items:
        writer.writerow([
            item.audit_id,
            item.created_at.isoformat() if item.created_at else "",
            item.store_code,
            item.actor_sales_id,
            item.actor_sales_name or "",
            item.actor_role or "",
            item.target_type or "",
            item.target_id or "",
            item.action or "",
            item.result or "",
            item.before_status or "",
            item.after_status or "",
            item.error_code or "",
            item.error_message or "",
            item.source or "",
        ])

    csv_text = output.getvalue()
    output.close()

    return {
        "csv": csv_text,
        "rows": len(items),
        "max_rows": safe_max_rows,
    }
