# 电脑端后台（Admin Console）

> ⚠️ Legacy 组件说明：本目录用于历史 `admin-console:8080` 兼容链路。
> 当前统一发布标准为 `养龙虾/backend` 的 `8000` 服务入口（`/health` + `/api/v1/store/*`）。

这是给门店内部使用的电脑端管理后台，包含：

- 账号登录与角色权限（店长/销售/施工）
- 订单管理（全部订单/我的订单切换）
- 派工看板（日期排班、冲突、10工位容量）
- 回访看板（7/30/60/180 节点、标记完成）
- 财务同步（同步日志查看、按事件/业务类型/订单号筛选）

## 目录

- `server.py` 纯 Python 后端（启用 PostgreSQL 时需安装 `psycopg`）
- `data/users.json` 后台账号
- `data/orders.json` 后台订单数据
- `web/` 前端页面

## 启动

1. 进入目录：

```bash
cd /Users/yushuai/Documents/Playground/养龙虾/car-film-mini-program/admin-console
```

2. 启动服务：

```bash
python3 server.py
```

可选：启用 PostgreSQL 单一真源（启用后不再走 JSON 回退）：

```bash
export ENABLE_DB_STORAGE=1
export POSTGRES_DSN='postgresql://postgres:password@127.0.0.1:5432/slim'
python3 server.py
```

> 未安装 `psycopg` 时，`ENABLE_DB_STORAGE=1` 会导致 `/api/health/db` 返回错误。

或一键脚本：

```bash
./start-admin.sh
```

3. 浏览器打开：

`http://127.0.0.1:8080`

## 默认账号

- 店长：`manager / manager123`
- 销售A：`salesa / sales123`
- 销售B：`salesb / sales123`
- 技师A：`techa / tech123`

## 角色权限

- 店长：可看全部，可编辑全部
- 销售：可看全部，也可切到“我的订单”
- 施工：仅可看“我的订单”（按技师名匹配）

## 数据说明

- 默认（`ENABLE_DB_STORAGE=0`）时，订单数据在 `admin-console/data/orders.json`
- 开启 DB（`ENABLE_DB_STORAGE=1`）后，读写都走 PostgreSQL，不再回退 JSON


## 迁移脚本（数据库切主前）

- `python3 scripts/migrate/migrate_users.py --dry-run --limit 50`
- `python3 scripts/migrate/migrate_orders.py --dry-run --since "2026-03-01 00:00"`
- `python3 scripts/migrate/migrate_finance_logs.py --dry-run`

执行正式迁移时补 `--dsn`：

```bash
python3 scripts/migrate/migrate_orders.py --dsn "$POSTGRES_DSN"
```

## 内部接口与并发控制

- `INTERNAL_API_TOKEN` 现在是强制项：未配置时，内部接口返回 `503`。
- 新增 DB 健康检查：`GET /api/health/db`
- 新增增量拉取：`GET /api/v1/orders?updatedAfter=2026-03-01 00:00`
- 新增增量更新：`PATCH /api/v1/orders/{id}`（必须携带 `version`，冲突返回 `409 ORDER_VERSION_CONFLICT`）
- 管理台订单更新 `PUT /api/orders/{id}` 同样要求 `version`。
