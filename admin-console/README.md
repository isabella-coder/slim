# 电脑端后台（Admin Console）

这是给门店内部使用的电脑端管理后台，包含：

- 账号登录与角色权限（店长/销售/施工）
- 订单管理（全部订单/我的订单切换）
- 派工看板（日期排班、冲突、10工位容量）
- 回访看板（7/30/60/180 节点、标记完成）
- 财务同步（同步日志查看、按事件/业务类型/订单号筛选）

## 目录

- `server.py` 纯 Python 后端（无第三方依赖）
- `data/users.json` 后台账号
- `data/orders.json` 后台订单数据
- `web/` 前端页面

## 启动

1. 进入目录：

```bash
cd /Users/yushuai/Documents/Playground/car-film-mini-program/admin-console
```

2. 启动服务：

```bash
python3 server.py
```

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

- 当前订单数据独立存放在 `admin-console/data/orders.json`
- 若要和小程序实时共享，需要再接统一数据库或 API 中台
