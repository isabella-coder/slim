"""
FastAPI 应用配置管理
"""

import os
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """应用全局配置"""

    # 应用基础信息
    APP_NAME: str = "上海两店客资中台系统"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "False") == "True"

    # 服务配置
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # JWT 配置
    JWT_SECRET_KEY: str = os.getenv(
        "JWT_SECRET_KEY", "your-secret-key-change-in-production"
    )
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24  # 24 小时

    # 小程序轻量登录配置
    MINIPROGRAM_SALES_PASSWORD: str = os.getenv("MINIPROGRAM_SALES_PASSWORD", "sale123")
    MINIPROGRAM_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("MINIPROGRAM_TOKEN_EXPIRE_MINUTES", "10080"))
    MINIPROGRAM_LOGIN_MAX_RETRIES: int = int(os.getenv("MINIPROGRAM_LOGIN_MAX_RETRIES", "5"))
    MINIPROGRAM_LOGIN_WINDOW_MINUTES: int = int(os.getenv("MINIPROGRAM_LOGIN_WINDOW_MINUTES", "15"))
    MINIPROGRAM_LOGIN_BLOCK_MINUTES: int = int(os.getenv("MINIPROGRAM_LOGIN_BLOCK_MINUTES", "10"))

    # 数据库配置
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: int = int(os.getenv("DB_PORT", "5432"))
    DB_USER: str = os.getenv("DB_USER", "postgres")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "password")
    DB_NAME: str = os.getenv("DB_NAME", "lx_center")
    DATABASE_URL_DIRECT: str = os.getenv("DATABASE_URL", "").strip()
    DB_SSL_MODE: str = os.getenv("DB_SSL_MODE", "").strip()
    DB_CONNECT_TIMEOUT: int = int(os.getenv("DB_CONNECT_TIMEOUT", "10"))

    @property
    def DATABASE_URL(self) -> str:
        """构建数据库连接字符串"""
        if self.DATABASE_URL_DIRECT:
            return self.DATABASE_URL_DIRECT

        return (
            f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@"
            f"{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
            + self._database_url_query
        )

    @property
    def _database_url_query(self) -> str:
        query_parts = []
        if self.DB_SSL_MODE:
            query_parts.append(f"sslmode={self.DB_SSL_MODE}")
        if self.DB_CONNECT_TIMEOUT > 0:
            query_parts.append(f"connect_timeout={self.DB_CONNECT_TIMEOUT}")
        if not query_parts:
            return ""
        return "?" + "&".join(query_parts)

    # 企业微信配置
    WECOM_CORP_ID: str = os.getenv("WECOM_CORP_ID", "")
    WECOM_SECRET: str = os.getenv("WECOM_SECRET", "")
    WECOM_AGENT_ID: int = int(os.getenv("WECOM_AGENT_ID", "0"))
    WECOM_TOKEN: str = os.getenv("WECOM_TOKEN", "")

    # OpenClaw 配置
    OPENCLAW_API_URL: str = os.getenv("OPENCLAW_API_URL", "http://localhost:9000")
    OPENCLAW_API_KEY: str = os.getenv("OPENCLAW_API_KEY", "mock-key")

    # 时效规则配置（单位：分钟）
    SLA_1M_MINUTES: int = 1
    SLA_3M_MINUTES: int = 3
    SLA_10M_MINUTES: int = 10

    # LLM 配置（兼容 OpenAI API 格式：DeepSeek / 通义千问 / OpenAI / Ollama）
    LLM_API_URL: str = os.getenv("LLM_API_URL", "https://api.deepseek.com/v1")
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "deepseek-chat")
    LLM_TIMEOUT_SECONDS: int = int(os.getenv("LLM_TIMEOUT_SECONDS", "12"))

    # 抖音开放平台配置
    DOUYIN_CLIENT_KEY: str = os.getenv("DOUYIN_CLIENT_KEY", "")
    DOUYIN_CLIENT_SECRET: str = os.getenv("DOUYIN_CLIENT_SECRET", "")
    DOUYIN_WEBHOOK_TOKEN: str = os.getenv("DOUYIN_WEBHOOK_TOKEN", "")
    DOUYIN_DEFAULT_ACCOUNT: str = os.getenv("DOUYIN_DEFAULT_ACCOUNT", "DY-BOP-001")
    DOUYIN_ACCOUNT_MAP: str = os.getenv("DOUYIN_ACCOUNT_MAP", "{}")

    def get_douyin_account_map(self) -> dict:
        """抖音 open_id → account_code 映射（从 JSON 字符串解析）"""
        import json
        try:
            return json.loads(self.DOUYIN_ACCOUNT_MAP)
        except (json.JSONDecodeError, TypeError):
            return {}

    # 蔚蓝工单系统对接
    WEILAN_API_URL: str = os.getenv("WEILAN_API_URL", "http://localhost:8080")
    WEILAN_API_TOKEN: str = os.getenv("WEILAN_API_TOKEN", "")

    # 日志配置
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    class Config:
        env_file = ".env"
        case_sensitive = True


# 全局设置实例
settings = Settings()
