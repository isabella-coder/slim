"""
FastAPI 后端项目说明
"""

# 上海两店多渠道客资中台系统 - FastAPI 后端

## 快速开始

### 1. 环境准备

```bash
# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # macOS/Linux
# 或
venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt
```

### 2. 配置数据库

方式 A：使用 docker-compose（推荐）

```bash
docker-compose up -d
# 这会自动启动 PostgreSQL:5432，默认数据库：lx_center
```

方式 B：本地 PostgreSQL

```bash
# 确保 PostgreSQL 服务运行中
createdb lx_center
```

方式 C：腾讯云 PostgreSQL（远程数据库）

```bash
# 推荐：直接配置完整连接串（优先级高于 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME）
DATABASE_URL=postgresql://<user>:<password>@<腾讯云DB地址>:5432/<db_name>?sslmode=disable

# 如实例要求 SSL，把 sslmode=disable 改为 require 或云实例要求的模式
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 修改 .env 中的配置（如需要）
```

### 4. 运行应用

```bash
python -m app.main

# 或使用 uvicorn
uvicorn app.main:app --reload
```

访问：
- API: http://localhost:8000
- Swagger 文档: http://localhost:8000/docs
- ReDoc 文档: http://localhost:8000/redoc

### 5. 验证安装

```bash
# 健康检查
curl http://localhost:8000/health

# 应该返回：
{
  "status": "ok",
  "app": "上海两店客资中台系统",
  "version": "1.0.0"
}
```

## 项目结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI 应用入口
│   ├── config.py            # 配置管理
│   ├── db/
│   │   ├── __init__.py      # 数据库连接
│   │   └── init_data.py     # 初始化数据
│   ├── models/
│   │   ├── __init__.py      # 数据库模型定义
│   │   └── base.py          # SQLAlchemy Base
│   ├── schemas/
│   │   └── __init__.py      # Pydantic 数据验证模型
│   ├── api/                 # API 路由（待实现）
│   │   ├── accounts.py
│   │   ├── leads.py
│   │   ├── stats.py
│   │   └── wecom.py
│   ├── services/            # 业务逻辑层（待实现）
│   │   ├── account_service.py
│   │   ├── lead_service.py
│   │   ├── allocation_service.py
│   │   └── stats_service.py
│   ├── utils/               # 工具函数（待实现）
│   │   ├── auth.py
│   │   ├── time.py
│   │   └── wecom_client.py
│   └── integrations/        # 第三方集成（待实现）
│       ├── openclaw.py
│       └── wecom.py
├── migrations/              # Alembic 数据库迁移
├── tests/                   # 单元测试（待实现）
├── requirements.txt         # Python 依赖
├── -env.example            # 环境变量示例
├── docker-compose.yml       # Docker 本地开发环境
└── README.md               # 本文件
```

## 核心功能模块（第一阶段）

### 1. 账号管理
- ✅ 模型定义完成（app/models/__init__.py）
- ⏳ API 路由待实现（app/api/accounts.py）
- ⏳ 业务逻辑待实现（app/services/account_service.py）

### 2. 线索接入与存储
- ✅ 模型定义完成（app/models/__init__.py）
- ⏳ API 路由待实现（app/api/leads.py）
- ⏳ 业务逻辑待实现（app/services/lead_service.py）

### 3. 分配轮转
- ✅ 模型定义完成（app/models/__init__.py）
- ⏳ API 路由待实现（app/api/allocation.py）
- ⏳ 轮转引擎待实现（app/services/allocation_service.py）

### 4. 时效追踪（SLA）
- ✅ 模型定义完成（app/models/__init__.py）
- ⏳ 时效计算待实现（app/services/sla_service.py）
- ⏳ 定时任务待实现（app/tasks/sla_check.py）

### 5. 企业微信集成
- ⏳ 企业微信客户端待实现（app/integrations/wecom.py）
- ⏳ 推送服务待实现（app/services/wecom_service.py）
- ⏳ Webhook 接收待实现（app/api/wecom.py）

### 6. 统计报表
- ⏳ 报表生成待实现（app/services/stats_service.py）
- ⏳ API 路由待实现（app/api/stats.py）

## 开发指南

### 添加新的 API 端点

1. **定义 Schema** (app/schemas/__init__.py)
   ```python
   class YourDataCreate(BaseModel):
       field1: str
       field2: int
   ```

2. **定义模型** (app/models/__init__.py)
   ```python
   class YourModel(Base):
       __tablename__ = "your_table"
       # 字段定义...
   ```

3. **实现服务** (app/services/your_service.py)
   ```python
   def create_your_data(db: Session, data: YourDataCreate):
       # 业务逻辑...
       return db_object
   ```

4. **添加路由** (app/api/your_routes.py)
   ```python
   @router.post("/your-data")
   async def create_your_data(data: YourDataCreate, db: Session = Depends(get_db)):
       # 调用服务...
       return result
   ```

5. **路由注册** (app/main.py)
   ```python
   from app.api import your_routes
   app.include_router(your_routes.router, prefix="/api/v1")
   ```

### 数据库迁移

使用 Alembic 管理数据库版本：

```bash
# 创建新的迁移文件
alembic revision --autogenerate -m "Add new table"

# 应用迁移
alembic upgrade head

# 查看迁移历史
alembic history
```

快速执行当前线上加固索引脚本：

```bash
psql "$DATABASE_URL" -f sql/20260310_hardening_indexes.sql
```

### 测试

```bash
# 运行所有测试
pytest

# 运行特定测试文件
pytest tests/test_accounts.py

# 覆盖率报告
pytest --cov=app tests/
```

## 常见问题

**Q: 数据库连接错误？**
A: 检查 PostgreSQL 服务是否运行，.env 中的数据库配置是否正确。
   若使用腾讯云数据库，还需检查：
   1. 安全组/白名单是否放通后端机器 IP；
   2. `DATABASE_URL` 中主机、端口、账号密码是否正确；
   3. `sslmode` 是否与腾讯云实例要求一致。

**Q: 出现 "ModuleNotFoundError"？**
A: 确保虚拟环境已激活，依赖已安装：`pip install -r requirements.txt`

**Q: SQLAlchemy 报错关于表？**
A: 运行应用时会自动创建表。若需要手动创建表，运行：
   ```python
   python -c "from app.db import init_db; init_db()"
   ```

## 下一步

1. ✅ 项目框架已搭建
2. ⏳ 实现各个 API 路由和业务逻辑
3. ⏳ 编写单元测试
4. ⏳ 集成企业微信和 OpenClaw
5. ⏳ 部署到生产环境

## 相关文档

- 系统架构: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- 数据库设计: [docs/DATABASE_SCHEMA.md](../docs/DATABASE_SCHEMA.md)
- API 规范: [docs/API_SPEC.md](../docs/API_SPEC.md)
- 第一阶段需求: [docs/PHASE1_REQUIREMENTS.md](../docs/PHASE1_REQUIREMENTS.md)

---

项目版本: 1.0.0
最后更新: 2026-03-09
