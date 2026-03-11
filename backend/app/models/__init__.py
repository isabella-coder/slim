"""
数据库模型定义
"""

from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, ForeignKey, Numeric, JSON, Enum, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from app.models.base import Base


class Store(Base):
    """门店表"""
    __tablename__ = "store"

    store_code = Column(String(20), primary_key=True, index=True)
    store_name = Column(String(100), nullable=False)
    address = Column(Text, nullable=True)
    region = Column(String(50), nullable=True)
    main_service = Column(Text, nullable=True)
    wechat_group_id = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    accounts = relationship("Account", back_populates="store")
    sales = relationship("Sales", back_populates="store")
    leads = relationship("Lead", back_populates="store")
    allocations = relationship("SalesAllocation", back_populates="store")


class Account(Base):
    """账号表（抖音、小红书等各平台账号）"""
    __tablename__ = "account"

    account_code = Column(String(30), primary_key=True, index=True)
    platform = Column(String(20), nullable=False)  # 'douyin' / 'xiaohongshu'
    source_channel = Column(String(20), nullable=False)  # 'live' / 'invest' / 'natural'
    account_name = Column(String(100), nullable=True)
    store_code = Column(String(20), ForeignKey("store.store_code"), nullable=False)
    bot_instance_id = Column(String(50), ForeignKey("bot.bot_instance_id"), nullable=True)
    is_active = Column(Boolean, default=True)
    opened_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    store = relationship("Store", back_populates="accounts")
    bot = relationship("Bot", back_populates="accounts")
    leads = relationship("Lead", back_populates="account")


class Sales(Base):
    """销售人员表"""
    __tablename__ = "sales"

    sales_id = Column(String(20), primary_key=True, index=True)
    sales_name = Column(String(50), nullable=False)
    store_code = Column(String(20), ForeignKey("store.store_code"), nullable=False)
    wechat_id = Column(String(100), nullable=True)
    mobile = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    store = relationship("Store", back_populates="sales")
    leads = relationship("Lead", back_populates="assigned_sales")


class Bot(Base):
    """机器人配置表（OpenClaw 实例）"""
    __tablename__ = "bot"

    bot_instance_id = Column(String(50), primary_key=True, index=True)
    platform = Column(String(20), nullable=True)
    store_code = Column(String(20), ForeignKey("store.store_code"), nullable=False)
    bot_name = Column(String(100), nullable=True)
    personality_style = Column(String(20), nullable=True)  # 'direct' / 'consultant' / 'lifestyle'
    system_prompt = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # 关系
    store = relationship("Store")
    accounts = relationship("Account", back_populates="bot")


class Lead(Base):
    """线索表（核心业务表）"""
    __tablename__ = "lead"
    __table_args__ = (
        Index("idx_lead_assigned_sales_id", "assigned_sales_id"),
        Index("idx_lead_account_code", "account_code"),
        Index("idx_lead_store_status_created_at", "store_code", "status", "created_at"),
    )

    lead_id = Column(String(50), primary_key=True, index=True)
    
    # 来源信息
    platform = Column(String(20), nullable=False, index=True)
    source_channel = Column(String(20), nullable=True)
    account_code = Column(String(30), ForeignKey("account.account_code"), nullable=False)
    bot_instance_id = Column(String(50), nullable=True)
    store_code = Column(String(20), ForeignKey("store.store_code"), nullable=False, index=True)
    
    # 客户信息
    customer_nickname = Column(String(100), nullable=True)
    customer_contact = Column(String(20), nullable=True)
    
    # 需求信息（机器人识别和提取）
    car_model = Column(String(100), nullable=True)
    service_type = Column(String(50), nullable=True)
    budget_range = Column(String(50), nullable=True)
    consultation_topic = Column(Text, nullable=True)
    conversation_summary = Column(Text, nullable=True)
    
    # 分配信息
    assigned_sales_id = Column(String(20), ForeignKey("sales.sales_id"), nullable=True)
    assigned_at = Column(DateTime, nullable=True)
    
    # 时效追踪
    first_reply_at = Column(DateTime, nullable=True)
    wechat_invited_at = Column(DateTime, nullable=True)
    wechat_result_at = Column(DateTime, nullable=True)
    
    # 微信状态
    wechat_status = Column(String(20), default='pending', nullable=False)
    # pending / invited / customer_sent / sales_sent / success / refused / failed
    
    # SLA 状态
    sla_1m_status = Column(String(10), default='pending')  # 'pass' / 'fail' / 'pending'
    sla_3m_status = Column(String(10), default='pending')
    sla_10m_status = Column(String(10), default='pending')
    
    # 主状态
    status = Column(String(20), default='created', index=True)
    # created / first_reply / wechat_invited / wechat_success / completed
    
    # 转派和升级
    transfer_count = Column(Integer, default=0)
    escalation_count = Column(Integer, default=0)
    escalated_to = Column(String(100), nullable=True)
    escalation_reason = Column(Text, nullable=True)
    
    # 系统字段
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    store = relationship("Store", back_populates="leads")
    account = relationship("Account", back_populates="leads")
    assigned_sales = relationship("Sales", back_populates="leads")
    timeline = relationship("LeadTimeline", back_populates="lead", cascade="all, delete-orphan")


class LeadTimeline(Base):
    """线索时效追踪表"""
    __tablename__ = "lead_timeline"
    __table_args__ = (
        Index("idx_lead_timeline_lead_event_at", "lead_id", "event_at"),
    )

    timeline_id = Column(String(50), primary_key=True, index=True)
    lead_id = Column(String(50), ForeignKey("lead.lead_id"), nullable=False)
    
    event_type = Column(String(30), nullable=False)
    # 'created' / 'assigned' / 'first_reply' / 'wechat_invited' / 
    # 'wechat_result' / 'transferred' / 'escalated' / 'completed'
    
    event_at = Column(DateTime, nullable=False)
    actor_id = Column(String(50), nullable=True)
    actor_type = Column(String(20), nullable=True)  # 'sales' / 'bot' / 'system'
    
    duration_ms = Column(Integer, nullable=True)  # 距离上一个事件的毫秒数
    sla_target_ms = Column(Integer, nullable=True)
    sla_passed = Column(Boolean, nullable=True)
    
    description = Column(Text, nullable=True)
    extra_data = Column("metadata", JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # 关系
    lead = relationship("Lead", back_populates="timeline")


class SalesAllocation(Base):
    """销售轮转指针表"""
    __tablename__ = "sales_allocation"

    allocation_id = Column(String(50), primary_key=True, index=True)
    store_code = Column(String(20), ForeignKey("store.store_code"), nullable=False, unique=True)
    
    current_sales_index = Column(Integer, default=0)
    last_assigned_sales_id = Column(String(20), nullable=True)
    last_assigned_at = Column(DateTime, nullable=True)
    
    rotation_count = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    store = relationship("Store", back_populates="allocations")


class OrderOperationAudit(Base):
    """订单操作审计表"""
    __tablename__ = "order_operation_audit"
    __table_args__ = (
        Index("idx_order_audit_store_created_at", "store_code", "created_at"),
        Index("idx_order_audit_target_created_at", "target_id", "created_at"),
        Index("idx_order_audit_actor_created_at", "actor_sales_id", "created_at"),
    )

    audit_id = Column(String(60), primary_key=True, index=True)

    store_code = Column(String(20), ForeignKey("store.store_code"), nullable=False, index=True)
    actor_sales_id = Column(String(20), nullable=False, index=True)
    actor_sales_name = Column(String(50), nullable=True)
    actor_role = Column(String(20), nullable=False, default="sales")

    target_type = Column(String(20), nullable=False, default="order")
    target_id = Column(String(80), nullable=False, index=True)
    action = Column(String(40), nullable=False)
    result = Column(String(20), nullable=False, default="success", index=True)

    before_status = Column(String(30), nullable=True)
    after_status = Column(String(30), nullable=True)
    error_code = Column(String(60), nullable=True)
    error_message = Column(Text, nullable=True)
    source = Column(String(80), nullable=True)
    extra_data = Column("metadata", JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class DailyStats(Base):
    """日报统计表（聚合数据）"""
    __tablename__ = "daily_stats"
    __table_args__ = (
        UniqueConstraint("stat_date", "store_code", "platform", "source_channel", name="uq_daily_stats_dim"),
    )

    stat_id = Column(String(50), primary_key=True, index=True)
    stat_date = Column(String(10), nullable=False)  # YYYY-MM-DD
    
    store_code = Column(String(20), ForeignKey("store.store_code"), nullable=True)
    platform = Column(String(20), nullable=True)
    source_channel = Column(String(20), nullable=True)
    
    lead_count = Column(Integer, default=0)
    first_reply_count = Column(Integer, default=0)
    wechat_invite_count = Column(Integer, default=0)
    wechat_success_count = Column(Integer, default=0)
    
    first_reply_rate = Column(Numeric(5, 2), nullable=True)
    wechat_invite_rate = Column(Numeric(5, 2), nullable=True)
    wechat_success_rate = Column(Numeric(5, 2), nullable=True)
    
    sla_1m_pass_count = Column(Integer, default=0)
    sla_3m_pass_count = Column(Integer, default=0)
    sla_10m_pass_count = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StoreUser(Base):
    """经营系统账号表（原 admin-console users.json）"""
    __tablename__ = "store_user"
    __table_args__ = (
        Index("idx_store_user_role_active", "role", "is_active"),
        Index("idx_store_user_store_code", "store_code"),
    )

    username = Column(String(60), primary_key=True, index=True)
    name = Column(String(60), nullable=False)
    role = Column(String(20), nullable=False, default="sales")
    store_code = Column(String(20), nullable=True)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class StoreAuthSession(Base):
    """经营系统登录会话表（替代 8080 会话缓存）"""
    __tablename__ = "store_auth_session"
    __table_args__ = (
        Index("idx_store_auth_session_username", "username"),
        Index("idx_store_auth_session_expires_at", "expires_at"),
    )

    session_token = Column(String(80), primary_key=True, index=True)
    username = Column(String(60), ForeignKey("store_user.username"), nullable=False)
    user_payload = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)

    user = relationship("StoreUser")


class StoreOrder(Base):
    """经营系统订单表（原 admin-console orders.json）"""
    __tablename__ = "store_order"
    __table_args__ = (
        Index("idx_store_order_updated_at", "updated_at_dt"),
        Index("idx_store_order_store_status", "store_name", "status"),
        Index("idx_store_order_lead_source_grade", "lead_source", "lead_grade"),
        Index("idx_store_order_sales", "sales_brand_text"),
    )

    order_id = Column(String(80), primary_key=True, index=True)
    status = Column(String(30), nullable=False, default="未完工")
    version = Column(Integer, nullable=False, default=0)

    store_name = Column(String(120), nullable=True)
    sales_brand_text = Column(String(80), nullable=True)
    customer_name = Column(String(120), nullable=True)
    phone = Column(String(30), nullable=True)
    car_model = Column(String(120), nullable=True)

    lead_source = Column(String(40), nullable=True)
    lead_grade = Column(String(10), nullable=True)
    lead_status = Column(String(30), nullable=True)

    created_at_text = Column(String(20), nullable=True)
    updated_at_text = Column(String(20), nullable=True)
    created_at_dt = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at_dt = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    payload = Column(JSON, nullable=False)
