"""
FastAPI 应用主入口
"""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db import init_db

# 配置日志
logging.basicConfig(
    level=settings.LOG_LEVEL,
    format=settings.LOG_FORMAT,
)
logger = logging.getLogger(__name__)

# 创建应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ 启动和关闭事件 ============

@app.on_event("startup")
async def startup_event():
    """应用启动事件"""
    logger.info(f"🚀 {settings.APP_NAME} 正在启动...")
    
    # 初始化数据库
    try:
        init_db()
        logger.info("✓ 数据库初始化成功")
    except Exception as e:
        logger.error(f"✗ 数据库初始化失败: {e}")
        raise
    
    logger.info(f"✓ 服务启动成功: http://{settings.HOST}:{settings.PORT}")
    logger.info(f"✓ API 文档: http://{settings.HOST}:{settings.PORT}/docs")


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭事件"""
    logger.info("💤 应用正在关闭...")


# ============ 健康检查 ============

@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


# ============ 路由注册 ============

from app.api import leads, stats, chat, auth, audit, store

app.include_router(leads.router, prefix="/api/v1")
app.include_router(stats.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(store.router, prefix="/api/v1")


# ============ 根路由 ============

@app.get("/")
async def root():
    """根路由"""
    return {
        "message": f"欢迎使用 {settings.APP_NAME}",
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "openapi": "/openapi.json",
    }


# ============ 错误处理（待实现）============

# 全局异常处理器会在这里添加


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
