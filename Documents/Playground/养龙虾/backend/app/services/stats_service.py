"""
统计报表服务
"""

from datetime import datetime, date
import logging
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import Lead, DailyStats
from sqlalchemy.dialects.postgresql import insert as pg_insert


logger = logging.getLogger(__name__)


def _upsert_daily_stats_snapshot(db: Session, snapshot: dict) -> None:
    """将当日门店统计写入 daily_stats，幂等更新。"""
    store_code = snapshot.get("store_code")
    stat_date = snapshot.get("stat_date")
    if not store_code or not stat_date:
        return

    payload = {
        "stat_id": f"stat_{stat_date}_{store_code}_all_all"[:50],
        "stat_date": stat_date,
        "store_code": store_code,
        "platform": "all",
        "source_channel": "all",
        "lead_count": int(snapshot.get("lead_count", 0) or 0),
        "first_reply_count": int(snapshot.get("first_reply_count", 0) or 0),
        "wechat_invite_count": int(snapshot.get("wechat_invite_count", 0) or 0),
        "wechat_success_count": int(snapshot.get("wechat_success_count", 0) or 0),
        "first_reply_rate": float(snapshot.get("first_reply_rate", 0) or 0),
        "wechat_invite_rate": float(snapshot.get("wechat_invite_rate", 0) or 0),
        "wechat_success_rate": float(snapshot.get("wechat_success_rate", 0) or 0),
        "sla_1m_pass_count": int(snapshot.get("sla_1m_pass_count", 0) or 0),
        "sla_3m_pass_count": int(snapshot.get("sla_3m_pass_count", 0) or 0),
        "sla_10m_pass_count": int(snapshot.get("sla_10m_pass_count", 0) or 0),
        "updated_at": datetime.utcnow(),
    }

    # 首选 PostgreSQL 原生 upsert，匹配唯一维度索引。
    try:
        stmt = pg_insert(DailyStats).values(**payload)
        update_fields = {
            "lead_count": stmt.excluded.lead_count,
            "first_reply_count": stmt.excluded.first_reply_count,
            "wechat_invite_count": stmt.excluded.wechat_invite_count,
            "wechat_success_count": stmt.excluded.wechat_success_count,
            "first_reply_rate": stmt.excluded.first_reply_rate,
            "wechat_invite_rate": stmt.excluded.wechat_invite_rate,
            "wechat_success_rate": stmt.excluded.wechat_success_rate,
            "sla_1m_pass_count": stmt.excluded.sla_1m_pass_count,
            "sla_3m_pass_count": stmt.excluded.sla_3m_pass_count,
            "sla_10m_pass_count": stmt.excluded.sla_10m_pass_count,
            "updated_at": stmt.excluded.updated_at,
        }
        stmt = stmt.on_conflict_do_update(
            index_elements=["stat_date", "store_code", "platform", "source_channel"],
            set_=update_fields,
        )
        db.execute(stmt)
        db.commit()
        return
    except Exception as exc:
        db.rollback()
        logger.warning("daily_stats upsert fallback: %s", exc)

    # 兜底：兼容未创建唯一索引的环境。
    existing = db.query(DailyStats).filter(
        DailyStats.stat_date == payload["stat_date"],
        DailyStats.store_code == payload["store_code"],
        DailyStats.platform == payload["platform"],
        DailyStats.source_channel == payload["source_channel"],
    ).first()

    if existing:
        for key, value in payload.items():
            if key in ("stat_id", "stat_date", "store_code", "platform", "source_channel"):
                continue
            setattr(existing, key, value)
    else:
        db.add(DailyStats(**payload))

    db.commit()


def get_daily_stats(db: Session, stat_date: date, store_code: str = None) -> dict:
    """
    获取日报统计
    """
    query = db.query(Lead).filter(
        func.date(Lead.created_at) == stat_date
    )
    
    if store_code:
        query = query.filter(Lead.store_code == store_code)
    
    leads = query.all()
    
    if not leads:
        result = {
            "stat_date": str(stat_date),
            "store_code": store_code,
            "lead_count": 0,
            "first_reply_count": 0,
            "wechat_invite_count": 0,
            "wechat_success_count": 0,
            "first_reply_rate": 0,
            "wechat_invite_rate": 0,
            "wechat_success_rate": 0,
            "sla_1m_pass_count": 0,
            "sla_3m_pass_count": 0,
            "sla_10m_pass_count": 0,
        }
        _upsert_daily_stats_snapshot(db, result)
        return result
    
    total = len(leads)
    first_reply = sum(1 for l in leads if l.first_reply_at is not None)
    wechat_invite = sum(1 for l in leads if l.wechat_invited_at is not None)
    wechat_success = sum(1 for l in leads if l.wechat_status == 'success')
    sla_1m_pass = sum(1 for l in leads if l.sla_1m_status == 'pass')
    sla_3m_pass = sum(1 for l in leads if l.sla_3m_status == 'pass')
    sla_10m_pass = sum(1 for l in leads if l.sla_10m_status == 'pass')
    
    result = {
        "stat_date": str(stat_date),
        "store_code": store_code,
        "lead_count": total,
        "first_reply_count": first_reply,
        "wechat_invite_count": wechat_invite,
        "wechat_success_count": wechat_success,
        "first_reply_rate": (first_reply / total * 100) if total > 0 else 0,
        "wechat_invite_rate": (wechat_invite / total * 100) if total > 0 else 0,
        "wechat_success_rate": (wechat_success / total * 100) if total > 0 else 0,
        "sla_1m_pass_count": sla_1m_pass,
        "sla_3m_pass_count": sla_3m_pass,
        "sla_10m_pass_count": sla_10m_pass,
    }
    _upsert_daily_stats_snapshot(db, result)
    return result


def get_sales_stats(db: Session, store_code: str, days: int = 7) -> list:
    """
    按销售统计
    """
    from app.models import Sales
    from datetime import timedelta
    
    cutoff_date = datetime.now() - timedelta(days=days)
    
    sales_list = db.query(Sales).filter(
        Sales.store_code == store_code,
        Sales.is_active == True
    ).all()
    
    result = []
    
    for sales in sales_list:
        leads = db.query(Lead).filter(
            Lead.assigned_sales_id == sales.sales_id,
            Lead.created_at >= cutoff_date
        ).all()
        
        if not leads:
            continue
        
        total = len(leads)
        first_reply = sum(1 for l in leads if l.first_reply_at is not None)
        wechat_success = sum(1 for l in leads if l.wechat_status == 'success')
        sla_1m_pass = sum(1 for l in leads if l.sla_1m_status == 'pass')
        
        result.append({
            "sales_id": sales.sales_id,
            "sales_name": sales.sales_name,
            "assigned_count": total,
            "first_reply_count": first_reply,
            "first_reply_rate": (first_reply / total * 100) if total > 0 else 0,
            "wechat_success_count": wechat_success,
            "wechat_success_rate": (wechat_success / total * 100) if total > 0 else 0,
            "sla_1m_pass_rate": (sla_1m_pass / total * 100) if total > 0 else 0,
        })
    
    return result


def get_sales_daily_report(db: Session, stat_date: date, store_code: str) -> list:
    """按销售返回某一天的日报数据。"""
    from app.models import Sales

    sales_list = db.query(Sales).filter(
        Sales.store_code == store_code,
        Sales.is_active == True,
    ).all()

    result = []

    for sales in sales_list:
        leads = db.query(Lead).filter(
            Lead.assigned_sales_id == sales.sales_id,
            func.date(Lead.created_at) == stat_date,
        ).all()

        total = len(leads)
        first_reply = sum(1 for l in leads if l.first_reply_at is not None)
        wechat_invite = sum(1 for l in leads if l.wechat_invited_at is not None)
        wechat_success = sum(1 for l in leads if l.wechat_status == 'success')
        sla_1m_pass = sum(1 for l in leads if l.sla_1m_status == 'pass')

        result.append({
            "sales_id": sales.sales_id,
            "sales_name": sales.sales_name,
            "assigned_count": total,
            "first_reply_count": first_reply,
            "wechat_invite_count": wechat_invite,
            "wechat_success_count": wechat_success,
            "first_reply_rate": (first_reply / total * 100) if total > 0 else 0,
            "wechat_success_rate": (wechat_success / total * 100) if total > 0 else 0,
            "sla_1m_pass_rate": (sla_1m_pass / total * 100) if total > 0 else 0,
        })

    result.sort(key=lambda item: item["assigned_count"], reverse=True)
    return result
