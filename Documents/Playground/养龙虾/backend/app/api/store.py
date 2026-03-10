"""经营系统桥接 API：统一通过 8000 转发到蔚蓝 admin-console。"""

from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Header, Query
from fastapi.responses import JSONResponse

from app.api.auth_guard import parse_bearer_token
from app.config import settings


router = APIRouter(prefix="/store", tags=["store-bridge"])


def _normalize_base_url(value: str) -> str:
    return str(value or "").strip().rstrip("/")


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _error_response(status_code: int, message: str, code: Optional[Any] = None, data: Optional[Dict[str, Any]] = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "code": code if code is not None else status_code,
            "message": _normalize_text(message) or "请求失败",
            "data": data or {},
        },
    )


async def _forward_weilan(
    path: str,
    method: str = "GET",
    params: Optional[Dict[str, Any]] = None,
    payload: Optional[Dict[str, Any]] = None,
    authorization: str = "",
    use_internal_token: bool = False,
    idempotency_key: str = "",
) -> tuple[int, Dict[str, Any]]:
    base_url = _normalize_base_url(settings.WEILAN_API_URL)
    if not base_url:
        return 500, {"message": "未配置 WEILAN_API_URL"}

    headers: Dict[str, str] = {"Content-Type": "application/json"}

    if use_internal_token:
        internal_token = _normalize_text(settings.WEILAN_API_TOKEN)
        if not internal_token:
            return 500, {"message": "未配置 WEILAN_API_TOKEN"}
        headers["Authorization"] = f"Bearer {internal_token}"
        headers["X-Api-Token"] = internal_token
    else:
        user_token = parse_bearer_token(authorization)
        if user_token:
            headers["Authorization"] = f"Bearer {user_token}"

    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.request(
                method=method.upper(),
                url=f"{base_url}{path}",
                params=params,
                json=payload,
                headers=headers,
            )
    except httpx.TimeoutException:
        return 504, {"message": "请求蔚蓝系统超时"}
    except httpx.HTTPError as exc:
        return 502, {"message": f"请求蔚蓝系统失败: {exc}"}

    try:
        body = response.json()
    except ValueError:
        body = {}

    if not isinstance(body, dict):
        body = {}

    return response.status_code, body


@router.post("/auth/login")
async def store_login(payload: dict):
    username = _normalize_text(payload.get("username"))
    password = _normalize_text(payload.get("password"))
    if not username or not password:
        return _error_response(400, "请输入账号和密码", 400)

    status_code, body = await _forward_weilan(
        path="/api/login",
        method="POST",
        payload={"username": username, "password": password},
        use_internal_token=False,
    )

    if 200 <= status_code < 300 and body.get("ok") is True:
        return {
            "code": 0,
            "data": {
                "token": body.get("token") or "",
                "user": body.get("user") if isinstance(body.get("user"), dict) else {},
            },
        }

    return _error_response(status_code or 500, body.get("message") or "登录失败", body.get("code"))


@router.get("/auth/me")
async def store_me(authorization: str = Header(default="")):
    if not parse_bearer_token(authorization):
        return _error_response(401, "登录状态失效，请重新登录", 401)

    status_code, body = await _forward_weilan(
        path="/api/me",
        method="GET",
        authorization=authorization,
        use_internal_token=False,
    )

    if 200 <= status_code < 300 and body.get("ok") is True:
        return {
            "code": 0,
            "data": {
                "user": body.get("user") if isinstance(body.get("user"), dict) else {},
            },
        }

    return _error_response(status_code or 500, body.get("message") or "获取会话失败", body.get("code"))


@router.post("/auth/logout")
async def store_logout(authorization: str = Header(default="")):
    if not parse_bearer_token(authorization):
        return _error_response(401, "登录状态失效，请重新登录", 401)

    status_code, body = await _forward_weilan(
        path="/api/logout",
        method="POST",
        authorization=authorization,
        use_internal_token=False,
    )

    if 200 <= status_code < 300 and body.get("ok") is True:
        return {"code": 0, "data": {}}

    return _error_response(status_code or 500, body.get("message") or "退出失败", body.get("code"))


@router.get("/orders")
async def list_store_orders():
    status_code, body = await _forward_weilan(
        path="/api/v1/orders",
        method="GET",
        use_internal_token=True,
    )

    if 200 <= status_code < 300 and body.get("success") is True:
        items = body.get("items") if isinstance(body.get("items"), list) else []
        return {
            "code": 0,
            "data": {
                "items": items,
                "count": body.get("count", len(items)),
            },
        }

    return _error_response(status_code or 500, body.get("message") or "获取订单失败", body.get("code"))


@router.patch("/orders/{order_id}")
async def patch_store_order(order_id: str, payload: dict):
    status_code, body = await _forward_weilan(
        path=f"/api/v1/orders/{order_id}",
        method="PATCH",
        payload=payload if isinstance(payload, dict) else {},
        use_internal_token=True,
    )

    if 200 <= status_code < 300 and body.get("success") is True:
        return {
            "code": 0,
            "data": {
                "item": body.get("item") if isinstance(body.get("item"), dict) else {},
            },
        }

    data = {}
    if "currentVersion" in body:
        data["currentVersion"] = body.get("currentVersion")
    return _error_response(status_code or 500, body.get("message") or "更新订单失败", body.get("code"), data)


@router.get("/internal/orders")
async def list_internal_orders(updated_after: str = Query(default="", alias="updatedAfter")):
    status_code, body = await _forward_weilan(
        path="/api/v1/internal/orders",
        method="GET",
        params={"updatedAfter": _normalize_text(updated_after)} if _normalize_text(updated_after) else None,
        use_internal_token=True,
    )

    if 200 <= status_code < 300 and body.get("success") is True:
        return {"code": 0, "data": body}

    return _error_response(status_code or 500, body.get("message") or "拉取订单失败", body.get("code"))


@router.post("/internal/orders/sync")
async def sync_internal_orders(
    payload: dict,
    idempotency_key: str = Header(default="", alias="Idempotency-Key"),
):
    status_code, body = await _forward_weilan(
        path="/api/v1/internal/orders/sync",
        method="POST",
        payload=payload if isinstance(payload, dict) else {},
        use_internal_token=True,
        idempotency_key=_normalize_text(idempotency_key),
    )

    if 200 <= status_code < 300 and body.get("success") is True:
        return {"code": 0, "data": body}

    return _error_response(status_code or 500, body.get("message") or "同步订单失败", body.get("code"))


@router.post("/internal/work-orders/sync")
async def sync_internal_work_orders(
    payload: dict,
    idempotency_key: str = Header(default="", alias="Idempotency-Key"),
):
    status_code, body = await _forward_weilan(
        path="/api/v1/internal/work-orders/sync",
        method="POST",
        payload=payload if isinstance(payload, dict) else {},
        use_internal_token=True,
        idempotency_key=_normalize_text(idempotency_key),
    )

    if 200 <= status_code < 300 and body.get("success") is True:
        return {"code": 0, "data": body}

    return _error_response(status_code or 500, body.get("message") or "同步财务工单失败", body.get("code"))
