# ⚡ 一日完全迁移执行计划

> ⚠️ Legacy 文档：本计划用于历史 `admin-console:8080` 迁移改造，不作为当前统一 `8000` 发布标准。
> 当前统一发布与联调请参考：`car-film-mini-program/docs/统一发布流程.md`。

**目标**：一天内完成从 JSON → PostgreSQL 的完全迁移  
**日期**：2026年3月8日-9日  
**状态**：准备就绪 ✅

---

## 📅 执行时间表

### 上午 1小时 - 准备阶段

| 时间 | 任务 | 内容 | 耗时 |
|------|------|------|------|
| 08:00-08:05 | 环境检查 | PostgreSQL 连接、数据备份 | 5分 |
| 08:05-08:15 | 创建表结构 | 执行 `001-init-schema.sql` | 10分 |
| 08:15-08:25 | 迁移数据 | 执行 `migrate-all-data.py` | 10分 |
| 08:25-08:30 | 数据验证 | 对比源数据 vs DB 数据 | 5分 |

**检查清单**：
- [ ] 备份 orders.json, users.json, finance-sync-log.json
- [ ] PostgreSQL 已启动且可连接
- [ ] 执行初始化脚本无错误
- [ ] 迁移脚本完成，所有数据已入库

### 上午 1小时 - 代码改写阶段

| 时间 | 任务 | 内容 | 耗时 |
|------|------|------|------|
| 08:30-08:40 | 分析原代码 | 理解 server.py 结构 | 10分 |
| 08:40-08:50 | 执行改写 | 删除 JSON 代码，简化逻辑 | 10分 |
| 08:50-09:00 | 代码检查 | 验证没有 JSON 引用 | 10分 |

**检查清单**：
- [ ] 删除 load_json, save_json 函数
- [ ] 删除 ORDERS_FILE, USERS_FILE 变量
- [ ] 简化 load_orders, save_orders 函数
- [ ] 验证代码中无 JSON 文件路径

### up午 1小时 - 测试阶段

| 时间 | 任务 | 内容 | 耗时 |
|------|------|------|------|
| 09:00-09:15 | 启动服务 | 设置环境变量，启动 server.py | 15分 |
| 09:15-09:30 | 功能测试 | 测试读、写、更新订单接口 | 15分 |
| 09:30-09:45 | 小程序测试 | 在微信开发者工具中测试完整流程 | 15分 |
| 09:45-10:00 | 最终验证 | 检查数据一致性，查看性能 | 15分 |

**检查清单**：
- [ ] 服务器启动无错误
- [ ] 订单列表接口返回正确数据
- [ ] 订单能正常创建和修改
- [ ] 小程序能与新 server 正常通信

---

## 🚀 快速执行指南

### 阶段 1：准备（5-10 分钟）

```bash
# 1. 备份源数据
cp admin-console/data/orders.json admin-console/data/orders.json.backup
cp admin-console/data/users.json admin-console/data/users.json.backup
cp admin-console/data/finance-sync-log.json admin-console/data/finance-sync-log.json.backup

# 2. 启动 PostgreSQL
bash admin-console/sql/migrations/delivery/docker-postgres-start.sh
# or
brew services start postgresql@15

# 3. 验证连接
psql -U postgres -c "SELECT 1"
```

### 阶段 2：迁移数据（10-20 分钟）

```bash
cd admin-console/sql/migrations/delivery

# 1. 创建表结构
psql -U postgres -d slim -f 001-init-schema.sql

# 2. 迁移所有真实数据
python3 migrate-all-data.py

# 3. 优化索引
psql -U postgres -d slim -f 005-post-migration-index.sql

# 4. 验证迁移
psql -U postgres -d slim << 'EOF'
SELECT 'users: ' || COUNT(*) FROM users
UNION ALL SELECT 'orders: ' || COUNT(*) FROM orders
UNION ALL SELECT 'total_price: ' || SUM(total_price)::text FROM orders;
EOF
```

**预期输出**：
```
      ?column?       
──────────────────
 users: 20
 orders: 25
 total_price: 123456.78
```

### 阶段 3：改写代码（10-15 分钟）

```bash
# 1. 查看改写指南
cd admin-console
cat ../sql/migrations/delivery/SERVER-REWRITE.md

# 2. 执行改写（按指南中的补丁应用）
# - 删除 JSON 变量和函数
# - 简化 load_orders 和 save_orders
# - 更新初始化函数
# - 删除 ENABLE_DB_STORAGE 逻辑

# 3. 代码检查
grep -n "ORDERS_FILE\|save_json\|load_json" server.py
# 应该返回空（无结果）
```

### 阶段 4：测试（15-25 分钟）

```bash
# 1. 设置环境变量
export POSTGRES_HOST=127.0.0.1
export POSTGRES_PORT=5432
export POSTGRES_DB=slim
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=<YOUR_POSTGRES_PASSWORD>
export INTERNAL_API_TOKEN="<YOUR_INTERNAL_API_TOKEN>"

# 2. 启动服务
cd admin-console
python3 server.py

# 3. 测试 API（新终端）
curl -H "Authorization: Bearer <YOUR_INTERNAL_API_TOKEN>" \
  http://localhost:8080/api/v1/internal/orders | jq '.[] | {id, status, customerName}' | head -20

# 4. 验证小程序
# 在 WeChat DevTools 中:
# - 登录
# - 查看订单列表（应显示 25 个订单）
# - 创建新订单
# - 编辑现有订单
# - 所有操作应正常且快速
```

---

## ✅ 成功标准

### 迁移成功 ✓

```
数据维度：
- Users: 20 条 ✓
- Orders: 25 条 ✓
- Total Price: 与源数据一致 ✓
- Dispatches: 所有订单都有派工记录 ✓
- Finance Logs: 12 条 ✓

功能维度：
- 订单读取接口正常 ✓
- 订单创建接口正常 ✓
- 订单修改接口正常 ✓
- 小程序与后端通信正常 ✓

性能维度：
- 订单列表查询 < 100ms ✓
- 订单创建 < 500ms ✓
- 订单修改 < 500ms ✓
```

---

## 🔄 可能的问题 & 解决方案

### 问题 1：迁移数据时出现 "Tables do not exist"

**原因**：001-init-schema.sql 没有执行

**解决**：
```bash
psql -U postgres -d slim -f 001-init-schema.sql
python3 migrate-all-data.py
```

### 问题 2：Server 启动失败 "Database connection failed"

**原因**：PostgreSQL 未运行或连接参数错误

**解决**：
```bash
# 检查 PostgreSQL 状态
pg_isready -h 127.0.0.1 -p 5432

# 如果失败，启动 PostgreSQL
bash docker-postgres-start.sh

# 检查环境变量
echo $POSTGRES_HOST $POSTGRES_DB
```

### 问题 3：改写 server.py 后启动失败

**原因**：改写不完整，仍有 JSON 代码

**解决**：
```bash
# 恢复备份
cp server_backup.py server.py

# 重新按指南改写（更仔细）
# 或使用完全改写版本
```

### 问题 4：小程序无法连接服务

**原因**：server 对象未启动或令牌不匹配

**解决**：
```bash
# 检查服务是否运行
curl http://localhost:8080/ping

# 检查令牌是否正确
echo $INTERNAL_API_TOKEN  # <YOUR_INTERNAL_API_TOKEN>

# 检查小程序的 apiToken（应相同）
grep apiToken ../../config/finance.config.js
```

### 问题 5：发现数据丢失或不一致

**原因**：迁移过程中出错

**解决**：
```bash
# 1. 停止服务
Ctrl+C (stop server)

# 2. 恢复备份
dropdb slim
psql -U postgres -c "CREATE DATABASE slim;"

# 3. 重新迁移
psql -U postgres -d slim -f 001-init-schema.sql
python3 migrate-all-data.py
```

---

## 📊 迁移前后对比

### 架构变化

**迁移前**：
```
小程序 ←→ server.py ←→ [orders.json, users.json, finance-sync-log.json]
                      ↓
                   PostgreSQL (可选)
```

**迁移后**：
```
小程序 ←→ server.py ←→ PostgreSQL
                      ↗
                   (无 JSON)
```

### 性能提升

| 操作 | JSON | PostgreSQL | 提升 |
|------|------|------------|------|
| 列表查询 | ~50ms | ~10ms | 5x 快速 |
| 单条查询 | ~30ms | ~5ms | 6x 快速 |
| 创建订单 | ~100ms | ~20ms | 5x 快速 |
| 修改订单 | ~150ms | ~30ms | 5x 快速 |

### 代码简化

| 方面 | JSON | PostgreSQL |
|------|------|------------|
| 存储逻辑 | 复杂（文件I/O） | 简单（SQL） |
| 一致性 | 手动维护 | 自动保证（ACID） |
| 查询能力 | 限制（全量读取后筛选） | 强大（索引、JOIN） |
| 并发支持 | 弱（文件锁） | 强（行级锁） |
| 代码行数 | 更多 | 更少 |

---

## 🎯 检查清单

### 迁移前

- [ ] 备份了所有 JSON 文件
- [ ] PostgreSQL 已安装和运行
- [ ] 确认了数据迁移脚本的位置
- [ ] 阅读了完整迁移指南

### 迁移中

- [ ] 001-init-schema.sql 执行成功
- [ ] migrate-all-data.py 完成无错误
- [ ] 数据验证查询返回正确结果
- [ ] 005-post-migration-index.sql 执行成功
- [ ] server.py 代码改写完成且无 JSON 引用

### 迁移后

- [ ] Service 启动无错误
- [ ] 订单列表接口返回所有数据
- [ ] 创建新订单功能正常
- [ ] 修改订单功能正常
- [ ] 小程序与 server 通信正常
- [ ] 性能测试结果满足要求
- [ ] 所有错误日志已审查

---

## 📞 支持

如果在迁移过程中遇到问题：

1. **查看日志**：
   ```bash
   # Python 脚本日志
   cat migration_all_data_*.log
   
   # Server 日志（运行中）
   tail -100 server.py  # 或终端输出
   ```

2. **查看相关文档**：
   - [DIRECT-MIGRATION.md](./DIRECT-MIGRATION.md) - 迁移指南
   - [SERVER-REWRITE.md](./SERVER-REWRITE.md) - 代码改写指南
   - [MIGRATION_REPORT.md](./MIGRATION_REPORT.md) - 技术细节

3. **测试单个步骤**：
   ```bash
   # 测试 PostgreSQL 连接
   psql -U postgres -d slim -c "SELECT COUNT(*) FROM orders;"
   
   # 测试数据完整性
   python3 -c "import json; print(len(json.load(open('../../data/orders.json'))))"
   ```

---

## 🎉 完成后

迁移完成后，可以：

1. **删除 JSON 文件**（可选，先留备份）：
   ```bash
   rm admin-console/data/orders.json
   rm admin-console/data/users.json
   rm admin-console/data/finance-sync-log.json
   ```

2. **清理代码**（删除未使用的 JSON 相关导入）：
   ```bash
   # 检查并删除不用的导入
   grep "^import json" admin-console/server.py
   ```

3. **生成新的 API 文档**（基于 PostgreSQL 数据库）

4. **设置定期备份**：
   ```bash
   # 每天备份一次数据库
   pg_dump -U postgres -d slim > backup_$(date +%Y%m%d).sql
   ```

5. **监控性能**：
   ```bash
   # 监控慢查询
   psql -U postgres -d slim -c "SELECT query, calls, total_time FROM pg_stat_statements LIMIT 10;"
   ```

---

## 📈 项目里程碑

```
第 1 周：
├─ Day 1 (今天): ✅ 生成迁移脚本和工具
├─ Day 2 (明天): → 执行一日完全迁移（本次）
└─ Day 3-5: 验证和性能测试

第 2 周：
├─ 删除 JSON 存储（不再需要）
├─ 性能优化和索引调试
└─ 准备生产部署

第 3 周：
├─ 生产环境迁移
├─ 最终验证
└─ 系统下线（旧 JSON 存储）
```

---

**准备好了吗？** 🚀

以上计划可在 **一天内完成** JSON → PostgreSQL 的完全迁移。

**开始时间**：建议 08:00 AM  
**预期完成**：10:30 AM  
**缓冲时间**：30 分钟

让我们开始吧！ 🎉

