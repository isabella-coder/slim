# 项目概览文档

## 快速导航

### 📚 文档
- **[系统架构](docs/ARCHITECTURE.md)** - 完整架构设计和模块划分
- **[数据库设计](docs/DATABASE_SCHEMA.md)** - 所有数据表和核心逻辑
- **[API 规范](docs/API_SPEC.md)** - RESTful API 完整文档
- **[第一阶段需求](docs/PHASE1_REQUIREMENTS.md)** - 开发清单和验收标准

### 🔧 后端开发
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
docker-compose up -d  # 启动 PostgreSQL
python app/main.py
```

访问：http://localhost:8000 | 文档：http://localhost:8000/docs

### 💻 Admin 前端开发
```bash
cd admin
npm install
npm run dev
```

访问：http://localhost:5173

### 📱 小程序开发
在微信开发者工具中打开 `miniprogram` 目录

## 项目概览

**项目名**：上海两店多渠道客资接入与微信承接中台  
**版本**：1.0.0  
**更新时间**：2026-03-09

### 业务背景

- **核心业务**：上海汽车贴膜（两家店、多个渠道）
- **目标用户**：销售、店长、管理员
- **核心问题**：多渠道线索分散，无法统一管理；时效控制困难；分配不均

### 解决方案

一个以 OpenClaw 智能接待 + 小程序业务中台为核心的完整系统：

1. **多账号机器人接待**：抖音和小红书的每个账号一个独立机器人，真人化聊天
2. **两店硬隔离**：BOP店（3人轮转）和龙膜店（2人轮转），线索不穿插
3. **1/3/10分钟时效控制**：首响→加微信→确认结果，自动追踪和提醒
4. **企业微信通知**：分配、超期、状态变更等事件实时推送
5. **完整统计报表**：首响率、微信率、SLA通过率、销售绩效等

## 技术栈

| 层级 | 技术 |
|-----|------|
| **前端** | Vue 3 + Vite + Element Plus |
| **小程序** | 微信原生小程序 |
| **后端** | Python FastAPI + SQLAlchemy |
| **数据库** | PostgreSQL |
| **外部** | OpenClaw (AI接待) + 企业微信 |

## 文件结构

```
养龙虾/
├── docs/                      # 完整文档
│   ├── 01-架构设计.md
│   ├── ARCHITECTURE.md        # 系统架构
│   ├── DATABASE_SCHEMA.md     # 数据库设计
│   ├── API_SPEC.md            # API 规范
│   └── PHASE1_REQUIREMENTS.md # 开发清单
│
├── backend/                   # FastAPI 后端
│   ├── app/
│   │   ├── main.py            # 应用入口
│   │   ├── models/            # 数据模型
│   │   ├── schemas/           # 数据验证
│   │   ├── api/               # API 路由 (待实现)
│   │   ├── services/          # 业务逻辑 (待实现)
│   │   ├── db/                # 数据库相关
│   │   └── integrations/      # 第三方集成 (待实现)
│   ├── requirements.txt
│   ├── docker-compose.yml
│   └── README.md
│
├── admin/                     # Vue3 Admin前端
│   ├── src/
│   │   ├── pages/             # 页面 (部分待实现)
│   │   ├── components/        # 组件
│   │   ├── router/            # 路由
│   │   ├── stores/            # 状态管理
│   │   ├── utils/             # API 封装
│   │   ├── App.vue
│   │   └── main.js
│   ├── package.json
│   ├── vite.config.js
│   └── README.md
│
├── miniprogram/               # 微信小程序
│   ├── pages/                 # 页面 (待实现)
│   ├── utils/
│   │   └── api.js             # API 封装
│   ├── app.json
│   ├── app.js
│   ├── app.wxss
│   └── README.md
│
├── .gitignore
└── README.md (本文件)
```

## 开发进度

### ✅ 已完成
- 完整的架构设计文档
- 数据库 Schema 设计
- API 规范文档
- FastAPI 项目结构和基础配置
- 数据模型和初始化脚本
- Vue3 Admin 基础结构
- 微信小程序基础结构
- API 调用封装

### ⏳ 第一阶段（核心闭环）
- [ ] 账号管理 API 实现
- [ ] 线索接入和分配 API 实现
- [ ] 时效追踪（SLA）实现
- [ ] 企业微信推送实现
- [ ] Admin 页面实现
- [ ] 定时任务（SLA检查、日报生成）
- [ ] 测试和优化

### 🔮 后续阶段
- 第二阶段：机器人真人化优化、微信状态自动识别、按钮回写
- 第三阶段：前端管理界面完善、销售绩效看板、渠道ROI分析

## 核心功能点

### 1. 多账号机器人系统
- 4个账号（抖音×2 + 小红书×2），各1个独立机器人
- 每个机器人独立的对话上下文、话术和人格设置
- 与 OpenClaw 集成进行智能化对话

### 2. 两店独立轮转分配
- **BOP店**：3名销售独立轮转
- **龙膜店**：2名销售独立轮转
- 账号→门店硬绑定，不允许跨店分配

### 3. 1/3/10分钟SLA时效规则
- **1分钟**：首响（销售或机器人首次回复）
- **3分钟**：发起加微信（获取或分享微信号）
- **10分钟**：确认结果（客户已加微信或失败）
- 自动计算超期和发送提醒

### 4. 企业微信集成
- 新线索自动推送到销售和店群
- 超期自动升级提醒
- 销售可通过企业微信按钮更新状态

### 5. 统计和报表
- 日报统计（按门店、渠道、销售）
- 首响率、微信率、SLA通过率等KPI
- 秒级数据更新

## 快速命令参考

### 后端
```bash
# 启动数据库
cd backend && docker-compose up -d

# 启动服务
python app/main.py

# 在线数据库创建
python -c "from app.db import init_db; init_db()"
```

### Admin 前端
```bash
cd admin
npm install
npm run dev
npm run build
```

### 小程序
- 在微信开发者工具中打开 `miniprogram` 目录
- 填写 AppID 并编译

## 环境变量配置

复制 `.env.example` 为 `.env` 并填充：

```bash
# 后端
cp backend/.env.example backend/.env

# Admin 前端 (可选)
cp admin/.env.example admin/.env
```

## 部署指南

### 开发环境（本地）
已通过 docker-compose 和 npm dev 完全支持

### 生产环境（后续）
将编写部署指南，包含 Docker、Kubernetes、CI/CD等

## 常见问题

**Q: 如何启动整个系统？**  
A: 按照各模块说明分别启动后端、Admin前端、PostgreSQL即可

**Q: OpenClaw 如何集成？**  
A: 启用 Mock 模式进行第一阶段开发，后续接入真实 OpenClaw API

**Q: 小程序如何开发？**  
A: 需要企业微信认证的小程序账号，或使用内测版本进行本地开发

## 相关资源

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Vue 3 Documentation](https://vuejs.org/)
- [Element Plus](https://element-plus.org/)
- [WeChat MiniProgram](https://developers.weixin.qq.com/miniprogram/)

## 项目维护

有任何问题或建议，请通过以下方式联系：

- 📧 Email：[待补充]
- 📱 WeChat：[待补充]
- 💬 钉钉群：[待补充]

---

**记住**：这是一个完整的业务系统项目，不仅仅是代码框架。
成功的关键是：
1. ✅ 明确的业务规则（已完成）
2. ✅ 健壮的数据设计（已完成）
3. ⏳ 高效的开发执行（进行中）
4. ⏳ 严格的测试验收（待进行）
5. ⏳ 持续的优化迭代（待进行）

加油！🚀

最后更新：2026年3月9日
