# 小程序回归清单（2026-03-10）

## 1. 目标

覆盖本轮关键变更的完整回归，包括：

1. 登录与鉴权（登录页、守卫、退出、封禁）
2. 线索列表（已分配视图、时间筛选、刷新、详情进出）
3. 统计报表（门店日报 + 按销售日报）
4. 异常路径（无 token、错误日期、跨门店）

## 2. 当前结论

1. 后端与接口级冒烟已通过（见第 5 节）。
2. 仍需在微信开发者工具完成 GUI 手工点击回归（见第 6 节）。

## 3. 测试前置条件

1. 后端服务启动并可访问 `http://localhost:8000`。
2. 小程序 `api_base_url` 指向 `http://localhost:8000/api/v1` 或当前可用公网地址。
3. 默认销售密码：`sale123`。
4. 建议准备两个账号用于门店隔离验证。

## 4. 关键配置

1. `MINIPROGRAM_SALES_PASSWORD`
2. `MINIPROGRAM_TOKEN_EXPIRE_MINUTES`
3. `MINIPROGRAM_LOGIN_MAX_RETRIES`
4. `MINIPROGRAM_LOGIN_WINDOW_MINUTES`
5. `MINIPROGRAM_LOGIN_BLOCK_MINUTES`

## 5. 已执行自动冒烟结果

执行时间：`2026-03-10`（最新复测）

1. `GET /health` -> `200`（PASS）
2. `GET /api/v1/auth/sales` -> `code=0`（PASS）
3. `POST /api/v1/auth/login`（正确密码 `sale123`）-> `code=0`（PASS）
4. `GET /api/v1/auth/me`（Bearer）-> `code=0`（PASS）
5. `GET /api/v1/leads`（Bearer）-> `code=0`（PASS）
6. `GET /api/v1/stats/daily-by-sales`（合法日期）-> `code=0`（PASS）
7. `GET /api/v1/audit/order-ops/summary`（Bearer）-> `code=0`（PASS）
8. `GET /api/v1/audit/order-ops/export`（Bearer）-> `code=0`（PASS）
9. `POST /api/v1/audit/order-ops`（Bearer）-> `code=0`（PASS）

补充说明：
1. 审计写入接口必须传 `action` 字段，不是 `action_type`。
2. 推荐测试值：`action=quick_status_update`、`result=success`、`target_id=<marker>`。

## 6. 微信开发者工具手工回归用例

状态取值：`TODO` / `PASS` / `FAIL`

| ID | 模块 | 优先级 | 操作步骤 | 预期结果 | 状态 |
| --- | --- | --- | --- | --- | --- |
| LGN-01 | 启动与守卫 | P0 | 冷启动小程序 | 直接进入 `pages/login`，无闪屏重入 | TODO |
| LGN-02 | 登录成功 | P0 | 选择账号 + 输入正确密码登录 | Toast `登录成功`，跳转首页，`token/sales_id/sales_name/store_code` 入存储 | TODO |
| LGN-03 | 记住账号 | P1 | 勾选记住账号登录后退出再进登录页 | 账号默认选中上次账号 | TODO |
| LGN-04 | 不记住账号 | P1 | 取消记住账号后登录，退出再进登录页 | 不保留上次账号 | TODO |
| LGN-05 | 错误密码 | P0 | 连续输错密码（未到封禁阈值） | 返回 `账号或密码错误` | TODO |
| LGN-06 | 登录封禁 | P0 | 同账号同 IP 连续输错至阈值（默认 5 次） | 返回 `登录失败次数过多，请 X 分钟后再试` | TODO |
| LGN-07 | 封禁后恢复 | P0 | 等待封禁时间后再用正确密码登录 | 可正常登录，封禁状态清除 | TODO |
| LGN-08 | 退出登录 | P0 | 我的页点击`退出登录` | 回到登录页，token 与用户信息被清理 | TODO |
| TAB-01 | Tab 稳定性 | P0 | 首页->线索->我的->首页，循环 3 轮 | 无白屏、无死循环跳转、无报错 | TODO |
| IDX-01 | 首页下拉刷新 | P1 | 首页执行下拉刷新 | 刷新结束，统计与最近线索更新 | TODO |
| LST-01 | 线索已分配视图 | P0 | 在线索页切换到`已分配`与其他状态 tab | 列表按状态正确切换 | TODO |
| LST-02 | 时间筛选生效 | P0 | 设置开始=结束=同一天并筛选 | 仅返回该日期线索 | TODO |
| LST-03 | 时间筛选重置 | P1 | 点击`重置` | 起止日期清空，列表恢复默认 | TODO |
| LST-04 | 时间边界校验 | P1 | 开始日期晚于结束日期；结束日期早于开始日期 | 分别提示日期错误，不触发错误查询 | TODO |
| LST-05 | 线索页下拉刷新 | P1 | 线索页下拉刷新 | 刷新结束，列表重新加载 | TODO |
| LST-06 | 列表分页 | P2 | 连续上拉到底触发加载更多 | 有数据时持续加载；无更多显示`没有更多了` | TODO |
| DET-01 | 详情进出 | P0 | 从线索进入详情后返回 | 可正常进出；返回后列表状态保持 | TODO |
| DET-02 | 详情首响动作 | P0 | 在 `assigned` 状态线索点击`首响` | 状态推进，首响时间写入，SLA1m 展示更新 | TODO |
| DET-03 | 发起加微信 | P1 | 详情中选择一种加微方式提交 | 状态变为 `wechat_invited`，时间与 SLA3m 更新 | TODO |
| DET-04 | 确认微信结果 | P1 | 详情中选择 success/refused/failed | 结果时间写入，SLA10m 更新，线索可进入完成态 | TODO |
| PRF-01 | 我的页下拉刷新 | P1 | 我的页下拉刷新 | 个人与门店数据刷新成功 | TODO |
| PRF-02 | 按销售日报切日期 | P0 | 我的页切换日报日期 | 汇总与销售明细同步切换 | TODO |
| ERR-01 | 失效 token 路径 | P0 | 手动清空 token 后进入 Tab 页 | 被守卫拉回登录页 | TODO |
| ERR-02 | 异常 API 提示 | P1 | 临时填错 `api_base_url` 后刷新页面 | 显示加载失败提示，不崩溃 | TODO |

## 7. 回归通过标准

1. 所有 P0 用例必须 `PASS`。
2. P1 用例允许最多 1 项已知问题，且需有明确规避方案。
3. 出现 `FAIL` 时需记录复现步骤、账号、时间、接口与日志。

## 8. 失败记录模板

```
用例 ID:
设备/基础库:
账号/门店:
复现步骤:
实际结果:
期望结果:
接口日志(可选):
截图/录屏:
```

## 9. 便捷 API 复核命令（可选）

```bash
cd /Users/yushuai/Documents/Playground/养龙虾
BASE='http://localhost:8000/api/v1'

# 1) 获取账号并登录（默认密码 sale123）
SALES_JSON=$(curl -s "$BASE/auth/sales")
FIRST_ID=$(echo "$SALES_JSON" | sed -n 's/.*"sales_id":"\([^"]*\)".*/\1/p' | head -n1)
FIRST_STORE=$(echo "$SALES_JSON" | sed -n 's/.*"store_code":"\([^"]*\)".*/\1/p' | head -n1)
TOKEN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"sales_id\":\"$FIRST_ID\",\"password\":\"sale123\"}" \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

# 2) 无 token 访问 leads（预期 401）
curl -s "$BASE/leads?page=1&page_size=1"

# 3) 有 token 访问 leads（预期 200 + code=0）
curl -s "$BASE/leads?assigned_to=$FIRST_ID&created_from=2026-03-10&created_to=2026-03-10&page=1&page_size=2" \
  -H "Authorization: Bearer $TOKEN"

# 4) 按销售日报（预期 code=0）
curl -s "$BASE/stats/daily-by-sales?stat_date=2026-03-10&store_code=$FIRST_STORE" \
  -H "Authorization: Bearer $TOKEN"
```
