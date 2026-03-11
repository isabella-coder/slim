"""
抖音开放平台对接
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from typing import Optional

import httpx
from app.config import settings

logger = logging.getLogger(__name__)

# ───── access_token 缓存 ─────

_token_cache: dict = {"access_token": "", "expires_at": 0}


async def get_access_token() -> str:
    """
    获取抖音开放平台 client access_token（自动缓存）
    https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/interface-request-credential/non-user-authorization/access-token
    """
    if _token_cache["access_token"] and time.time() < _token_cache["expires_at"] - 60:
        return _token_cache["access_token"]

    url = "https://open.douyin.com/oauth/client_token/"
    payload = {
        "client_key": settings.DOUYIN_CLIENT_KEY,
        "client_secret": settings.DOUYIN_CLIENT_SECRET,
        "grant_type": "client_credential",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json().get("data", {})

    token = data.get("access_token", "")
    expires_in = data.get("expires_in", 7200)

    _token_cache["access_token"] = token
    _token_cache["expires_at"] = time.time() + expires_in

    logger.info(f"抖音 access_token 刷新成功，有效期 {expires_in}s")
    return token


# ───── 签名验证 ─────

def verify_signature(timestamp: str, nonce: str, body: bytes, signature: str) -> bool:
    """
    验证抖音 Webhook 签名
    sign = sha256(token + timestamp + nonce + body)
    """
    token = settings.DOUYIN_WEBHOOK_TOKEN
    raw = token + timestamp + nonce + body.decode("utf-8")
    expected = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return hmac.compare_digest(expected, signature)


# ───── 发送私信 ─────

async def send_private_message(open_id: str, text: str) -> bool:
    """
    向抖音用户发送私信回复
    https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/im/send-msg
    """
    access_token = await get_access_token()
    url = "https://open.douyin.com/im/send/msg/"
    headers = {
        "Content-Type": "application/json",
        "access-token": access_token,
    }
    payload = {
        "open_id": open_id,
        "msg_type": "text",
        "content": json.dumps({"text": text}),
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            result = resp.json()

        if result.get("err_no") == 0:
            return True
        else:
            logger.error(f"抖音发送私信失败: {result}")
            return False
    except Exception as e:
        logger.error(f"抖音私信 API 异常: {e}")
        return False


# ───── 解析 Webhook 事件 ─────

def parse_im_event(body: dict) -> Optional[dict]:
    """
    从抖音 Webhook 事件体中解析私信消息。
    返回: {"open_id": "...", "content": "...", "msg_id": "..."} 或 None
    """
    event = body.get("event", "")
    # 抖音私信的事件类型
    if event not in ("im", "receive_msg"):
        return None

    content_list = body.get("content", [])
    if not content_list:
        return None

    # content 可能是 JSON string
    if isinstance(content_list, str):
        try:
            content_list = json.loads(content_list)
        except (json.JSONDecodeError, TypeError):
            return None

    # 适配不同格式
    if isinstance(content_list, dict):
        content_list = [content_list]

    for item in content_list:
        msg_type = item.get("msg_type", item.get("message_type", ""))
        if msg_type == "text":
            text_payload = item.get("content", item.get("text", ""))
            if isinstance(text_payload, str):
                try:
                    text_payload = json.loads(text_payload)
                except (json.JSONDecodeError, TypeError):
                    text_payload = {"text": text_payload}
            return {
                "open_id": item.get("open_id") or body.get("from_user_id", ""),
                "content": text_payload.get("text", ""),
                "msg_id": item.get("msg_id", ""),
            }

    return None
