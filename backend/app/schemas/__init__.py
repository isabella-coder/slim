"""
Pydantic 数据验证模型
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# ============ 账号相关 Schema ============

class AccountCreate(BaseModel):
    """创建账号"""
    account_code: str
    platform: str  # 'douyin' / 'xiaohongshu'
    source_channel: str  # 'live' / 'invest' / 'natural'
    account_name: Optional[str] = None
    store_code: str
    bot_instance_id: Optional[str] = None


class AccountResponse(BaseModel):
    """账号响应"""
    account_code: str
    platform: str
    source_channel: str
    account_name: Optional[str]
    store_code: str
    bot_instance_id: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============ 线索相关 Schema ============

class LeadCreate(BaseModel):
    """创建线索 - 由 OpenClaw 调用"""
    platform: str
    source_channel: Optional[str] = None
    account_code: str
    customer_nickname: Optional[str] = None
    customer_contact: Optional[str] = None
    car_model: Optional[str] = None
    service_type: Optional[str] = None
    budget_range: Optional[str] = None
    consultation_topic: Optional[str] = None
    conversation_summary: Optional[str] = None


class LeadResponse(BaseModel):
    """线索响应"""
    lead_id: str
    platform: str
    source_channel: Optional[str]
    account_code: str
    store_code: str
    customer_nickname: Optional[str]
    car_model: Optional[str]
    service_type: Optional[str]
    budget_range: Optional[str]
    assigned_to: Optional[str] = None
    assigned_at: Optional[datetime] = None
    status: str
    wechat_status: str
    sla_1m_status: str
    sla_3m_status: str
    sla_10m_status: str
    first_reply_at: Optional[datetime] = None
    wechat_invited_at: Optional[datetime] = None
    wechat_result_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class FirstReplyData(BaseModel):
    """记录首响"""
    actor_id: str
    actor_type: str = "sales"  # or "bot"
    description: Optional[str] = None


class WechatInviteData(BaseModel):
    """记录加微信发起"""
    actor_id: str
    actor_type: str = "sales"
    method: str  # "customer_sent" / "sales_sent" / "link"
    description: Optional[str] = None


class WechatStatusUpdate(BaseModel):
    """更新微信状态"""
    wechat_status: str
    actor_id: str
    actor_type: str = "sales"
    confirmed_at: Optional[datetime] = None
    notes: Optional[str] = None


# ============ 统计相关 Schema ============

class DailyStatsResponse(BaseModel):
    """日报统计"""
    stat_date: str
    store_code: Optional[str]
    
    lead_count: int
    first_reply_count: int
    wechat_invite_count: int
    wechat_success_count: int
    
    first_reply_rate: Optional[float] = None
    wechat_invite_rate: Optional[float] = None
    wechat_success_rate: Optional[float] = None
    
    sla_1m_pass_count: int = 0
    sla_3m_pass_count: int = 0
    sla_10m_pass_count: int = 0

    class Config:
        from_attributes = True


# ============ 列表响应包装 ============

class PaginatedResponse(BaseModel):
    """分页响应包装"""
    total: int
    page: int
    page_size: int
    items: List


class ApiResponse(BaseModel):
    """标准 API 响应"""
    code: int = 0
    message: str = "success"
    data: Optional[dict] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
