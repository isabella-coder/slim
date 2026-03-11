"""
聊天 API 路由
1. POST /chat/douyin/webhook  — 抖音开放平台 Webhook 回调
2. GET  /chat/douyin/webhook  — 抖音 Webhook 验证（challenge）
3. POST /chat/test            — 本地测试聊天接口（无需抖音环境）
"""
from __future__ import annotations

import logging
from fastapi import APIRouter, Request, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from app.config import settings
from app.services.chat_engine import handle_message
from app.integrations.douyin import (
    verify_signature,
    parse_im_event,
    send_private_message,
)
from app.db import get_db_context
from app.models import Account

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


# ───── 抖音 Webhook ─────

@router.get("/douyin/webhook")
async def douyin_webhook_verify(
    challenge: str = Query(..., description="抖音验证挑战码"),
):
    """
    抖音开放平台 Webhook URL 验证
    https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/im/
    """
    return {"challenge": challenge}


@router.post("/douyin/webhook")
async def douyin_webhook_receive(request: Request):
    """
    接收抖音私信 Webhook 事件 → AI 回复
    """
    body_bytes = await request.body()
    body = await request.json()

    # 签名验证（生产环境必须开启）
    if settings.DOUYIN_WEBHOOK_TOKEN:
        timestamp = request.headers.get("X-Douyin-Timestamp", "")
        nonce = request.headers.get("X-Douyin-Nonce", "")
        signature = request.headers.get("X-Douyin-Signature", "")
        if not verify_signature(timestamp, nonce, body_bytes, signature):
            logger.warning("抖音 Webhook 签名验证失败")
            raise HTTPException(status_code=403, detail="Invalid signature")

    # 解析私信消息
    msg = parse_im_event(body)
    if not msg or not msg["content"]:
        # 非文本消息或其他事件类型，直接 200 避免重试
        return {"err_no": 0, "err_tips": "ok"}

    open_id = msg["open_id"]
    user_text = msg["content"]

    # 从 Webhook 上下文确定 account_code（可通过配置映射或 body 信息）
    account_code = _resolve_account_code(body)
    store_code = _resolve_store_code(account_code)

    logger.info(f"抖音私信: open_id={open_id}, account={account_code}, text={user_text[:50]}")

    # 调用对话引擎
    result = await handle_message(
        platform="douyin",
        account_code=account_code,
        open_id=open_id,
        user_message=user_text,
        store_code=store_code,
    )

    # 发送回复
    await send_private_message(open_id, result["reply"])

    return {"err_no": 0, "err_tips": "ok"}


# ───── 本地测试接口 ─────

class TestChatRequest(BaseModel):
    """测试聊天请求"""
    platform: str = "douyin"
    account_code: str = "DY-BOP-001"
    open_id: str = "test_user_001"
    message: str


class TestChatResponse(BaseModel):
    """测试聊天响应"""
    reply: str
    session_id: str
    extracted_info: dict
    info_sufficient: bool
    lead_created: bool
    lead_id: Optional[str] = None


@router.post("/test", response_model=TestChatResponse)
async def test_chat(req: TestChatRequest):
    """
    本地测试聊天接口 — 模拟客户发消息，直接返回 AI 回复。
    无需抖音环境，方便开发调试。
    """
    store_code = _resolve_store_code(req.account_code)

    result = await handle_message(
        platform=req.platform,
        account_code=req.account_code,
        open_id=req.open_id,
        user_message=req.message,
        store_code=store_code,
    )

    return TestChatResponse(**result)


# ───── 辅助函数 ─────

# 账号→门店映射缓存
_account_store_map: dict[str, str] = {}


def _resolve_account_code(body: dict) -> str:
    """
    从 Webhook body 中推断 account_code。
    抖音开放平台会在 Webhook 中附带应用信息，可根据 client_key 区分账号。
    简化方案：从配置中读取默认账号。
    """
    # 如果 body 中有 to_user_id（被私信的账号），可以用来映射
    to_user_id = body.get("to_user_id", "")
    account_map = settings.get_douyin_account_map()
    if to_user_id and to_user_id in account_map:
        return account_map[to_user_id]
    # 默认账号
    return settings.DOUYIN_DEFAULT_ACCOUNT


def _resolve_store_code(account_code: str) -> str:
    """根据 account_code 查找绑定的 store_code"""
    if account_code in _account_store_map:
        return _account_store_map[account_code]

    # 从数据库查询
    try:
        with get_db_context() as db:
            account = db.query(Account).filter(
                Account.account_code == account_code
            ).first()
            if account:
                _account_store_map[account_code] = account.store_code
                return account.store_code
    except Exception:
        pass

    # 回退：从账号编码推断
    if "BOP" in account_code.upper():
        return "BOP"
    elif "LM" in account_code.upper():
        return "LM"
    return "BOP"
