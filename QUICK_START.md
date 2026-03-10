# 🚀 快速启动指南

> 最后更新: 2026-03-09 | 状态: ✅ 生产就绪

## 📦 系统状态

| 组件 | 状态 | 详情 |
|------|------|------|
| PostgreSQL | 🟢 运行中 | postgres:15 (Docker) |
| 后端 API | 🟢 运行中 | FastAPI (localhost:8000) |
| 数据完整性 | ✅ 验证通过 | 20 用户, 25 订单, 12 财务日志 |
| 文档 | ✅ 完整 | 迁移指南, 部署指南 |

## ⚡ 一键启动

```bash
cd /Users/yushuai/Documents/Playground/养龙虾/car-film-mini-program
bash START_SYSTEM.sh
```

**输出示例:**
```
✅ 启动系统...
✅ Docker 容器已启动 (postgres-slim)
✅ 数据库连接成功 - 等待就绪...
✅ 数据验证: users=20, orders=25, logs=12
✅ 后端服务已启动 (localhost:8000)
✅ API 测试成功
```

预期耗时: **30 秒**

## 🧪 验证系统健康

```bash
bash HEALTH_CHECK.sh
```

**检查项:**
- ✅ Docker 容器运行状态
- ✅ 数据库连接能力
- ✅ 数据表记录数量
- ✅ 后端进程存活
- ✅ 端口 8000 监听
- ✅ API 端点响应

## 📱 小程序开发

### 1. 启动小程序开发者工具

```bash
open -a "微信开发者工具"
# 或手动打开应用
```

### 2. 导入项目

- **项目路径**: `/Users/yushuai/Documents/Playground/养龙虾/car-film-mini-program`
- **AppID**: 自动读取 `project.config.json`

### 3. 测试关键页面

| 页面 | 路径 | 测试内容 |
|------|------|--------|
| 订单列表 | `/pages/order-list/` | 应显示 25 条订单 |
| 订单详情 | `/pages/order-detail/` | 点击订单查看详情 |
| 创建订单 | `/pages/film-order/` | 表单提交验证 |
| 派工管理 | `/pages/dispatch-board/` | 任务分配界面 |

### 4. 网络调试

开发者工具 → 调试 → Network:
```
域名:     127.0.0.1:8000
协议:     HTTP
认证:     Authorization: Bearer <YOUR_INTERNAL_API_TOKEN>
```

## 🔧 常用命令

### 查看后端日志
```bash
# 生产环境（systemd）
sudo journalctl -u ylx-backend -f

# 本地开发建议直接查看启动 uvicorn 的终端输出
```

### 测试 API 端点
```bash
curl -X GET "http://127.0.0.1:8000/api/v1/store/internal/orders" \
  -H "Authorization: Bearer <YOUR_INTERNAL_API_TOKEN>" \
  -H "Content-Type: application/json"
```

### 运行最小冒烟测试
```bash
export INTERNAL_API_TOKEN="<YOUR_INTERNAL_API_TOKEN>"
BASE_URL="http://127.0.0.1:8000" bash scripts/smoke_api.sh
```

### 运行发布前一键检查
```bash
export INTERNAL_API_TOKEN="<YOUR_INTERNAL_API_TOKEN>"
export BASE_URL="http://127.0.0.1:8000"
MODE=release bash scripts/release_preflight.sh
```

### 统一生产部署入口
```bash
bash DEPLOY_PRODUCTION.sh
```

说明：
- `DEPLOY_PRODUCTION.sh` 是唯一标准发布入口。
- `DEPLOY.sh` 已默认阻断执行，历史内容请参考 `DEPLOY_LEGACY.md`。
- 完整流程见 `docs/统一发布流程.md`。

### 数据库备份
```bash
bash BACKUP_DATABASE.sh
# 生成: slim_backup_20260309_HHMMSS.sql
```

### 数据库恢复
```bash
bash RESTORE_DATABASE.sh slim_backup_20260309_*.sql
```

### 停止所有服务
```bash
# 杀死统一后端（8000）
pkill -f "uvicorn app.main:app" || true

# 可选：若在做 legacy 对照测试，再停 admin-console
pkill -f "python3 admin-console/server.py" || true

# 停止 Docker
alias docker='/Applications/Docker.app/Contents/Resources/bin/docker'
docker stop postgres-slim
```

## 📊 API 端点参考

### 获取订单列表
```
GET /api/v1/store/internal/orders
Header: Authorization: Bearer <YOUR_INTERNAL_API_TOKEN>
Response: {
  "success": true,
  "items": [
    {
      "id": "TEST20260305015",
      "serviceType": "FILM",
      "status": "未完工",
      "customerName": "测试客户15",
      ...
    },
    ... (共 25 条)
  ]
}
```

### 其他端点
详见: `MIGRATION_COMPLETE.md` 的 API 部分

## ⚠️ 故障排查

### 问题: 无法连接数据库

**症状**: `psycopg.OperationalError: could not translate host name`

**解决方案:**
```bash
# 1. 检查 Docker 状态
alias docker='/Applications/Docker.app/Contents/Resources/bin/docker'
docker ps | grep postgres-slim

# 2. 如果未运行，重启容器
docker start postgres-slim

# 3. 等待就绪 (通常 10-15 秒)
sleep 15
```

### 问题: 端口 8000 被占用

**症状**: `Address already in use`

**解决方案:**
```bash
# 查找占用进程
lsof -i :8000

# 强制杀死
kill -9 <PID>
```

### 问题: API 返回 401 Unauthorized

**症状**: `{"error": "Unauthorized"}`

**检查:**
- ✓ Authorization header 是否设置: `Bearer <YOUR_INTERNAL_API_TOKEN>`
- ✓ Token 是否正确: `<YOUR_INTERNAL_API_TOKEN>`
- ✓ 后端服务是否运行

## 📚 详细文档

| 文档 | 用途 |
|------|------|
| [MIGRATION_COMPLETE.md](./MIGRATION_COMPLETE.md) | 迁移完整指南和验证清单 |
| [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | 生产环境部署步骤 |
| [项目 README](./README.md) | 项目概述和结构 |

## 🎯 后续步骤

### 今天 (开发和测试)
1. ✓ 启动系统 (`bash START_SYSTEM.sh`)
2. 打开小程序开发者工具
3. 导入项目和测试页面
4. 验证 API 调用

### 本周 (集成测试)
1. 在真实手机上测试小程序
2. 测试订单创建、编辑、派工流程
3. 验证数据同步

### 下周 (部署准备)
1. 按 DEPLOYMENT_GUIDE.md 部署到测试服务器
2. 配置域名和 SSL
3. 进行压力测试

## 📞 需要帮助?

- **API 问题**: 检查 `Authorization` header
- **数据库问题**: 运行 `bash HEALTH_CHECK.sh`
- **小程序问题**: 检查开发者工具的 Network 调试
- **部署问题**: 参考 `DEPLOYMENT_GUIDE.md`

---

**系统状态**: 🟢 **生产就绪** | **验收日期**: 2026-03-09 | **版本**: 1.0
