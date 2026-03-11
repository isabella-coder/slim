"""
信息提取器 —— 通过 LLM JSON Mode 从对话中提取结构化客户信息
"""
from __future__ import annotations

import json
import logging
import re
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

EXTRACT_PROMPT = """你是一个信息提取助手。请从以下客户对话中提取结构化信息。
如果某个字段在对话中没有提到，值设为 null。不要编造。

需要提取的字段：
- customer_nickname: 客户昵称/称呼
- car_model: 车型（品牌+型号，如 "宝马X5"、"特斯拉Model 3"）
- service_type: 需要的服务类型（如"贴膜"、"改色"、"隐形车衣"、"镀晶"、"内饰"等）
- budget_range: 预算范围（如"5000-8000"、"1万左右"）
- customer_phone: 手机号
- customer_wechat: 微信号

严格输出 JSON，不要输出其它内容：
{"customer_nickname": ..., "car_model": ..., "service_type": ..., "budget_range": ..., "customer_phone": ..., "customer_wechat": ...}
"""


async def extract_info_from_messages(messages: list[dict]) -> dict:
    """
    调用 LLM 从对话历史中提取客户信息。
    messages: [{"role": "user"/"assistant", "content": "..."}]
    返回: {"customer_nickname": "...", "car_model": "...", ...}
    """
    # 构造对话摘要给 LLM
    conversation_text = "\n".join(
        f"{'客户' if m['role'] == 'user' else '客服'}: {m['content']}"
        for m in messages
    )

    llm_messages = [
        {"role": "system", "content": EXTRACT_PROMPT},
        {"role": "user", "content": conversation_text},
    ]

    try:
        result = await _call_llm(llm_messages, temperature=0.0)
        parsed = _parse_json_response(result)
        # 过滤 null / 空字符串
        return {k: v for k, v in parsed.items() if v}
    except Exception as e:
        logger.warning(f"信息提取失败: {e}")
        fallback = _fallback_extract(messages)
        if fallback:
            logger.info(f"启用本地兜底提取: {fallback}")
        return fallback


def _parse_json_response(text: str) -> dict:
    """从 LLM 返回中解析 JSON（兼容 markdown code block）"""
    text = text.strip()
    # 去除 ```json ... ``` 包裹
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])
    return json.loads(text)


async def _call_llm(messages: list[dict], temperature: float = 0.0) -> str:
    """
    调用 LLM API（兼容 OpenAI 格式：DeepSeek / 通义千问 / OpenAI / 本地 Ollama）
    """
    url = settings.LLM_API_URL.rstrip("/") + "/chat/completions"
    headers = {"Content-Type": "application/json", "User-Agent": "claude-code/1.0"}
    if settings.LLM_API_KEY:
        headers["Authorization"] = f"Bearer {settings.LLM_API_KEY}"

    payload = {
        "model": settings.LLM_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": 500,
    }

    async with httpx.AsyncClient(timeout=settings.LLM_TIMEOUT_SECONDS) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        msg = data["choices"][0]["message"]
        return msg.get("content") or msg.get("reasoning_content") or ""


def _fallback_extract(messages: list[dict]) -> dict:
    """LLM 不可用时，基于规则的最小信息提取兜底。"""
    user_text = "\n".join(
        str(m.get("content", "")) for m in messages if str(m.get("role", "")) == "user"
    )
    if not user_text.strip():
        return {}

    info = {
        "customer_nickname": "",
        "car_model": "",
        "service_type": "",
        "budget_range": "",
        "customer_phone": "",
        "customer_wechat": "",
    }

    # 客户称呼
    m = re.search(r"(?:我叫|叫我|称呼我)\s*([\u4e00-\u9fa5A-Za-z0-9]{1,12})", user_text)
    if m:
        info["customer_nickname"] = m.group(1)
    else:
        m2 = re.search(r"([\u4e00-\u9fa5]{1,4}(?:先生|女士|小姐))", user_text)
        if m2:
            info["customer_nickname"] = m2.group(1)

    # 车型（常见品牌）
    car_match = re.search(
        r"(宝马|奔驰|奥迪|特斯拉|保时捷|路虎|大众|丰田|本田|比亚迪|理想|蔚来|小鹏)[A-Za-z0-9\-\u4e00-\u9fa5 ]{0,10}",
        user_text,
    )
    if car_match:
        info["car_model"] = car_match.group(0).strip()

    # 服务类型
    service_keywords = ["隐形车衣", "车衣", "改色", "贴膜", "车窗膜", "镀晶", "内饰"]
    for key in service_keywords:
        if key in user_text:
            info["service_type"] = key
            break

    # 预算
    budget_match = re.search(r"(?:预算|价位|大概)\s*([0-9]{3,6}(?:\s*[-~到]\s*[0-9]{3,6})?(?:\s*[万wW])?)", user_text)
    if budget_match:
        info["budget_range"] = budget_match.group(1).replace(" ", "")

    # 手机号
    phone_match = re.search(r"(1[3-9][0-9]{9})", user_text)
    if phone_match:
        info["customer_phone"] = phone_match.group(1)

    # 微信号
    wechat_match = re.search(r"(?:微信|vx|Vx|VX)[:：\s]*([A-Za-z][A-Za-z0-9_-]{5,19})", user_text)
    if wechat_match:
        info["customer_wechat"] = wechat_match.group(1)

    # 兜底：有车型和项目时补一个默认称呼，避免线索创建被阻塞
    if not info["customer_nickname"] and info["car_model"] and info["service_type"]:
        info["customer_nickname"] = "意向客户"

    return {k: v for k, v in info.items() if v}
