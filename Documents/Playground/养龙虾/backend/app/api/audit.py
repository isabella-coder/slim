"""订单操作审计 API。"""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.orm import Session

from app.api.auth_guard import get_auth_profile_from_header
from app.db import get_db
from app.services.audit_service import (
    create_order_operation_audit,
    export_order_operation_audits_csv,
    list_order_operation_audits,
    summarize_order_operation_audits,
)


router = APIRouter(prefix="/audit", tags=["audit"])


@router.post("/order-ops")
async def create_order_audit(
    payload: dict,
    authorization: str = Header(default=""),
    x_actor_role: str = Header(default="sales"),
    db: Session = Depends(get_db),
):
    """写入订单操作审计。"""
    profile = get_auth_profile_from_header(authorization)
    if not profile:
        return {"code": 401, "message": "登录状态失效，请重新登录"}

    try:
        row = create_order_operation_audit(
            db,
            payload=payload,
            actor_profile=profile,
            actor_role=x_actor_role,
        )
    except ValueError as exc:
        return {"code": 400, "message": str(exc)}

    return {
        "code": 0,
        "data": {
            "audit_id": row.audit_id,
            "created_at": row.created_at,
        },
    }


@router.get("/order-ops")
async def list_order_audits(
    target_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    result: Optional[str] = Query(None),
    actor_sales_id: Optional[str] = Query(None),
    created_from: Optional[str] = Query(None),  # YYYY-MM-DD
    created_to: Optional[str] = Query(None),  # YYYY-MM-DD
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
):
    """分页查询订单操作审计。"""
    profile = get_auth_profile_from_header(authorization)
    if not profile:
        return {"code": 401, "message": "登录状态失效，请重新登录"}

    created_from_dt = None
    created_to_dt = None
    try:
        if created_from:
            created_from_dt = datetime.strptime(created_from, "%Y-%m-%d")
        if created_to:
            created_to_dt = datetime.strptime(created_to, "%Y-%m-%d") + timedelta(days=1)
    except ValueError:
        return {"code": 400, "message": "日期格式错误，请使用 YYYY-MM-DD"}

    skip = (page - 1) * page_size
    items, total = list_order_operation_audits(
        db,
        store_code=str(profile.get("store_code") or ""),
        target_id=target_id,
        action=action,
        result=result,
        actor_sales_id=actor_sales_id,
        created_from=created_from_dt,
        created_to=created_to_dt,
        skip=skip,
        limit=page_size,
    )

    rows = []
    for item in items:
        rows.append(
            {
                "audit_id": item.audit_id,
                "store_code": item.store_code,
                "actor_sales_id": item.actor_sales_id,
                "actor_sales_name": item.actor_sales_name,
                "actor_role": item.actor_role,
                "target_type": item.target_type,
                "target_id": item.target_id,
                "action": item.action,
                "result": item.result,
                "before_status": item.before_status,
                "after_status": item.after_status,
                "error_code": item.error_code,
                "error_message": item.error_message,
                "source": item.source,
                "metadata": item.extra_data,
                "created_at": item.created_at,
            }
        )

    return {
        "code": 0,
        "data": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": rows,
        },
    }


@router.get("/order-ops/summary")
async def summary_order_audits(
    target_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    result: Optional[str] = Query(None),
    actor_sales_id: Optional[str] = Query(None),
    created_from: Optional[str] = Query(None),  # YYYY-MM-DD
    created_to: Optional[str] = Query(None),  # YYYY-MM-DD
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
):
    """聚合统计订单操作审计。"""
    profile = get_auth_profile_from_header(authorization)
    if not profile:
        return {"code": 401, "message": "登录状态失效，请重新登录"}

    created_from_dt = None
    created_to_dt = None
    try:
        if created_from:
            created_from_dt = datetime.strptime(created_from, "%Y-%m-%d")
        if created_to:
            created_to_dt = datetime.strptime(created_to, "%Y-%m-%d") + timedelta(days=1)
    except ValueError:
        return {"code": 400, "message": "日期格式错误，请使用 YYYY-MM-DD"}

    data = summarize_order_operation_audits(
        db,
        store_code=str(profile.get("store_code") or ""),
        target_id=target_id,
        action=action,
        result=result,
        actor_sales_id=actor_sales_id,
        created_from=created_from_dt,
        created_to=created_to_dt,
    )

    return {
        "code": 0,
        "data": data,
    }


@router.get("/order-ops/export")
async def export_order_audits(
    target_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    result: Optional[str] = Query(None),
    actor_sales_id: Optional[str] = Query(None),
    created_from: Optional[str] = Query(None),  # YYYY-MM-DD
    created_to: Optional[str] = Query(None),  # YYYY-MM-DD
    max_rows: int = Query(2000, ge=1, le=10000),
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
):
    """按筛选条件导出订单审计 CSV。"""
    profile = get_auth_profile_from_header(authorization)
    if not profile:
        return {"code": 401, "message": "登录状态失效，请重新登录"}

    created_from_dt = None
    created_to_dt = None
    try:
        if created_from:
            created_from_dt = datetime.strptime(created_from, "%Y-%m-%d")
        if created_to:
            created_to_dt = datetime.strptime(created_to, "%Y-%m-%d") + timedelta(days=1)
    except ValueError:
        return {"code": 400, "message": "日期格式错误，请使用 YYYY-MM-DD"}

    export = export_order_operation_audits_csv(
        db,
        store_code=str(profile.get("store_code") or ""),
        target_id=target_id,
        action=action,
        result=result,
        actor_sales_id=actor_sales_id,
        created_from=created_from_dt,
        created_to=created_to_dt,
        max_rows=max_rows,
    )

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return {
        "code": 0,
        "data": {
            "filename": f"order_audit_{timestamp}.csv",
            "rows": export["rows"],
            "max_rows": export["max_rows"],
            "csv": export["csv"],
        },
    }
