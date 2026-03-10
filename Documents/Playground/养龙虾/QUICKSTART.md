# 🚀 快速启动指南

## 系统概览

**养龙虾 - 上海两店多渠道客资接入-微信承接中台系统**

核心流程：OpenClaw AI 真人化接待 → 线索创建 → 自动分配（轮转） → SLA 时效管理 → WeChat 完成

---

## ✅ 已完成项

- ✅ 完整项目结构
- ✅ PostgreSQL 数据库设计（8 个模型，45+ 字段）
- ✅ 销售轮转算法（BOP 3 人，龙膜 2 人）
- ✅ SLA 时效计算（1/3/10 分钟）
- ✅ 线索生命周期管理
- ✅ 统计报表引擎
- ✅ FastAPI 后端完整实现（9 个 API 端点）
- ✅ Vue3 Admin 线索管理页面 + 统计页面
- ✅ 核心业务逻辑验证（所有测试通过）

---

## 🔧 环境准备

### 1. 安装依赖

```bash
cd 养龙虾/backend

# 创建虚拟环境（如果还没有）
python3 -m venv .venv

# 激活虚拟环境
source .venv/bin/activate  # macOS/Linux
# 或
.venv\Scripts\activate  # Windows

# 安装 Python 依赖
pip install -r requirements.txt
```

### 2. 启动 PostgreSQL

```bash
# 启动 Docker 容器
docker-compose up -d

# 验证数据库是否运行
docker-compose ps

# 查看数据库日志（如有问题）
docker-compose logs postgres
```

**数据库连接信息：**
- Host: localhost
- Port: 5432
- Database: xls_db
- User: xls_admin
- Password: xls_admin_2024

如果你的数据库在腾讯云：
- 可跳过本地 `docker-compose`，在 `backend/.env` 直接设置 `DATABASE_URL`。
- 示例：`DATABASE_URL=postgresql://<user>:<password>@<腾讯云DB地址>:5432/<db_name>?sslmode=disable`
- 若腾讯云实例启用 SSL，请把 `sslmode=disable` 改为 `require`（或实例要求的模式）。

### 3. 配置环境变量

```bash
cd 养龙虾/backend

# 复制环境模板
cp .env.example .env

# 编辑 .env（如需修改数据库连接等）
# 当前已有正确的默认值
```

---

## 🏃 启动应用

### 方式 1：后端 + Admin 集成启动

```bash
# 终端 1：启动后端
cd 养龙虾/backend
source .venv/bin/activate
python app/main.py

# 应输出：
# INFO:     Uvicorn running on http://127.0.0.1:8000
```

```bash
# 终端 2：启动 Admin 前端
cd 养龙虾/admin
npm install  # 首次只需执行一次
npm run dev

# 应输出：
# ➜  Local:   http://localhost:3000/
```

然后访问：**http://localhost:3000**

### 方式 2：仅后端测试（API 测试）

```bash
python app/main.py

# 访问 Swagger 文档
# http://localhost:8000/docs
```

---

## 📊 API 端点速查

### 线索 API - /api/v1/leads

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | /leads | 创建线索 (OpenClaw 调用) |
| GET | /leads | 查询线索列表 (支持筛选) |
| GET | /leads/{lead_id} | 查询线索详情 |
| POST | /leads/{lead_id}/first-reply | 记录首响 (1 分钟 SLA) |
| POST | /leads/{lead_id}/wechat-invite | 发起加微信 (3 分钟 SLA) |
| PATCH | /leads/{lead_id}/wechat-status | 更新微信状态 (10 分钟 SLA) |

### 统计 API - /api/v1/stats

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | /stats/daily | 日报统计 (含 SLA 通过率) |
| GET | /stats/by-sales | 按销售人员统计 |
| GET | /stats/sla | SLA 合规报告 |

---

## 🧪 测试基本流程

### 1. 创建线索 (模拟 OpenClaw 调用)

```bash
curl -X POST http://localhost:8000/api/v1/leads \
  -H "Content-Type: application/json" \
  -d '{
    "customer_nickname": "小王",
    "customer_phone": "13800138000",
    "car_model": "理想 ONE",
    "service_type": "洗护",
    "budget_range": "500-1000",
    "conversation_summary": "客户对龙膜服务感兴趣，预约明天",
    "platform": "douyin",
    "account_code": "DY-BOP-001"
  }'
```

**应返回：** 
```json
{
  "code": 0,
  "data": {
    "lead_id": "lead_20250309_HHMMSS_001",
    "assigned_to": "销售1",
    "status": "assigned",
    "assigned_at": "2025-03-09T14:00:00Z"
  }
}
```

### 2. 查询线索
```bash
curl http://localhost:8000/api/v1/leads?store_code=BOP&status=assigned
```

### 3. 记录首响 (销售 1 分钟内回应)
```bash
curl -X POST http://localhost:8000/api/v1/leads/lead_20250309_HHMMSS_001/first-reply \
  -H "Content-Type: application/json" \
  -d '{"actor_id": "sales_001"}'
```

### 4. 发起加微信 (销售 3 分钟内发起)
```bash
curl -X POST http://localhost:8000/api/v1/leads/lead_20250309_HHMMSS_001/wechat-invite \
  -H "Content-Type: application/json" \
  -d '{"method": "link", "actor_id": "sales_001"}'
```

### 5. 确认微信状态 (销售确认结果，10 分钟内)
```bash
curl -X PATCH http://localhost:8000/api/v1/leads/lead_20250309_HHMMSS_001/wechat-status \
  -H "Content-Type: application/json" \
  -d '{"new_status": "success", "actor_id": "sales_001"}'
```

### 6. 查看日报统计
```bash
curl http://localhost:8000/api/v1/stats/daily?date=2025-03-09
```

---

## 📱 Admin 后台操作指南

### 线索中心 (Leads 页面)

![功能概览]

- **筛选**: 按门店、状态筛选线索
- **快速操作**: 表格内直接点击「首响」按钮
- **详情查看**: 点击「详情」进入线索详情页
  - 查看客户信息 + 对话摘要
  - 记录首响 / 邀请加微信 / 确认微信状态
  - 自动计算 SLA 通过/失败状态

### 日报统计 (Stats 页面)

- **日期选择**: 选择要查看的日期
- **门店筛选**: 可按单个门店或全部门店统计
- **关键指标**:
  - 线索总数
  - 首响率 (1M SLA)
  - 加微信率 / 成功率 (3M SLA)
  - SLA 通过率

---

## 🔍 数据库验证

### 首次初始化数据库

当后端首次启动时，会自动：
1. 创建所有表结构
2. 初始化 2 个门店、4 个账号、5 个销售、4 个机器人
3. 初始化 2 个轮转指针

验证数据库可连接：

```bash
# 进入 PostgreSQL 容器
docker exec -it postgres_xls_prod psql -U xls_admin -d xls_db

# 查看表
\dt

# 查看门店
SELECT * FROM stores;

# 查看账号
SELECT * FROM accounts;

# 查看销售
SELECT * FROM sales;

# 退出
\q
```

---

## 🚨 常见问题排查

### 问题 1: PostgreSQL 无法启动

```bash
# 检查是否已有同端口的容器
docker ps | grep postgres

# 清理旧容器
docker-compose down -v
docker volume rm 养龙虾_postgres_data  # 如果存在

# 重新启动
docker-compose up -d
```

### 问题 2: Backend 启动失败 - ImportError

```bash
# 确保已安装所有依赖
pip install -r requirements.txt

# 或更新到最新版本
pip install --upgrade -r requirements.txt
```

### 问题 3: Admin 页面无法加载数据

1. 检查后端是否真的在运行 (http://localhost:8000/docs)
2. 检查浏览器控制台是否有 CORS 错误
3. 检查后端 `.env` 文件中的 `DATABASE_URL` 是否正确

### 问题 4: 线索自动分配不工作

```bash
# 检查轮转指针是否被初始化
docker exec -it postgres_xls_prod psql -U xls_admin -d xls_db
SELECT * FROM sales_allocations;
```

---

## 📝 项目文件结构

```
养龙虾/
├── backend/                    # FastAPI 后端
│   ├── app/
│   │   ├── models/            # 8 个 SQLAlchemy 模型
│   │   ├── services/          # 业务逻辑（分配、线索、统计）
│   │   ├── api/               # REST 路由（线索、统计）
│   │   ├── schemas/           # Pydantic 验证模型
│   │   ├── db/                # 数据库初始化 & 连接
│   │   └── main.py            # FastAPI 应用入口
│   ├── requirements.txt        # Python 依赖
│   ├── .env.example            # 环境变量模板
│   └── docker-compose.yml      # PostgreSQL 定义
│
├── admin/                      # Vue3 + Vite Admin 后台
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Leads.vue      # 线索管理（列表+详情）
│   │   │   └── StatsDaily.vue # 日报统计
│   │   ├── utils/
│   │   │   └── api.js         # API 客户端封装
│   │   ├── App.vue            # 主应用
│   │   └── main.js            # 入口
│   ├── package.json
│   └── vite.config.js
│
├── miniprogram/                # 微信小程序（销售app）
│   ├── pages/
│   │   └── leads/             # 线索列表&详情页
│   └── app.js
│
├── docs/                       # 文档
│   ├── ARCHITECTURE.md         # 系统架构
│   ├── DATABASE.md             # 数据库设计
│   └── API.md                  # API 规范
│
├── test_logic.py              # 核心逻辑自检脚本
└── QUICKSTART.md              # 本文件
```

---

## 🔄 2026-03 合并模块优先流程（推荐）

说明：以下流程优先级高于本文历史章节，适用于当前“养龙虾 + 经营工单模块”联调。

### 1. 启动服务

```bash
# 终端 A：8000 线索后端
cd /Users/yushuai/Documents/Playground/养龙虾/backend
source ../.venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 可选（仅 legacy 对照，不作为标准发布链路）：若需要 admin-console 对照测试，再单独启动 8080
# cd /Users/yushuai/Documents/Playground/养龙虾/car-film-mini-program/admin-console
# INTERNAL_API_TOKEN='<YOUR_TOKEN>' python3 server.py
```

### 2. 小程序统一配置键

在微信开发者工具 Storage 中只维护这 3 个键：

1. `api_base_url` = `http://127.0.0.1:8000/api/v1`
2. `store_api_base_url` = `http://127.0.0.1:8000`
3. `store_internal_api_token` = `<YOUR_TOKEN>`

### 3. 登录入口规范

1. 线索链路：`/pages/login`
2. 经营链路：`/pages/login?scene=store`

### 4. P0 快速验收（最小集）

1. 首页兼容入口 -> 工单列表 -> 工单详情 -> 编辑/派工 -> 返回
2. `douyin-leads`、`followup-reminder`、`sales-performance` 可打开且不白屏
3. token 三态：首次进入、过期后重登、退出后重进

### 5. 统一接口冒烟预期

1. `/api/v1/store/internal/orders`、`/api/v1/store/internal/orders/sync`
  - 无 token：401
  - `Authorization: Bearer <store_internal_api_token>`：200
  - `X-Api-Token: <store_internal_api_token>`：200
2. `/api/v1/store/leads`
  - 无 token / 内部 token：401（该接口需要会话 token）

## 🎯 下一步建议

### Phase 2（可选，后续开发）

1. **WeChat 小程序集成**
   - 销售可在微信小程序中查看分配的线索
   - 点击"已首响"、"已加微信"按钮同步状态

2. **企业微信通知**
   - 线索分配时发送通知给销售
   - 线索有重要动态时提醒管理员

3. **OpenClaw 对接**
   - 用真实 OpenClaw API 替换 Mock 实现
   - 支持直接从对话创建线索

4. **AI 线索优化**
   - 根据历史成功率智能分配
   - 支持分配灵活配置（不仅是轮转）

5. **高级报表**
   - 销售 KPI 排行
   - 时段热力图
   - 预测分析

---

## 💬 技术支持

如遇到问题，请检查：
1. 所有依赖是否已安装
2. PostgreSQL 是否正常运行
3. 端口是否被其他进程占用（8000, 3000, 5432）
4. 检查 `.env` 文件是否配置正确

**项目已验证的所有核心业务逻辑均可正常工作！** ✅

---

*最后更新: 2025-03-09*
