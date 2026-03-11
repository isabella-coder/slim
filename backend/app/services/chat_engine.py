"""
智能体对话引擎 —— 汽车美容门店 AI 客服
接收客户消息 → 生成回复 → 提取信息 → 信息足够时自动创建线索
"""
from __future__ import annotations

import logging
import httpx
from app.config import settings
from app.services.session_manager import ChatSession, session_store
from app.services.info_extractor import extract_info_from_messages
from app.services.lead_service import create_lead
from app.services.allocation_service import assign_lead_to_sales
from app.services.lead_grader import grade_lead
from app.services.lead_pusher import push_lead_to_weilan
from app.db import get_db_context

logger = logging.getLogger(__name__)

# ───── 门店人设 Prompt（两个门店风格不同）─────

STORE_PERSONAS = {
    "BOP": {
        "name": "BOP 汽车美容",
        "style": "年轻活力、潮流专业",
        "intro": "我们是 BOP 汽车美容，主打高端改色贴膜和隐形车衣，在上海有很好的口碑。",
        "services": "隐形车衣(TPU/TPH)、车身改色膜、车窗贴膜、镀晶、内饰翻新",
    },
    "LM": {
        "name": "龙膜旗舰店",
        "style": "专业稳重、品牌权威",
        "intro": "我们是龙膜(LLumar)上海授权旗舰店，专注高端车窗膜和漆面保护膜。",
        "services": "龙膜车窗膜、龙膜漆面保护膜(PPF)、龙膜隐形车衣、专业贴膜施工",
    },
}


def _build_system_prompt(store_code: str, extracted_info: dict) -> str:
    """根据门店生成系统 Prompt"""
    persona = STORE_PERSONAS.get(store_code, STORE_PERSONAS["BOP"])
    missing = _get_missing_fields(extracted_info)

    prompt = f"""你是「{persona['name']}」的专业 AI 客服顾问，风格{persona['style']}。
{persona['intro']}
我们提供的服务包括：{persona['services']}。

## 你的目标
1. 热情专业地回答客户关于汽车美容的问题
2. 在自然对话中收集以下信息（不要像问卷一样逐个追问）：
   - 客户称呼
   - 车型（品牌+型号）
   - 想做的项目/服务
   - 预算范围（可选）
3. 当客户表达了明确意向后，引导客户加微信进一步沟通

## 对话策略
- 先解答客户疑问，建立信任，再自然过渡到需求收集
- 每条回复控制在 80 字以内，口语化，带适当 emoji
- 遇到不确定的技术问题，说"这个具体要看您的车型，加我微信发车的照片我帮您确认哦"
- 客户问价格时给出一个大致范围，然后说"具体价格要看您车型和材料选择，微信详细聊~"
- 不要用"亲"称呼客户

## 当前已知客户信息
"""
    if extracted_info:
        for k, v in extracted_info.items():
            prompt += f"- {k}: {v}\n"
    else:
        prompt += "- （暂未收集到信息）\n"

    if missing:
        prompt += f"\n还需要了解：{', '.join(missing)}\n"
    else:
        prompt += "\n✅ 关键信息已收集完毕，请引导客户加微信！\n"

    return prompt


def _get_missing_fields(extracted_info: dict) -> list[str]:
    """返回还缺少的必要字段名称"""
    field_labels = {
        "customer_nickname": "客户称呼",
        "car_model": "车型",
        "service_type": "想做的项目",
    }
    return [
        label for field, label in field_labels.items()
        if not extracted_info.get(field)
    ]


async def handle_message(
    platform: str,
    account_code: str,
    open_id: str,
    user_message: str,
    store_code: str,
) -> dict:
    """
    处理一条客户消息，返回 AI 回复 + 状态信息。

    返回:
    {
        "reply": "AI 的回复文本",
        "session_id": "会话ID",
        "extracted_info": {...},
        "info_sufficient": bool,
        "lead_created": bool,
        "lead_id": str | None,
    }
    """
    # 1. 获取/创建会话
    session = session_store.get_or_create(platform, account_code, open_id)
    session.add_message("user", user_message)

    # 2. 生成 AI 回复
    system_prompt = _build_system_prompt(store_code, session.extracted_info)
    reply = await _generate_reply(system_prompt, session)
    session.add_message("assistant", reply)

    # 3. 异步提取信息（从整段对话中提取）
    new_info = await extract_info_from_messages(session.get_history())
    session.update_extracted(new_info)

    # 4. 检查是否信息足够 → 自动创建线索
    lead_created = False
    lead_id = None

    if session.is_info_sufficient() and not session.lead_created:
        try:
            lead_id = _create_lead_from_session(session, store_code)
            session.lead_created = True
            session.lead_id = lead_id
            lead_created = True
            logger.info(f"自动创建线索: {lead_id} (会话: {session.session_id})")
        except Exception as e:
            logger.error(f"创建线索失败: {e}")

    return {
        "reply": reply,
        "session_id": session.session_id,
        "extracted_info": session.extracted_info,
        "info_sufficient": session.is_info_sufficient(),
        "lead_created": lead_created,
        "lead_id": lead_id or session.lead_id,
    }


async def _generate_reply(system_prompt: str, session: ChatSession) -> str:
    """调用 LLM 生成对话回复"""
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(session.get_history())

    url = settings.LLM_API_URL.rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json", "User-Agent": "claude-code/1.0"}
    if settings.LLM_API_KEY:
        headers["Authorization"] = f"Bearer {settings.LLM_API_KEY}"

    payload = {
        "model": settings.LLM_MODEL,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 800,
    }

    try:
        async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SECONDS) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            msg = data["choices"][0]["message"]
            return msg.get("content") or msg.get("reasoning_content") or ""
    except Exception as e:
        logger.error(f"LLM 调用失败: {e}")
        return "不好意思，系统开了个小差 😅 请稍后再试，或者直接加我微信聊~"


def _create_lead_from_session(session: ChatSession, store_code: str) -> str:
    """根据会话信息创建线索并自动分配，同时评分+推送蔚蓝"""
    info = session.extracted_info
    # 生成对话摘要
    summary_lines = []
    for m in session.messages[-10:]:
        prefix = "客户" if m.role == "user" else "AI"
        summary_lines.append(f"{prefix}: {m.content}")
    conversation_summary = "\n".join(summary_lines)

    # 客户质量分级
    grade_info = grade_lead(info)
    logger.info(f"客户分级: {grade_info['grade']}({grade_info['score']}分) - {grade_info['reasons']}")

    lead_data = {
        "platform": session.platform,
        "source_channel": "private_message",
        "account_code": session.account_code,
        "customer_nickname": info.get("customer_nickname"),
        "car_model": info.get("car_model"),
        "service_type": info.get("service_type"),
        "budget_range": info.get("budget_range"),
        "customer_contact": info.get("customer_phone") or info.get("customer_wechat"),
        "consultation_topic": info.get("service_type"),
        "conversation_summary": conversation_summary,
    }

    with get_db_context() as db:
        lead = create_lead(db, lead_data)
        lead = assign_lead_to_sales(db, lead)
        lead_id = lead.lead_id
        sales_name = lead.assigned_sales.sales_name if lead.assigned_sales else ""
        lead_store = lead.store_code

    # 异步推送到蔚蓝（补充 lead_id 和 store_code）
    lead_data["lead_id"] = lead_id
    lead_data["store_code"] = lead_store
    lead_data["customer_phone"] = info.get("customer_phone", "")
    lead_data["customer_wechat"] = info.get("customer_wechat", "")

    # 存储分级信息到 session 供后续使用
    session.grade_info = grade_info

    # 启动后台推送（不阻塞回复）
    import asyncio
    asyncio.ensure_future(_push_lead_async(lead_data, grade_info, sales_name))

    return lead_id


async def _push_lead_async(lead_data: dict, grade_info: dict, sales_name: str):
    """后台异步推送线索到蔚蓝系统"""
    try:
        result = await push_lead_to_weilan(lead_data, grade_info, sales_name)
        if not result["success"]:
            logger.warning(f"蔚蓝推送失败: {result['message']}")
    except Exception as e:
        logger.error(f"蔚蓝推送异常: {e}")
