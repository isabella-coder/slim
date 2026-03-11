"""
线索业务逻辑服务
"""

from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import Lead, LeadTimeline, Account
from app.config import settings
import uuid


def create_lead(db: Session, lead_data: dict) -> Lead:
    """
    创建线索
    """
    # 找到对应账号和门店
    account = db.query(Account).filter(
        Account.account_code == lead_data['account_code']
    ).first()
    
    if not account or not account.is_active:
        raise ValueError(f"Account {lead_data['account_code']} not found or inactive")
    
    # 创建线索
    lead_id = f"lead_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    
    lead = Lead(
        lead_id=lead_id,
        platform=lead_data.get('platform'),
        source_channel=lead_data.get('source_channel'),
        account_code=lead_data['account_code'],
        bot_instance_id=account.bot_instance_id,
        store_code=account.store_code,  # 从账号继承门店
        customer_nickname=lead_data.get('customer_nickname'),
        car_model=lead_data.get('car_model'),
        service_type=lead_data.get('service_type'),
        budget_range=lead_data.get('budget_range'),
        consultation_topic=lead_data.get('consultation_topic'),
        conversation_summary=lead_data.get('conversation_summary'),
        wechat_status='pending',
        status='created'
    )
    
    db.add(lead)
    db.flush()  # 先让ID生成
    
    # 创建时效追踪记录
    timeline_id = f"tl_{uuid.uuid4().hex[:12]}"
    timeline = LeadTimeline(
        timeline_id=timeline_id,
        lead_id=lead_id,
        event_type='created',
        event_at=datetime.utcnow(),
        actor_type='bot',
        description='线索创建'
    )
    db.add(timeline)
    db.commit()
    
    return lead


def record_first_reply(db: Session, lead_id: str, actor_id: str) -> Lead:
    """
    记录首响
    """
    lead = db.query(Lead).filter(Lead.lead_id == lead_id).first()
    if not lead:
        raise ValueError(f"Lead {lead_id} not found")
    
    lead.first_reply_at = datetime.utcnow()
    lead.status = 'first_reply'
    
    # 检查 SLA 1分钟
    assigned_at = lead.assigned_at or lead.created_at
    delta = (lead.first_reply_at - assigned_at).total_seconds() / 60
    
    if delta <= settings.SLA_1M_MINUTES:
        lead.sla_1m_status = 'pass'
    else:
        lead.sla_1m_status = 'fail'
    
    db.commit()
    
    return lead


def record_wechat_invite(db: Session, lead_id: str, actor_id: str, method: str) -> Lead:
    """
    记录发起加微信
    """
    lead = db.query(Lead).filter(Lead.lead_id == lead_id).first()
    if not lead:
        raise ValueError(f"Lead {lead_id} not found")
    
    lead.wechat_invited_at = datetime.utcnow()
    lead.wechat_status = method  # 'customer_sent' / 'sales_sent' / 'link'
    lead.status = 'wechat_invited'
    
    # 检查 SLA 3分钟
    assigned_at = lead.assigned_at or lead.created_at
    delta = (lead.wechat_invited_at - assigned_at).total_seconds() / 60
    
    if delta <= settings.SLA_3M_MINUTES:
        lead.sla_3m_status = 'pass'
    else:
        lead.sla_3m_status = 'fail'
    
    db.commit()
    
    return lead


def update_wechat_status(db: Session, lead_id: str, new_status: str, actor_id: str) -> Lead:
    """
    更新微信状态
    """
    lead = db.query(Lead).filter(Lead.lead_id == lead_id).first()
    if not lead:
        raise ValueError(f"Lead {lead_id} not found")
    
    lead.wechat_result_at = datetime.utcnow()
    lead.wechat_status = new_status
    
    if new_status == 'success':
        lead.status = 'completed'
    elif new_status in ['refused', 'failed']:
        lead.status = 'completed'
    
    # 检查 SLA 10分钟
    assigned_at = lead.assigned_at or lead.created_at
    delta = (lead.wechat_result_at - assigned_at).total_seconds() / 60
    
    if delta <= settings.SLA_10M_MINUTES:
        lead.sla_10m_status = 'pass'
    else:
        lead.sla_10m_status = 'fail'
    
    db.commit()
    
    return lead


def get_lead_by_id(db: Session, lead_id: str) -> Lead:
    """
    获取线索详情
    """
    return db.query(Lead).filter(Lead.lead_id == lead_id).first()


def get_leads(
    db: Session,
    store_code: str = None,
    status: str = None,
    assigned_sales_id: str = None,
    created_from: datetime = None,
    created_to: datetime = None,
    skip: int = 0,
    limit: int = 20,
) -> tuple:
    """
    获取线索列表（分页）
    """
    query = db.query(Lead)
    
    if store_code:
        query = query.filter(Lead.store_code == store_code)
    if status:
        query = query.filter(Lead.status == status)
    if assigned_sales_id:
        query = query.filter(Lead.assigned_sales_id == assigned_sales_id)
    if created_from:
        query = query.filter(Lead.created_at >= created_from)
    if created_to:
        query = query.filter(Lead.created_at < created_to)
    
    total = query.count()
    leads = query.order_by(Lead.created_at.desc()).offset(skip).limit(limit).all()
    
    return leads, total
