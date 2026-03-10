# 小程序说明（合并版）

最后更新：2026-03-11

## 1. 当前定位

本目录是“养龙虾”主小程序，当前统一对接 `8000` 后端。

统一接口前缀：

1. 线索中台：`/api/v1/*`
2. 经营工单：`/api/v1/store/*`
3. 经营内部同步：`/api/v1/store/internal/*`

统一登录入口：

1. 线索链路：`/pages/login`
2. 经营链路：`/pages/login?scene=store`

## 2. 关键目录

```text
miniprogram/
├── pages/
│   ├── login.js                # 主登录页（线索链路）
│   ├── login/login.js          # 经营链路登录页
│   ├── index/                  # 经营链路首页（并入兼容页）
│   ├── order-list/             # 根包工单列表页
│   ├── douyin-leads/           # 抖音线索页（会话鉴权）
│   └── ...
├── subpackages/store/
│   └── pages/ops-home/index    # 经营中心入口
├── utils/
│   ├── api.js                  # 线索中台 API（8000）
│   ├── mini-auth.js            # 经营链路会话
│   ├── order.js                # 工单同步逻辑
│   └── adapters/store-api.js   # 经营系统 API 适配（/api/v1/store/*）
└── config/finance.config.js    # 经营链路配置聚合
```

## 3. 统一配置键（推荐）

在微信开发者工具 Storage 中优先维护以下 3 个键：

1. `api_base_url`
- 线索中台后端地址
- 推荐：`http://127.0.0.1:8000/api/v1`

2. `store_api_base_url`
- 经营模块后端地址
- 推荐：`http://127.0.0.1:8000`

3. `store_internal_api_token`
- 经营 internal 路由令牌
- 需与 `backend/.env` 中 `WEILAN_API_TOKEN` 一致

## 4. 本地启动流程（联调）

1. 启动 8000 后端

```bash
cd /Users/yushuai/Documents/Playground/养龙虾/backend
source ../.venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

2. 微信开发者工具打开 `miniprogram/`

3. 在 Storage 中确认：
- `api_base_url`
- `store_api_base_url`
- `store_internal_api_token`

## 5. 快速冒烟

1. 入口链路：`subpackages/store/pages/ops-home/index` -> `pages/index/index`
2. 主流程链路：首页 -> 工单列表 -> 工单详情 -> 编辑/派工 -> 返回
3. 页面可打开：
- `pages/douyin-leads/douyin-leads`
- `pages/followup-reminder/followup-reminder`
- `pages/sales-performance/sales-performance`

## 6. 常见问题

1. `GET /api/v1/store/leads` 返回 401
- 该接口走登录会话鉴权，不接受 internal token。

2. 工单同步接口 401
- 检查 `store_internal_api_token` 是否与 `WEILAN_API_TOKEN` 一致。

3. 页面白屏
- 先检查 `app.json` 页面注册，再看开发者工具 Console 报错。
