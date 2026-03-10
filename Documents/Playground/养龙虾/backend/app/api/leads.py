"""
线索 API 路由
"""

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session
from app.db import get_db
from app.schemas import LeadCreate, LeadResponse, FirstReplyData, WechatInviteData, WechatStatusUpdate, PaginatedResponse
from app.services.lead_service import (
    create_lead, record_first_reply, record_wechat_invite, 
    update_wechat_status, get_lead_by_id, get_leads
)
from app.services.allocation_service import assign_lead_to_sales
from app.models import Lead
from app.api.auth_guard import get_auth_profile_from_header
from datetime import datetime, timedelta
from typing import Optional

router = APIRouter(prefix="/leads", tags=["leads"])


@router.post("")
async def create_new_lead(lead_data: LeadCreate, db: Session = Depends(get_db)):
    """创建线索并自动分配"""
    try:
        # 创建线索
        lead = create_lead(db, lead_data.dict())
        
        # 自动分配给销售
        lead = assign_lead_to_sales(db, lead)
        
        return {
            "code": 0,
            "data": {
                "lead_id": lead.lead_id,
                "platform": lead.platform,
                "account_code": lead.account_code,
                "store_code": lead.store_code,
                "customer_nickname": lead.customer_nickname,
                "car_model": lead.car_model,
                "service_type": lead.service_type,
                "assigned_to": lead.assigned_sales_id,
                "assigned_at": lead.assigned_at,
                "status": lead.status,
                "wechat_status": lead.wechat_status,
                "sla_1m_status": lead.sla_1m_status,
                "sla_3m_status": lead.sla_3m_status,
                "sla_10m_status": lead.sla_10m_status,
                "created_at": lead.created_at,
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def list_leads(
    store_code: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    created_from: Optional[str] = Query(None),  # YYYY-MM-DD
    created_to: Optional[str] = Query(None),  # YYYY-MM-DD
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    authorization: str = Header(default=""),
    db: Session = Depends(get_db)
):
    """获取线索列表"""
    if not get_auth_profile_from_header(authorization):
        return {"code": 401, "message": "登录状态失效，请重新登录"}

    created_from_dt = None
    created_to_dt = None
    try:
        if created_from:
            created_from_dt = datetime.strptime(created_from, "%Y-%m-%d")
        if created_to:
            # 结束日期按自然日闭区间处理，查询时转成次日 00:00 的开区间
            created_to_dt = datetime.strptime(created_to, "%Y-%m-%d") + timedelta(days=1)
    except ValueError:
        return {"code": 400, "message": "日期格式错误，请使用 YYYY-MM-DD"}

    skip = (page - 1) * page_size
    leads, total = get_leads(
        db, 
        store_code=store_code, 
        status=status,
        assigned_sales_id=assigned_to,
        created_from=created_from_dt,
        created_to=created_to_dt,
        skip=skip, 
        limit=page_size
    )
    
    items = []
    for lead in leads:
        items.append({
            "lead_id": lead.lead_id,
            "platform": lead.platform,
            "account_code": lead.account_code,
            "store_code": lead.store_code,
            "customer_nickname": lead.customer_nickname,
            "car_model": lead.car_model,
            "service_type": lead.service_type,
            "budget_range": lead.budget_range,
            "assigned_to": lead.assigned_sales_id,
            "status": lead.status,
            "wechat_status": lead.wechat_status,
            "sla_1m_status": lead.sla_1m_status,
            "created_at": lead.created_at,
        })
    
    return {
        "code": 0,
        "data": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "items": items
        }
    }


@router.get("/{lead_id}")
async def get_lead_detail(
    lead_id: str,
    authorization: str = Header(default=""),
    db: Session = Depends(get_db)
):
    """获取线索详情"""
    if not get_auth_profile_from_header(authorization):
        return {"code": 401, "message": "登录状态失效，请重新登录"}

    lead = get_lead_by_id(db, lead_id)
    
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    return {
        "code": 0,
        "data": {
            "lead_id": lead.lead_id,
            "platform": lead.platform,
            "account_code": lead.account_code,
            "store_code": lead.store_code,
            "customer_nickname": lead.customer_nickname,
            "car_model": lead.car_model,
            "service_type": lead.service_type,
            "budget_range": lead.budget_range,
            "assigned_to": lead.assigned_sales_id,
            "assigned_at": lead.assigned_at,
            "status": lead.status,
            "wechat_status": lead.wechat_status,
            "sla_1m_status": lead.sla_1m_status,
            "sla_3m_status": lead.sla_3m_status,
            "sla_10m_status": lead.sla_10m_status,
            "first_reply_at": lead.first_reply_at,
            "wechat_invited_at": lead.wechat_invited_at,
            "wechat_result_at": lead.wechat_result_at,
            "conversation_summary": lead.conversation_summary,
            "created_at": lead.created_at,
        }
    }


@router.post("/{lead_id}/first-reply")
async def record_lead_first_reply(
    lead_id: str,
    data: FirstReplyData,
    authorization: str = Header(default=""),
    db: Session = Depends(get_db)
):
    """记录首响"""
    if not get_auth_profile_from_header(authorization):
        return {"code": 401, "message": "登录状态失效，请重新登录"}

    try:
        lead = record_first_reply(db, lead_id, data.actor_id)
        
        return {
            "code": 0,
            "data": {
                "lead_id": lead.lead_id,
                "first_reply_at": lead.first_reply_at,
                "sla_1m_status": lead.sla_1m_status,
                "status": lead.status,
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{lead_id}/wechat-invite")
async def record_lead_wechat_invite(
    lead_id: str,
    data: WechatInviteData,
    authorization: str = Header(default=""),
    db: Session = Depends(get_db)
):
    """记录加微信发起"""
    if not get_auth_profile_from_header(authorization):
        return {"code": 401, "message": "登录状态失效，请重新登录"}

    try:
        lead = record_wechat_invite(db, lead_id, data.actor_id, data.method)
        
        return {
            "code": 0,
            "data": {
                "lead_id": lead.lead_id,
                "wechat_invited_at": lead.wechat_invited_at,
                "wechat_status": lead.wechat_status,
                "sla_3m_status": lead.sla_3m_status,
                "status": lead.status,
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/{lead_id}/wechat-status")
async def update_lead_wechat_status(
    lead_id: str,
    data: WechatStatusUpdate,
    authorization: str = Header(default=""),
    db: Session = Depends(get_db)
):
    """更新微信状态"""
    if not get_auth_profile_from_header(authorization):
        return {"code": 401, "message": "登录状态失效，请重新登录"}

    try:
        lead = update_wechat_status(db, lead_id, data.wechat_status, data.actor_id)
        
        return {
            "code": 0,
            "data": {
                "lead_id": lead.lead_id,
                "wechat_result_at": lead.wechat_result_at,
                "wechat_status": lead.wechat_status,
                "sla_10m_status": lead.sla_10m_status,
                "status": lead.status,
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
