# 小程序说明（合并版）

最后更新：2026-03-10

## 1. 当前定位

本目录是“养龙虾”主小程序，已并入“蔚蓝工单模块”页面与工具。

当前有两条业务链路：

1. 线索中台链路（后端 8000）
	- API 前缀：`/api/v1/*`
	- 登录入口：`/pages/login`
2. 经营工单链路（admin-console 8080）
	- API 前缀：`/api/*`、`/api/v1/internal/*`
	- 推荐入口：`/pages/login?scene=store`（内部会分流到 `pages/login/login`）

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
│   └── adapters/store-api.js   # 经营系统 API 适配（8080）
└── config/finance.config.js    # 经营链路配置聚合
```

## 3. 统一配置键（推荐）

请优先使用以下键，避免混用导致联调不稳定。

1. `api_base_url`
	- 线索中台后端地址
	- 默认：`http://127.0.0.1:8000/api/v1`
2. `store_api_base_url`
	- 经营系统地址
	- 默认：`http://127.0.0.1:8080`
3. `store_internal_api_token`
	- 经营系统内部接口令牌（必填）

兼容说明：`finance.config.js` 会对 `financeBaseUrl/financeApiToken` 与上述 store 键做兼容读取与同步，建议新流程只维护 store 键。

## 4. 本地启动流程（联调）

1. 启动 8000 后端

```bash
cd /Users/yushuai/Documents/Playground/养龙虾/backend
source ../.venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

2. 启动 8080 经营系统

```bash
cd /Users/yushuai/Documents/Playground/养龙虾/car-film-mini-program/admin-console
INTERNAL_API_TOKEN='<YOUR_TOKEN>' python3 server.py
```

3. 微信开发者工具打开 `miniprogram/`

4. 在 Storage 中确认：
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

## 6. 权限矩阵（当前）

1. `manager`
	- 编辑订单：全部允许
	- 派工看板：允许
	- 销售绩效：允许
2. `sales`
	- 编辑订单：仅本人负责订单
	- 派工看板：允许
	- 销售绩效：允许
3. `finance`
	- 编辑订单：不允许
	- 派工看板：不允许
	- 销售绩效：不允许
4. `technician`
	- 编辑订单：不允许
	- 派工看板：不允许
	- 销售绩效：不允许

## 7. 常见问题

1. `GET /api/leads` 返回 401
	- 该接口走登录会话鉴权，不接受 `store_internal_api_token`。
2. 工单同步接口 401
	- 检查 `store_internal_api_token` 是否配置且与 8080 的 `INTERNAL_API_TOKEN` 一致。
3. 部分页面白屏
	- 先检查 `app.json` 页面注册与 Storage 配置，再看开发者工具 Console 报错。
