"""
会话管理器 —— 追踪每个抖音/小红书用户的多轮对话状态
使用内存存储（可切换 Redis）
"""
from __future__ import annotations

import time
from typing import Optional
from dataclasses import dataclass, field


@dataclass
class ChatMessage:
    role: str           # "user" / "assistant"
    content: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class ChatSession:
    """一个客户的完整对话会话"""
    session_id: str             # "{platform}:{account_code}:{open_id}"
    platform: str               # "douyin" / "xiaohongshu"
    account_code: str           # 绑定的账号
    open_id: str                # 平台用户唯一标识
    messages: list[ChatMessage] = field(default_factory=list)
    extracted_info: dict = field(default_factory=dict)
    lead_created: bool = False
    lead_id: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    # 提取到的客户信息字段
    REQUIRED_FIELDS = {"customer_nickname", "car_model", "service_type"}
    OPTIONAL_FIELDS = {"budget_range", "customer_phone", "customer_wechat"}

    def add_message(self, role: str, content: str):
        self.messages.append(ChatMessage(role=role, content=content))
        self.updated_at = time.time()

    def get_history(self, max_turns: int = 20) -> list[dict]:
        """返回 LLM 可用的 messages 列表（最近 N 轮）"""
        recent = self.messages[-max_turns * 2:] if len(self.messages) > max_turns * 2 else self.messages
        return [{"role": m.role, "content": m.content} for m in recent]

    def update_extracted(self, info: dict):
        """合并新提取的信息"""
        for k, v in info.items():
            if v and v.strip():
                self.extracted_info[k] = v.strip()
        self.updated_at = time.time()

    def is_info_sufficient(self) -> bool:
        """判断是否收集到了最低必要信息"""
        return all(self.extracted_info.get(f) for f in self.REQUIRED_FIELDS)

    def is_expired(self, ttl_seconds: int = 3600) -> bool:
        """会话是否过期（默认 1 小时无活动）"""
        return (time.time() - self.updated_at) > ttl_seconds


class SessionStore:
    """内存会话存储（生产环境可替换为 Redis 实现）"""

    def __init__(self, ttl_seconds: int = 3600):
        self._sessions: dict[str, ChatSession] = {}
        self._ttl = ttl_seconds

    @staticmethod
    def make_session_id(platform: str, account_code: str, open_id: str) -> str:
        return f"{platform}:{account_code}:{open_id}"

    def get_or_create(self, platform: str, account_code: str, open_id: str) -> ChatSession:
        sid = self.make_session_id(platform, account_code, open_id)
        session = self._sessions.get(sid)

        if session and not session.is_expired(self._ttl):
            return session

        # 过期或不存在 → 新建
        session = ChatSession(
            session_id=sid,
            platform=platform,
            account_code=account_code,
            open_id=open_id,
        )
        self._sessions[sid] = session
        return session

    def get(self, session_id: str) -> Optional[ChatSession]:
        session = self._sessions.get(session_id)
        if session and not session.is_expired(self._ttl):
            return session
        return None

    def remove(self, session_id: str):
        self._sessions.pop(session_id, None)

    def cleanup_expired(self):
        """清理所有过期会话"""
        expired = [sid for sid, s in self._sessions.items() if s.is_expired(self._ttl)]
        for sid in expired:
            del self._sessions[sid]


# 全局单例
session_store = SessionStore(ttl_seconds=3600)
