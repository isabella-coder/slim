"""
分配和轮转业务逻辑
"""

from datetime import datetime
from sqlalchemy.orm import Session
from app.models import Lead, SalesAllocation, Sales
import uuid


def get_next_sales(db: Session, store_code: str) -> Sales:
    """
    根据门店获取下一个应该分配的销售
    实现轮转逻辑
    """
    # 获取轮转指针
    allocation = db.query(SalesAllocation).filter(
        SalesAllocation.store_code == store_code
    ).first()
    
    if not allocation:
        raise ValueError(f"Store {store_code} has no allocation config")
    
    # 获取该门店的所有销售
    sales_list = db.query(Sales).filter(
        Sales.store_code == store_code,
        Sales.is_active == True
    ).order_by(Sales.sales_id).all()
    
    if not sales_list:
        raise ValueError(f"Store {store_code} has no active sales")
    
    # 根据指针获取当前销售
    current_index = allocation.current_sales_index % len(sales_list)
    next_sales = sales_list[current_index]
    
    # 更新指针（准备下一个）
    allocation.current_sales_index = (current_index + 1) % len(sales_list)
    allocation.last_assigned_sales_id = next_sales.sales_id
    allocation.last_assigned_at = datetime.utcnow()
    allocation.rotation_count += 1
    
    db.commit()
    
    return next_sales


def assign_lead_to_sales(db: Session, lead: Lead) -> Lead:
    """
    将线索分配给销售（自动轮转）
    """
    # 获取下一个销售
    next_sales = get_next_sales(db, lead.store_code)
    
    # 更新线索
    lead.assigned_sales_id = next_sales.sales_id
    lead.assigned_at = datetime.utcnow()
    lead.status = "assigned"
    
    db.commit()
    
    return lead
