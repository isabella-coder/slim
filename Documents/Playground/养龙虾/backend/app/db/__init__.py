"""
数据库连接和会话管理
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
from typing import Generator, Iterator
from app.config import settings

# 创建数据库引擎
engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,  # 调试模式下打印 SQL
    pool_size=20,
    max_overflow=40,
)

# 创建会话工厂
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_db() -> Generator[Session, None, None]:
    """依赖注入：获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context() -> Iterator[Session]:
    """上下文管理器：获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """初始化数据库（创建所有表）"""
    # 导入所有模型以注册
    from app.models import (
        Account,
        Store,
        Sales,
        Bot,
        Lead,
        LeadTimeline,
        SalesAllocation,
        OrderOperationAudit,
        DailyStats,
        StoreUser,
        StoreAuthSession,
        StoreOrder,
    )

    # 创建所有表
    from app.models.base import Base
    Base.metadata.create_all(bind=engine)

    print("✓ 数据库表创建完成")
    
    # 初始化数据
    from app.db.init_data import init_data
    init_data()
    print("✓ 初始数据导入完成")
