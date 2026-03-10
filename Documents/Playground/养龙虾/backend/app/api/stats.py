"""
统计报表 API 路由
"""

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.orm import Session
from app.db import get_db
from app.api.auth_guard import get_auth_profile_from_header
from app.services.stats_service import get_daily_stats, get_sales_daily_report, get_sales_stats
from datetime import datetime
from typing import Optional

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/daily")
async def get_daily_report(
    stat_date: str = Query(...),  # YYYY-MM-DD
    store_code: Optional[str] = Query(None),
    authorization: str = Header(default=""),
    db: Session = Depends(get_db)
):
    """获取日报统计"""
    if not get_auth_profile_from_header(authorization):
        return {"code": 401, "message": "登录状态失效，请重新登录"}

    try:
        # 解析日期
        date_obj = datetime.strptime(stat_date, "%Y-%m-%d").date()
        
        # 如果指定门店，返回该门店的统计；否则返回所有门店的统计
        if store_code:
            stats = get_daily_stats(db, date_obj, store_code)
            return {
                "code": 0,
                "data": stats
            }
        else:
            # 返回两个门店的统计
            stats_bop = get_daily_stats(db, date_obj, 'BOP')
            stats_lm = get_daily_stats(db, date_obj, 'LM')
            
            return {
                "code": 0,
                "data": {
                    "stat_date": stat_date,
                    "by_store": [stats_bop, stats_lm]
                }
            }
    except ValueError as e:
        return {
            "code": 400,
            "message": f"Invalid date format: {str(e)}"
        }


@router.get("/by-sales")
async def get_sales_report(
    store_code: str = Query(...),
    days: int = Query(7, ge=1, le=90),
    authorization: str = Header(default=""),
    db: Session = Depends(get_db)
):
    """按销售统计"""
    if not get_auth_profile_from_header(authorization):
        return {"code": 401, "message": "登录状态失效，请重新登录"}

    sales_stats = get_sales_stats(db, store_code, days)
    
    return {
        "code": 0,
        "data": {
            "store_code": store_code,
            "days": days,
            "sales": sales_stats
        }
    }


@router.get("/sla")
async def get_sla_report(
    stat_date: str = Query(...),  # YYYY-MM-DD
    store_code: Optional[str] = Query(None),
    authorization: str = Header(default=""),
    db: Session = Depends(get_db)
):
    """获取 SLA 统计"""
    if not get_auth_profile_from_header(authorization):
        return {"code": 401, "message": "登录状态失效，请重新登录"}

    from app.models import Lead
    from sqlalchemy import func
    
    try:
        date_obj = datetime.strptime(stat_date, "%Y-%m-%d").date()
        
        query = db.query(Lead).filter(
            func.date(Lead.created_at) == date_obj
        )
        
        if store_code:
            query = query.filter(Lead.store_code == store_code)
        
        leads = query.all()
        
        total = len(leads)
        sla_1m_pass = sum(1 for l in leads if l.sla_1m_status == 'pass')
        sla_1m_fail = sum(1 for l in leads if l.sla_1m_status == 'fail')
        sla_3m_pass = sum(1 for l in leads if l.sla_3m_status == 'pass')
        sla_3m_fail = sum(1 for l in leads if l.sla_3m_status == 'fail')
        sla_10m_pass = sum(1 for l in leads if l.sla_10m_status == 'pass')
        sla_10m_fail = sum(1 for l in leads if l.sla_10m_status == 'fail')
        pending = sum(1 for l in leads if l.sla_1m_status == 'pending')
        
        return {
            "code": 0,
            "data": {
                "date": stat_date,
                "store_code": store_code,
                "total": total,
                "sla_1m": {
                    "pass": sla_1m_pass,
                    "fail": sla_1m_fail,
                    "pass_rate": (sla_1m_pass / total * 100) if total > 0 else 0
                },
                "sla_3m": {
                    "pass": sla_3m_pass,
                    "fail": sla_3m_fail,
                    "pass_rate": (sla_3m_pass / total * 100) if total > 0 else 0
                },
                "sla_10m": {
                    "pass": sla_10m_pass,
                    "fail": sla_10m_fail,
                    "pass_rate": (sla_10m_pass / total * 100) if total > 0 else 0
                },
                "pending": pending
            }
        }
    except ValueError as e:
        return {
            "code": 400,
            "message": f"Invalid date format: {str(e)}"
        }


@router.get("/daily-by-sales")
async def get_daily_sales_report(
    stat_date: str = Query(...),  # YYYY-MM-DD
    store_code: Optional[str] = Query(None),
    authorization: str = Header(default=""),
    db: Session = Depends(get_db)
):
    """获取按销售拆分的当日报表。"""
    profile = get_auth_profile_from_header(authorization)
    if not profile:
        return {"code": 401, "message": "登录状态失效，请重新登录"}

    target_store = store_code or profile.get("store_code")
    if not target_store:
        return {"code": 400, "message": "缺少门店参数"}

    if store_code and store_code != profile.get("store_code"):
        return {"code": 403, "message": "无权限查看其他门店日报"}

    try:
        date_obj = datetime.strptime(stat_date, "%Y-%m-%d").date()
    except ValueError:
        return {"code": 400, "message": "日期格式错误，请使用 YYYY-MM-DD"}

    sales_rows = get_sales_daily_report(db, date_obj, target_store)
    assigned_total = sum(item.get("assigned_count", 0) for item in sales_rows)
    first_reply_total = sum(item.get("first_reply_count", 0) for item in sales_rows)
    wechat_success_total = sum(item.get("wechat_success_count", 0) for item in sales_rows)

    return {
        "code": 0,
        "data": {
            "stat_date": stat_date,
            "store_code": target_store,
            "summary": {
                "assigned_count": assigned_total,
                "first_reply_count": first_reply_total,
                "wechat_success_count": wechat_success_total,
                "first_reply_rate": (first_reply_total / assigned_total * 100) if assigned_total > 0 else 0,
                "wechat_success_rate": (wechat_success_total / assigned_total * 100) if assigned_total > 0 else 0,
            },
            "sales": sales_rows,
        }
    }
