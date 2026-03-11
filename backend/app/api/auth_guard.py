"""API 鉴权辅助函数。"""

from typing import Optional

from app.services.auth_service import get_profile_by_token


def parse_bearer_token(authorization: str = "") -> str:
    """从 Authorization 头中提取 Bearer token。"""
    if not authorization:
        return ""

    parts = authorization.split(" ", 1)
    if len(parts) != 2:
        return ""

    scheme, token = parts
    if scheme.lower() != "bearer":
        return ""

    return token.strip()


def get_auth_profile_from_header(authorization: str = "") -> Optional[dict]:
    """从 Authorization 头解析并校验当前登录销售。"""
    token = parse_bearer_token(authorization)
    if not token:
        return None
    return get_profile_by_token(token)
