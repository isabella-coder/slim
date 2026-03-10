"""
线索推送服务 —— 将养龙虾系统的线索推送到蔚蓝工单管理系统
通过蔚蓝的 /api/v1/internal/leads/push 接口同步
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime

import httpx
from app.config import settings

logger = logging.getLogger(__name__)


async def push_lead_to_weilan(lead_data: dict, grade_info: dict, sales_name: str) -> dict:
    """
    将线索推送到蔚蓝系统。

    参数:
        lead_data: 线索基础信息
        grade_info: 客户分级结果 {"grade", "score", "reasons", "followup_priority", "suggested_followup_days"}
        sales_name: 分配到的销售姓名

    返回:
        {"success": bool, "message": str, "weilan_order_id": str | None}
    """
    base_url = settings.WEILAN_API_URL
    api_token = settings.WEILAN_API_TOKEN

    if not base_url or not api_token:
        logger.warning("蔚蓝系统 API 未配置，跳过推送")
        return {"success": False, "message": "蔚蓝系统未配置", "weilan_order_id": None}

    # 构建蔚蓝系统能识别的线索对象
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lead_id = lead_data.get("lead_id", f"DY{datetime.now().strftime('%Y%m%d%H%M%S')}{uuid.uuid4().hex[:4]}")

    payload = {
        "lead": {
            "id": lead_id,
            "source": "douyin_ai",
            "platform": lead_data.get("platform", "douyin"),
            "accountCode": lead_data.get("account_code", ""),
            "storeCode": lead_data.get("store_code", "BOP"),

            # 客户信息
            "customerName": lead_data.get("customer_nickname", ""),
            "phone": lead_data.get("customer_phone", ""),
            "wechat": lead_data.get("customer_wechat", ""),
            "carModel": lead_data.get("car_model", ""),
            "serviceType": lead_data.get("service_type", ""),
            "budgetRange": lead_data.get("budget_range", ""),

            # 对话摘要
            "conversationSummary": lead_data.get("conversation_summary", ""),

            # 客户分级
            "grade": grade_info.get("grade", "C"),
            "gradeScore": grade_info.get("score", 0),
            "gradeReasons": grade_info.get("reasons", []),

            # 分配信息
            "assignedSales": sales_name,
            "followupPriority": grade_info.get("followup_priority", "normal"),
            "suggestedFollowupDays": grade_info.get("suggested_followup_days", [7, 30]),

            # 时间
            "createdAt": now_str,
        }
    }

    url = f"{base_url.rstrip('/')}/api/v1/internal/leads/push"
    headers = {
        "Content-Type": "application/json",
        "X-Api-Token": api_token,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            result = resp.json()

        if result.get("success"):
            weilan_id = result.get("data", {}).get("orderId", lead_id)
            logger.info(f"线索推送蔚蓝成功: {lead_id} → 蔚蓝订单 {weilan_id}")
            return {"success": True, "message": "推送成功", "weilan_order_id": weilan_id}
        else:
            logger.error(f"蔚蓝拒绝线索: {result.get('message')}")
            return {"success": False, "message": result.get("message", "蔚蓝拒绝"), "weilan_order_id": None}

    except httpx.TimeoutException:
        logger.error("推送蔚蓝超时")
        return {"success": False, "message": "推送超时", "weilan_order_id": None}
    except Exception as e:
        logger.error(f"推送蔚蓝异常: {e}")
        return {"success": False, "message": str(e), "weilan_order_id": None}
