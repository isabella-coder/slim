# 上海两店多渠道客资接入与微信承接中台系统

## 项目概览

**系统定位**：以上海两店为核心的多渠道、多账号、多机器人协同的微信承接中台系统

### 系统架构

```
【渠道账号层】
抖音-BOP → Bot-DY-BOP
抖音-龙膜 → Bot-DY-LM
小红书-BOP → Bot-XHS-BOP
小红书-龙膜 → Bot-XHS-LM
          ↓
【OpenClaw智能层】
- 真人化聊天、意图识别、提取、推进
          ↓
【业务中台】(小程序后台 + FastAPI)
- 线索主表、门店轮转、SLA时效、统计报表
          ↓
【企业微信执行层】
- BOP店群、龙膜店群、通知推送、状态回写
          ↓
【经营分析层】
- 两店加微信效率、首响率、销售效率、微信成功率
```

## 项目结构

```
.
├── docs/                    # 项目文档
│   ├── 01-架构设计.md
│   ├── 02-数据库设计.md
│   ├── 03-API接口定义.md
│   ├── 04-业务规则.md
│   └── 05-部署指南.md
│
├── backend/                 # Python FastAPI后端
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py         # FastAPI应用入口
│   │   ├── config.py       # 配置管理
│   │   ├── models/         # 数据模型(SQLAlchemy)
│   │   ├── schemas/        # 请求/响应schema
│   │   ├── api/            # API路由
│   │   ├── services/       # 业务逻辑层
│   │   ├── utils/          # 工具函数
│   │   └── integrations/   # 外部集成(OpenClaw、企业微信)
│   ├── migrations/         # Alembic数据库迁移
│   ├── tests/              # 单元测试
│   ├── requirements.txt    # Python依赖
│   ├── .env.example        # 环境变量示例
│   └── docker-compose.yml  # 本地开发环境
│
├── admin/                  # Vue3 Admin前端
│   ├── src/
│   │   ├── components/     # 可复用组件
│   │   ├── pages/          # 页面
│   │   ├── views/          # 视图
│   │   ├── api/            # API调用
│   │   ├── store/          # Pinia状态管理
│   │   ├── utils/          # 工具函数
│   │   ├── App.vue
│   │   └── main.js
│   ├── public/
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example
│
├── miniprogram/            # 微信小程序
│   ├── pages/              # 小程序页面
│   ├── components/         # 小程序组件
│   ├── utils/              # 工具函数
│   ├── api/                # API调用
│   ├── assets/             # 资源文件
│   ├── app.json            # 小程序配置
│   ├── app.wxss
│   └── project.config.json
│
└── .gitignore
```

## 快速开始

### 1. 后端启动

```bash
cd backend
python -m venv venv
source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
python -m app.main
```

访问: http://localhost:8000  
文档: http://localhost:8000/docs

### 2. Admin前端启动

```bash
cd admin
npm install
npm run dev
```

访问: http://localhost:5173

### 3. 小程序（微信开发者工具打开）

## 第一阶段开发清单

- [ ] 账号管理 - 创建、编辑、门店绑定
- [ ] 线索中心 - 入库、展示、详情
- [ ] OpenClaw接口对接 - 预留接口+Mock数据
- [ ] 两店分配轮转 - BOP 3人、龙膜 2人
- [ ] SLA时效规则 - 1/3/10分钟记录和检查
- [ ] 企业微信推送 - 新线索通知、超时升级
- [ ] 基础报表 - 线索数、首响率、微信率

## 关键业务规则

### 账号与门店硬绑定
- BOP账号 → BOP店 (不可穿插)
- 龙膜账号 → 龙膜店 (不可穿插)

### 两店独立轮转
- BOP店: 3名销售独立轮转
- 龙膜店: 2名销售独立轮转

### 1/3/10分钟SLA规则
- **1分钟**：首响（销售第一次回复）
- **3分钟**：发起加微信动作
- **10分钟**：确认加微信结果

### 加微信状态标准化
- 未发起
- 已发起加微信
- 客户已发微信号
- 销售已发微信号
- 已加上微信
- 拒绝加微信
- 加微信失败
- 待确认
- 继续平台沟通

## OpenClaw集成

### 接入流程
1. 机器人接收平台消息
2. 调用OpenClaw API进行智能响应
3. OpenClaw返回结构化数据 (意图、车型、项目、预算等)
4. 后台记录结构化字段，触发分配逻辑

### 预留接口
- `POST /api/openclaw/receive` - 接收机器人消息
- `POST /api/openclaw/webhook` - 处理OpenClaw回调
- `GET /api/openclaw/mock` - Mock数据用于测试

## 数据库

PostgreSQL 本地配置：
```
host: localhost
port: 5432
database: lx_center
user: postgres
password: password
```

使用 docker-compose 自动启动：
```bash
cd backend
docker-compose up -d
```

## 部署指南

详见 [部署指南](docs/05-部署指南.md)

## 联系方式

项目经理: [邮箱]  
技术支持: [邮箱]
