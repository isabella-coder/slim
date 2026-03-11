"""轻量认证 API（小程序登录）"""

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app.services.auth_service import list_active_sales, login_sales
from app.api.auth_guard import get_auth_profile_from_header


router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/sales")
async def sales_options(db: Session = Depends(get_db)):
    """获取可登录销售列表（用于登录页下拉）"""
    return {
        "code": 0,
        "data": {
            "items": list_active_sales(db),
        },
    }


@router.post("/login")
async def login(payload: dict, request: Request, db: Session = Depends(get_db)):
    """销售登录"""
    sales_id = (payload.get("sales_id") or "").strip()
    password = payload.get("password") or ""

    if not sales_id or not password:
        return {
            "code": 400,
            "message": "请输入账号和密码",
        }

    client_ip = request.client.host if request.client else ""

    try:
        session = login_sales(db, sales_id, password, client_ip=client_ip)
    except ValueError as exc:
        return {
            "code": 401,
            "message": str(exc),
        }

    return {
        "code": 0,
        "data": session,
    }


@router.get("/me")
async def me(authorization: str = Header(default="")):
    """根据 Bearer token 获取当前登录用户"""
    profile = get_auth_profile_from_header(authorization)
    if not profile:
        return {
            "code": 401,
            "message": "登录状态失效，请重新登录",
        }

    return {
        "code": 0,
        "data": profile,
    }
