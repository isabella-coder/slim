"""经营系统统一 API（替代 8080 双系统接口）。"""

from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.store_service import (
    StoreApiError,
    apply_incremental_order_sync,
    authenticate_store_user,
    build_work_order_sync_response,
    can_edit_order,
    create_store_session,
    get_store_order_payload,
    list_followup_due,
    list_store_leads,
    list_store_orders,
    logout_store_session,
    normalize_text,
    resolve_store_profile,
    update_lead_status,
    update_store_order,
)


router = APIRouter(prefix="/store", tags=["store"])


def _auth_failed_response(message: str = "请先登录") -> dict:
    return JSONResponse(
        status_code=401,
        content={
            "ok": False,
            "success": False,
            "code": 401,
            "message": message,
        },
    )


def _parse_store_error(error: StoreApiError) -> dict:
    payload = {
        "ok": False,
        "success": False,
        "message": error.message,
        "code": error.code or error.status_code,
    }
    current_version = getattr(error, "current_version", None)
    if current_version is not None:
        payload["currentVersion"] = int(current_version)
    return JSONResponse(status_code=error.status_code, content=payload)


@router.post("/login")
async def store_login(payload: dict, db: Session = Depends(get_db)):
    username = normalize_text(payload.get("username") or payload.get("sales_id"))
    password = normalize_text(payload.get("password"))

    try:
        profile = authenticate_store_user(db, username=username, password=password)
        token = create_store_session(db, profile)
    except StoreApiError as error:
        return _parse_store_error(error)

    return {
        "ok": True,
        "success": True,
        "code": 0,
        "token": token,
        "user": profile,
    }


@router.get("/me")
async def store_me(
    authorization: str = Header(default=""),
    x_api_token: str = Header(default="", alias="X-Api-Token"),
    db: Session = Depends(get_db),
):
    profile = resolve_store_profile(db, authorization=authorization, x_api_token=x_api_token)
    if not profile:
        return _auth_failed_response("登录状态失效，请重新登录")

    return {
        "ok": True,
        "success": True,
        "code": 0,
        "user": profile,
    }


@router.post("/logout")
async def store_logout(
    authorization: str = Header(default=""),
    x_api_token: str = Header(default="", alias="X-Api-Token"),
    db: Session = Depends(get_db),
):
    logout_store_session(db, authorization=authorization, x_api_token=x_api_token)
    return {
        "ok": True,
        "success": True,
        "code": 0,
    }


@router.get("/orders")
async def store_orders(
    view: str = "ALL",
    status: str = "ALL",
    keyword: str = "",
    salesOwner: str = "",
    updatedAfter: str = "",
    authorization: str = Header(default=""),
    x_api_token: str = Header(default="", alias="X-Api-Token"),
    db: Session = Depends(get_db),
):
    profile = resolve_store_profile(db, authorization=authorization, x_api_token=x_api_token)
    if not profile:
        return _auth_failed_response("请先登录")

    try:
        result = list_store_orders(
            db,
            user=profile,
            view=view,
            status=status,
            keyword=keyword,
            sales_owner=salesOwner,
            updated_after=updatedAfter,
        )
    except StoreApiError as error:
        return _parse_store_error(error)

    return {
        "ok": True,
        "success": True,
        "code": 0,
        "items": result.get("items", []),
        "count": result.get("count", 0),
        "stats": result.get("stats", {}),
        "meta": {
            "view": view,
            "status": status,
            "keyword": keyword,
            "salesOwner": salesOwner,
        },
    }


@router.patch("/orders/{order_id}")
async def store_patch_order(
    order_id: str,
    payload: dict,
    authorization: str = Header(default=""),
    x_api_token: str = Header(default="", alias="X-Api-Token"),
    db: Session = Depends(get_db),
):
    profile = resolve_store_profile(db, authorization=authorization, x_api_token=x_api_token)
    if not profile:
        return _auth_failed_response("请先登录")

    target = get_store_order_payload(db, order_id)
    if not target:
        return JSONResponse(
            status_code=404,
            content={
                "ok": False,
                "success": False,
                "code": 404,
                "message": "订单不存在",
            },
        )
    if not can_edit_order(profile, target):
        return JSONResponse(
            status_code=403,
            content={
                "ok": False,
                "success": False,
                "code": 403,
                "message": "无权更新该订单",
            },
        )

    try:
        updated = update_store_order(db, order_id, payload)
    except StoreApiError as error:
        return _parse_store_error(error)

    return {
        "ok": True,
        "success": True,
        "code": 0,
        "item": updated,
    }


@router.get("/internal/orders")
async def store_internal_orders(
    updatedAfter: str = "",
    authorization: str = Header(default=""),
    x_api_token: str = Header(default="", alias="X-Api-Token"),
    db: Session = Depends(get_db),
):
    profile = resolve_store_profile(
        db,
        authorization=authorization,
        x_api_token=x_api_token,
        allow_internal_token=True,
    )
    if not profile:
        return JSONResponse(
            status_code=401,
            content={
                "success": False,
                "code": 401,
                "message": "内部接口鉴权失败",
            },
        )

    result = list_store_orders(
        db,
        user=profile,
        view="ALL",
        status="ALL",
        keyword="",
        sales_owner="",
        updated_after=updatedAfter,
    )
    items = result.get("items", [])
    latest_updated = ""
    if items:
        latest_updated = str(items[0].get("updatedAt") or items[0].get("createdAt") or "")

    return {
        "success": True,
        "code": 0,
        "items": items,
        "count": result.get("count", 0),
        "updatedAt": latest_updated,
    }


@router.post("/internal/orders/sync")
async def store_internal_sync_orders(
    payload: dict,
    authorization: str = Header(default=""),
    x_api_token: str = Header(default="", alias="X-Api-Token"),
    db: Session = Depends(get_db),
):
    profile = resolve_store_profile(
        db,
        authorization=authorization,
        x_api_token=x_api_token,
        allow_internal_token=True,
    )
    if not profile:
        return JSONResponse(
            status_code=401,
            content={
                "success": False,
                "code": 401,
                "message": "内部接口鉴权失败",
            },
        )

    orders = payload.get("orders") if isinstance(payload, dict) else None
    if not isinstance(orders, list):
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "code": 400,
                "message": "orders 必须是数组",
            },
        )

    result = apply_incremental_order_sync(db, orders)
    return {
        "success": True,
        "code": 0,
        "message": "订单增量同步完成",
        "count": len(orders),
        "acceptedCount": result.get("acceptedCount", 0),
        "acceptedIds": result.get("acceptedIds", []),
        "conflictCount": result.get("conflictCount", 0),
        "conflicts": result.get("conflicts", []),
        "updatedAt": "",
    }


@router.post("/internal/work-orders/sync")
async def store_internal_sync_work_orders(
    payload: dict,
    authorization: str = Header(default=""),
    x_api_token: str = Header(default="", alias="X-Api-Token"),
    db: Session = Depends(get_db),
):
    profile = resolve_store_profile(
        db,
        authorization=authorization,
        x_api_token=x_api_token,
        allow_internal_token=True,
    )
    if not profile:
        return JSONResponse(
            status_code=401,
            content={
                "success": False,
                "code": 401,
                "message": "内部接口鉴权失败",
            },
        )

    order = payload.get("order") if isinstance(payload, dict) else {}
    event_type = payload.get("eventType") if isinstance(payload, dict) else ""
    source = payload.get("source") if isinstance(payload, dict) else ""

    try:
        result = build_work_order_sync_response(order, event_type=event_type, source=source)
    except StoreApiError as error:
        return _parse_store_error(error)

    return result


@router.get("/leads")
async def store_leads(
    grade: str = "ALL",
    status: str = "ALL",
    view: str = "ALL",
    authorization: str = Header(default=""),
    x_api_token: str = Header(default="", alias="X-Api-Token"),
    db: Session = Depends(get_db),
):
    profile = resolve_store_profile(db, authorization=authorization, x_api_token=x_api_token)
    if not profile:
        return _auth_failed_response("请先登录")

    try:
        result = list_store_leads(db, user=profile, grade=grade, status=status, view=view)
    except StoreApiError as error:
        return _parse_store_error(error)

    return {
        "ok": True,
        "success": True,
        "code": 0,
        "items": result.get("items", []),
        "stats": result.get("stats", {}),
    }


@router.get("/leads/followup-due")
async def store_leads_followup_due(
    authorization: str = Header(default=""),
    x_api_token: str = Header(default="", alias="X-Api-Token"),
    db: Session = Depends(get_db),
):
    profile = resolve_store_profile(db, authorization=authorization, x_api_token=x_api_token)
    if not profile:
        return _auth_failed_response("请先登录")

    try:
        result = list_followup_due(db, user=profile)
    except StoreApiError as error:
        return _parse_store_error(error)

    return {
        "ok": True,
        "success": True,
        "code": 0,
        "items": result.get("items", []),
        "total": result.get("total", 0),
    }


@router.post("/leads/update-status")
async def store_update_lead_status(
    payload: dict,
    authorization: str = Header(default=""),
    x_api_token: str = Header(default="", alias="X-Api-Token"),
    db: Session = Depends(get_db),
):
    profile = resolve_store_profile(db, authorization=authorization, x_api_token=x_api_token)
    if not profile:
        return _auth_failed_response("请先登录")

    lead_id = payload.get("id") if isinstance(payload, dict) else ""
    lead_status = payload.get("leadStatus") if isinstance(payload, dict) else ""

    try:
        updated = update_lead_status(db, lead_id=lead_id, lead_status=lead_status)
    except StoreApiError as error:
        return _parse_store_error(error)

    return {
        "ok": True,
        "success": True,
        "code": 0,
        "leadStatus": updated.get("leadStatus", ""),
    }
