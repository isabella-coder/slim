# 汽车服务工单微信小程序

一个用于门店内部下单与工单跟踪的小程序示例，支持产品价格自定义、订单跟踪和财务系统同步。

## 系统配套清单（先看）

- 全栈组件清单与项目现状：`docs/小程序全栈配套清单与现状.md`
- 统一发布流程（唯一标准）：`docs/统一发布流程.md`
- Legacy 发布归档：`DEPLOY_LEGACY.md`（`DEPLOY.sh` 默认阻断执行）
- 系统设计与任务拆解：`SYSTEM_DESIGN_TASK_BREAKDOWN_SPEC.md`
- 快速启动与检查：`QUICK_START.md`、`scripts/smoke_api.sh`、`scripts/release_preflight.sh`

## 功能

- 首页入口页
  - 两个独立入口按钮：贴膜链路 / 洗车链路
  - 常用入口：全部订单、贴膜派工看板、洗车派工看板、销售业绩看板
- 贴膜下单页
  - 联系人/车辆信息填写
  - 车架号照片上传（选填）
  - 来源渠道手动填写
  - 定金金额手动填写 + 定金截图上传
  - 套餐（品牌型号 + 施工部位）多选、门店选择
  - 销售负责人固定名单选择
  - 预约容量校验（同门店同日期最多 10 单，超额不可提交）
  - 一键进入“编辑产品价格”页面（内部可改）
  - 增值服务勾选（显示“免费”）
  - 实时价格计算（总价和定金）
  - 下单后自动同步财务系统
- 产品价格管理页
  - 编辑现有产品品牌型号、施工部位、价格
  - 自定义新增产品
  - 删除产品并保存到本地
- 订单列表页
  - 视图切换：全部订单 / 我的订单（按销售负责人筛选）
  - 按状态筛选（全部、未完工、已完工、已取消）
  - 关键词搜索（姓名、手机号、车牌号、车型）
  - 快捷入口：派工看板、回访提醒
  - 订单统计
  - 财务同步状态展示
  - 单条订单编辑入口
- 订单详情页
  - 服务和费用明细
  - 派工信息录入（日期、时间、工位、技师可多选、备注）并自动校验撞单
  - 完工效果图上传与预览
  - 施工部位提交（施工类型、施工部位可多选、施工人员、照片）
  - 交车通过后一键生成施工提成
  - 交车通过后可上传尾款图片，并自动标记订单为已完工
  - 财务同步状态、财务单号、手动重试同步
  - 复制订单号、联系客服、取消订单
- 洗车下单页
  - 姓名、电话、施工人员、施工图片必填
  - 预约日期/时段/工位
  - 时段规则：09:00-18:00 整点预约（19:00 收工）
  - 全店同日期同小时仅允许 1 台车预约
  - 总价格录入后自动计算固定提成（8%）
  - 下单后自动写入施工提成
- 洗车订单详情页
  - 查看洗车预约、施工图片、固定提成
  - 支持编辑、取消、财务同步
- 贴膜派工看板页
  - 按日期查看工位排班与技师排班
  - 每天最多 10 个工位，超过上限不可再预约工位
  - 自动高亮工位冲突/技师冲突
  - 一键跳转订单详情改派工
- 洗车派工看板页
  - 按日期 / 时段 / 技师 / 状态展示
  - 一键派工、改派、标记完工、上传施工图
  - 自动识别同一时段冲突订单
- 销售业绩看板页
  - 仅统计贴膜订单（排除已取消）
  - 支持选择统计日期（日期可选）
  - 维度：按天 / 按周 / 按月
  - 指标：订单数、销售额、平均客单价
  - 销售排行：按当前周期自动排序
- 回访提醒页
  - 交车后自动生成 7 天 / 30 天 / 60 天 / 180 天回访节点
  - 按“待处理/今日到期/已逾期/已完成”筛选
  - 一键标记已回访并同步财务
- 订单编辑页
  - 可编辑联系人、车辆、套餐（多选）、预约、增值服务和备注
  - 保存时执行预约容量校验（同门店同日期最多 10 单）
  - 保存后自动更新订单金额并触发财务同步

## 项目结构

- `app.js` / `app.json` / `app.wxss`
- `admin-console/` 电脑端后台（浏览器管理端）
- `config/finance.config.js` 财务接口配置
- `pages/index` 首页入口页
- `pages/film-order` 贴膜下单页
- `pages/wash-order` 洗车下单页
- `pages/wash-order-detail` 洗车订单详情页
- `pages/product-config` 产品价格管理页
- `pages/order-list` 订单列表页
- `pages/order-detail` 订单详情页
- `pages/dispatch-board` 贴膜派工看板页
- `pages/wash-dispatch-board` 洗车派工看板页
- `pages/sales-performance` 销售业绩看板页
- `pages/followup-reminder` 回访提醒页
- `utils/product-catalog.js` 产品目录存储逻辑
- `utils/order.js` 订单和计价逻辑
- `utils/followup.js` 回访节点计算逻辑
- `utils/scheduling.js` 派工与预约容量规则
- `utils/staff-options.js` 固定人员名单（销售/派工技师）
- `utils/finance-sync.js` 财务同步封装

## 电脑端后台（Legacy 兼容）

- 目录：`admin-console`
- 启动：
  1. `cd admin-console`
  2. `python3 server.py`（或 `./start-admin.sh`）
  3. 浏览器打开 `http://127.0.0.1:8080`
- 说明：该链路仅用于历史对照，不作为标准发布入口。
- 功能：
  - 登录权限（店长/销售/施工）
  - 全部订单/我的订单视图切换
  - 派工看板（按日期，10工位容量）
  - 回访看板（7/30/60/180）

## 运行方式

1. 打开微信开发者工具。
2. 选择“导入项目”，目录选择本项目根目录：`car-film-mini-program`。
3. 使用正式 AppID（建议不要游客模式）。
4. 点击“编译”即可运行。

## 施工提成规则（默认）

- 计算方式：交车通过后，按施工部位固定金额生成施工提成。
- 整车提成：
  - 前杠机盖：200
  - 后杠后盖尾翼：200
  - 左侧面：100
  - 右侧面：100
- 局部补膜提成：
  - 机盖：40
  - 前杠：100
  - 顶：40
  - 前叶：15
  - 后叶：40
  - 门：15
  - 后盖：20
  - 后杠：100

## 财务系统对接

### 1) 配置接口

编辑 `config/finance.config.js`：

- `enabled`: 设为 `true` 开启同步
- `mockMode`: 联调阶段可设为 `true`（不发真实请求）
- `baseUrl`: 财务系统域名，例如 `https://finance.xxx.com`
- `syncPath`: 同步路径，例如 `/api/v1/store/internal/work-orders/sync`
- `apiToken`: 鉴权 token（可选）
- `extraHeaders`: 自定义请求头（可选）

当前默认行为：

- 开发版（`develop`）默认走本机：`http://127.0.0.1:8000`
- 体验版/正式版（`trial`/`release`）默认不使用本机地址（避免手机端访问 `127.0.0.1` 导致不同步）
- 可通过 `setFinanceBaseUrl('https://你的公网域名')` 写入运行时同步地址（Storage Key: `financeBaseUrl`）
- `syncPath=/api/v1/store/internal/work-orders/sync`

本地桥接由 `admin-console/server.py` 提供，会把每次同步请求写入：

- `admin-console/data/finance-sync-log.json`

### 2) 配置小程序合法域名

在微信公众平台 -> 开发管理 -> 开发设置 -> 服务器域名，把 `baseUrl` 对应域名加入 `request 合法域名`。

### 3) 请求协议

- 方法：`POST`
- `Content-Type`: `application/json`
- 鉴权：默认会带 `Authorization: Bearer <apiToken>` 和 `X-Api-Token: <apiToken>`（若有 token）
- 返回：HTTP `2xx` 且业务字段为成功（如 `success=true` 或 `code=0`）即判定同步成功

### 4) 已发送字段（核心）

`eventType`、`source`、`syncedAt`、`order.id`、`order.status`、`order.customerName`、`order.phone`、`order.carModel`、`order.plateNumber`、`order.vinPhoto`、`order.sourceChannel`、`order.store`、`order.salesOwner`、`order.packageModel`、`order.packageArea`、`order.dispatchInfo`、`order.depositAmount`、`order.depositProofPhotos`、`order.constructionPhotos`、`order.finalPaymentPhotos`、`order.finalPaymentUploadedAt`、`order.workPartRecords`、`order.deliveryStatus`、`order.commissionStatus`、`order.commissionTotal`、`order.commissionRecords`、`order.followupRecords`、`order.followupLastUpdatedAt`、`order.priceSummary`

### 5) 自动同步触发点

- 新建订单：`ORDER_CREATED`
- 取消订单：`ORDER_CANCELLED`
- 保存施工部位记录：`ORDER_WORK_PART_SAVED`
- 删除施工部位记录：`ORDER_WORK_PART_REMOVED`
- 保存派工：`ORDER_DISPATCH_UPDATED`
- 交车通过生成提成：`ORDER_DELIVERY_CONFIRMED`
- 上传尾款图片：`ORDER_FINAL_PAYMENT_UPLOADED`
- 更新尾款图片：`ORDER_FINAL_PAYMENT_UPDATED`
- 上传完工效果图：`ORDER_COMPLETION_PHOTOS_UPLOADED`
- 更新完工效果图：`ORDER_COMPLETION_PHOTOS_UPDATED`
- 标记回访完成：`ORDER_FOLLOWUP_UPDATED`
- 编辑订单：`ORDER_UPDATED`
- 详情页手动重试：`MANUAL_RETRY`

### 6) 联调验证建议

1. 先将 `mockMode=true`，验证页面“财务同步状态”可从“未同步”变为“已同步”。
2. 再切到真实接口（`mockMode=false`），观察订单详情中的“同步信息”和“财务单号”。
3. 若失败，先检查域名白名单、token、接口业务返回字段。

## 常见报错处理

- `Cannot read property '__subPageFrameEndTime__' of null`
  - 在“详情 -> 本地设置”把基础库切到稳定版（例如 `3.10.3` 及以上），清缓存后重新编译。
- `webapi_getwxaasyncsecinfo:fail`
  - 多见于游客模式，换正式 AppID 后重新编译。

## 可扩展建议

- 接入真实后端数据库（替换本地存储）
- 施工照片上传到对象存储（再把可访问 URL 回传财务系统）
- 增加财务回写状态查询与重试队列
# slim
