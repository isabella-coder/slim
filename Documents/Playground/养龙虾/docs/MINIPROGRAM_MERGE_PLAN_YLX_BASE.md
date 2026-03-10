# 单小程序合并方案（以 `养龙虾` 为基座）

更新时间：2026-03-10

## 1. 目标

1. 保留 `养龙虾/miniprogram` 作为唯一小程序工程。
2. 将 `car-film-mini-program` 的门店经营能力按模块迁入，不一次性替换。
3. 合并后对外一个小程序入口，内部按角色显示不同模块。

## 2. 现状复核（已检查）

### 2.1 两侧体量

1. `养龙虾` 页面数：5
2. `car-film-mini-program` 页面数：14
3. 体量（粗略）
- `养龙虾/miniprogram`：136K
- `car-film-mini-program/pages`：428K
- `car-film-mini-program/utils`：76K

### 2.2 页面命名冲突

1. 已做页面路径比对，当前无同名冲突（按相对路径比较）。
2. 说明：可直接迁移到新子包路径，无需大规模重命名。

### 2.3 鉴权与存储差异

1. `养龙虾`：`token/sales_id/sales_name/store_code`
2. `car-film`：`miniAuthSessionToken/miniAuthUser` + user-context
3. 结论：存储 key 无直接冲突，但存在“双会话体系”冲突风险。

### 2.4 依赖密度（car-film 页面）

高频依赖：
1. `utils/order`
2. `utils/finance-sync`
3. `utils/mini-auth`
4. `utils/user-context`
5. `utils/product-catalog`
6. `utils/scheduling`
7. `utils/staff-options`
8. `utils/followup`

结论：迁移应按依赖簇分批，不能只搬页面。

## 3. 合并总策略

## 3.1 选择基座

1. 基座工程：`/Users/yushuai/Documents/Playground/养龙虾/miniprogram`
2. 原因：你要求后续能力基于第一套继续扩展。

## 3.2 路由与包结构策略

1. 主包只保留少量核心入口页（登录、首页、线索、我的）。
2. 经营模块迁入子包（subpackages），避免主包膨胀。
3. 重要限制：微信 tabBar 页必须在主包，子包页通过首页入口跳转。

## 3.3 后端策略（先不硬合并数据库）

1. 阶段内允许两个后端并存：
- 线索与日报：`养龙虾/backend`（FastAPI）
- 经营订单：`car-film/admin-console/server.py`
2. 前端新增统一 API 适配层，后续再做网关收敛。

## 4. 目标目录（合并后）

以 `养龙虾/miniprogram` 为准：

1. `pages/login/*`
2. `pages/index/*`
3. `pages/leads/*`
4. `pages/lead-detail/*`
5. `pages/profile/*`
6. `subpackages/store/pages/order-list/*`
7. `subpackages/store/pages/order-detail/*`
8. `subpackages/store/pages/order-edit/*`
9. `subpackages/store/pages/film-order/*`
10. `subpackages/store/pages/wash-order/*`
11. `subpackages/store/pages/dispatch-board/*`
12. `subpackages/store/pages/sales-performance/*`
13. `subpackages/store/pages/followup-reminder/*`
14. `subpackages/store/pages/douyin-leads/*`
15. `subpackages/store/pages/product-config/*`
16. `subpackages/store/pages/wash-dispatch-board/*`
17. `subpackages/store/pages/wash-order-detail/*`
18. `utils/core/request.js`（统一请求封装）
19. `utils/core/session.js`（统一会话）
20. `utils/adapters/store-api.js`（经营系统适配）
21. `utils/adapters/lead-api.js`（线索系统适配）

## 5. 分阶段执行计划

## 阶段 A：壳层与子包骨架（3-5 天）

1. 在 `app.json` 新增 `subpackages`，先挂空页面。
2. 首页增加“经营中心”入口卡片，跳转子包首页。
3. 迁移 `car-film` 静态资源（images）到新子包资源目录。
4. 结果：一个小程序里可进入“经营中心”空壳。

## 阶段 B：经营模块迁移（5-8 天）

1. 优先迁移低耦合页面：`order-list/order-detail/sales-performance`。
2. 同步迁移依赖工具：`order.js/followup.js/user-context.js`。
3. 接入 `store-api` 适配层，先保持原 `admin-console` 接口。
4. 结果：经营核心链路在基座小程序可跑通。

## 阶段 C：登录与会话统一（4-6 天）

1. 设计统一 session 结构（建议：`sessionToken` + `identity` + `roleScopes`）。
2. 实现登录桥接：一次登录后可访问线索与经营模块。
3. 下线/兼容旧 `mini-auth` 存储 key（保留迁移期兼容）。
4. 结果：用户无感切换模块，无二次登录。

## 阶段 D：回归与发布（3-5 天）

1. 跑 P0 用例：登录、线索列表、日报、订单、调度、退出。
2. 灰度发布（10%-30%），观察错误率与关键路径转化。
3. 稳定后再下线旧独立入口。

## 6. 风险与应对

1. 风险：双会话导致 401/状态错乱。
- 应对：先实现 `session.js`，所有请求从统一会话读 token。

2. 风险：页面多导致导航混乱。
- 应对：tab 不扩张，经营能力收拢到“经营中心”二级入口。

3. 风险：接口协议差异（错误码/字段）。
- 应对：强制走 adapter 层，不允许页面直接调用后端。

4. 风险：发布后难回滚。
- 应对：分阶段灰度，保留旧项目至少 1 个版本周期。

## 7. 验收标准

1. 单小程序可完成：登录 -> 线索 -> 日报 -> 订单 -> 退出。
2. 不出现二次登录。
3. 关键接口失败有可见提示，不静默失败。
4. 合并后主包体积可控，首次加载时间无明显劣化。

## 8. 下一步建议（立即可做）

1. 先做阶段 A：子包骨架 + 首页入口。
2. 仅迁移 `order-list`、`order-detail` 作为首批试点。
3. 完成后再迁移剩余经营页面，避免一次性大并。
