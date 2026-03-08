# 数据库迁移指南

## 概览

本目录包含完整的 PostgreSQL 数据库迁移脚本包，用于将 `car-film-mini-program` 项目从 JSON 存储迁移到 PostgreSQL 关系型数据库。

## 目录结构

```
delivery/
├── 001-init-schema.sql           # 第1步：创建表结构和索引
├── 002-migrate-users.sql         # 第2步：迁移用户数据
├── 003-migrate-orders.sql        # 第3步：迁移订单及关联数据
├── 004-migrate-finance.sql       # 第4步：迁移财务日志
├── 005-post-migration-index.sql  # 第5步：创建优化索引和性能验证
├── 999-rollback-all.sql          # 排拔：安全清除所有数据（带事务隔离）
├── MIGRATION_REPORT.md           # 详细迁移报告和验证清单
├── run-migration.sh              # 一键迁移脚本（推荐）
└── README.md                      # 本文件
```

## 前置条件

### 1. PostgreSQL 已安装并运行

**方案 A：使用 Docker**
```bash
bash docker-postgres-start.sh
```

**方案 B：使用 Homebrew（Mac）**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**方案 C：使用官方安装程序**
访问 https://www.postgresql.org/download/macosx/

### 2. 验证连接

```bash
# 默认用户和密码
psql -U postgres -d postgres -c "SELECT 1"

# 如果提示输入密码，输入 'postgres'
```

## 快速开始（推荐）

### 方式 1：一键执行（自动化）

```bash
cd admin-console/sql/migrations/delivery
bash run-migration.sh
```

脚本会自动：
- 检查 PostgreSQL 连接
- 创建数据库（如果不存在）
- 按正确顺序执行 5 个迁移脚本
- 生成迁移报告和日志

### 方式 2：手动执行（分步）

```bash
# 登录 PostgreSQL
psql -U postgres

# 创建数据库
CREATE DATABASE slim;

# 退出
\q

# 按顺序执行脚本
cd admin-console/sql/migrations/delivery

psql -U postgres -d slim -f 001-init-schema.sql
psql -U postgres -d slim -f 002-migrate-users.sql
psql -U postgres -d slim -f 003-migrate-orders.sql
psql -U postgres -d slim -f 004-migrate-finance.sql
psql -U postgres -d slim -f 005-post-migration-index.sql
```

## 各脚本说明

### 001-init-schema.sql（初始化表结构）

**功能**：创建 8 个表和 15+ 索引

**创建的表**：
- `users` - 用户信息和权限
- `orders` - 订单主表
- `order_dispatches` - 订单派工记录
- `order_work_parts` - 订单工作项
- `followups` - 订单跟进任务
- `finance_sync_logs` - 财务对账日志
- `audit_logs` - 审计日志
- `attachments` - 附件记录

**特点**：
- 包含 JSONB 列以保持灵活性
- 完整的外键约束
- 优化的索引设计
- 创建索引的并发模式（非锁定）

**执行时间**：~2-3 秒

### 002-migrate-users.sql（迁移用户数据）

**功能**：插入 4 个目标用户

**sample 数据**：
- 经理用户 1 人
- 销售人员 2 人
- 技术人员 1 人

**特点**：
- 使用 ON CONFLICT 实现幂等性（可重复运行）
- 包含 role 和 permissions 定义
- 预设密码（生产环境需修改）

**验证查询**：
```sql
SELECT COUNT(*) as user_count, COUNT(DISTINCT role) as role_types FROM users;
```

**执行时间**：~1 秒

### 003-migrate-orders.sql（迁移订单数据）

**功能**：迁移订单及其所有关联数据

**sample 数据**：
- 订单 1：TM20260102103000321（已完工）
  - 1 份派工记录
  - 2 份工作项
  - 2 份跟进记录
  
- 订单 2：TM20260103114000503（进行中）
  - 1 份派工记录
  - 1 份工作项
  - 2 份跟进记录

**关键字段**：
- `status` - 订单状态（未完工/已完工）
- `customer_name` - 客户名称
- `total_price` - 总价
- `appointment_time` - 预约时间
- `dispatch_date` - 派工日期
- `version` - 乐观锁版本号（并发控制）

**特点**：
- 完整的订单-派工-工作项-跟进的多对一关系
- 包括来自 JSON 的完整 payload
- UGC 数据取自真实 orders.json
- 验证查询核对数据一致性

**验证查询**：
```sql
SELECT COUNT(*) as total_orders, SUM(total_price) as total_amount FROM orders;
```

**执行时间**：~2-3 秒

### 004-migrate-finance.sql（迁移财务日志）

**功能**：迁移财务对账日志

**sample 数据**：
- 12 条财务同步日志
- 覆盖多个订单和两种状态

**记录信息**：
- `sync_type` - 同步类型
- `result` - 结果（SUCCESS/FAILED）
- `external_id` - 外部系统 ID
- `amount` - 金额
- `error_message` - 错误信息（如有）

**验证查询**：
```sql
SELECT result, COUNT(*) FROM finance_sync_logs GROUP BY result;
SELECT SUM(amount) as total_synced_amount FROM finance_sync_logs WHERE result = 'SUCCESS';
```

**执行时间**：~1 秒

### 005-post-migration-index.sql（性能优化）

**功能**：
1. 创建追加的并发索引（非锁定创建）
2. 执行 ANALYZE 以更新查询计划
3. 运行性能基准测试

**创建的索引**：
- 订单创建时间（流式查询优化）
- 订单电话（客户查询优化）
- 派工技术员（技术员看板优化）
- 跟进状态（跟进热点优化）
- 财务金额（财务分析优化）

**性能基准**：
- 订单列表查询：< 100ms
- 派工看板查询：< 200ms
- 跟进任务查询：< 100ms

**测试查询**：
```sql
EXPLAIN ANALYZE SELECT * FROM orders ORDER BY updated_at DESC LIMIT 20;
EXPLAIN ANALYZE SELECT * FROM order_dispatches WHERE dispatch_date >= '2026-01-01';
EXPLAIN ANALYZE SELECT * FROM followups WHERE followup_nodes @> '["D7"]'::jsonb LIMIT 50;
```

**执行时间**：~3-5 秒（包括 ANALYZE）

### 999-rollback-all.sql（安全清除）

**功能**：撤销所有数据，恢复到空表状态

**功能特性**：
- ⚠️ **关键功能**：不包含自动 COMMIT，需要手动确认
- 使用事务隔离（BEGIN ... 不 COMMIT）
- 删除顺序遵循外键依赖关系（逆序）
- 保留表结构（删除数据，不删表）
- 可选的删除表结构命令（已注释）

**使用方式**：
```bash
# 查看将要删除的内容
psql -U postgres -d slim -f 999-rollback-all.sql --dry-run

# 实际执行删除，但不提交（可检查后回滚）
psql -U postgres -d slim -f 999-rollback-all.sql

# 检查结果，如果满意则确认
psql -U postgres -d slim -c "COMMIT;"

# 或者放弃删除
psql -U postgres -d slim -c "ROLLBACK;"
```

**安全机制**：
1. 每个 DELETE 前都有 SELECT COUNT(*) 显示影响行数
2. 不自动 COMMIT（必须手动确认）
3. 完文事务日志留下删除操作记录
4. 支持完整回滚（ROLLBACK 命令）

**执行时间**：~1-2 秒

## 迁移报告和验证

### 1. 查看详细报告

```bash
cat MIGRATION_REPORT.md
```

报告包含：
- 预期数据统计
- 验证清单（6 个 SQL 查询）
- 风险矩阵（5 类风险）
- 故障排查 FAQ
- 成功标准

### 2. 运行验证查询

迁移完成后，运行以下命令验证数据完整性：

```bash
psql -U postgres -d slim -c "
  SELECT '=== 表行数 ===' as check;
  SELECT 'users: ' || COUNT(*) FROM users;
  SELECT 'orders: ' || COUNT(*) FROM orders;
  SELECT 'dispatches: ' || COUNT(*) FROM order_dispatches;
  SELECT 'work_parts: ' || COUNT(*) FROM order_work_parts;
  SELECT 'followups: ' || COUNT(*) FROM followups;
  SELECT 'finance_logs: ' || COUNT(*) FROM finance_sync_logs;
  
  SELECT '=== 金额汇总 ===' as check;
  SELECT 'total_price: ' || SUM(total_price)::text FROM orders;
  
  SELECT '=== 订单状态分布 ===' as check;
  SELECT status || ': ' || COUNT(*) FROM orders GROUP BY status;
"
```

### 3. 预期结果

**成功迁移标志**：
- [ ] 用户数 = 4
- [ ] 订单数 = 3  
  - 已完工 = 1
  - 未完工 = 2
- [ ] 派工记录 = 3（100% 覆盖）
- [ ] 总金额 = 21,560 CNY
- [ ] 所有外键约束有效
- [ ] 所有索引已创建

## 常见问题解决

### 连接失败：`FATAL: authentication failed for user "postgres"`

**原因**：密码错误或者 PostgreSQL 以无密码模式运行

**解决**：
```bash
# 方案A：添加 -w 跳过密码提示
psql -U postgres -d slim -w -f 001-init-schema.sql

# 方案B：设置环境变量
export PGPASSWORD=postgres
psql -U postgres -d slim -f 001-init-schema.sql

# 方案C：修改脚本中的 POSTGRES_PASSWORD
```

### 错误：`database "slim" already exists`

**原因**：数据库已存在

**解决**：
```bash
# 选项1：使用现有数据库
psql -U postgres -d slim -f 001-init-schema.sql

# 选项2：删除旧数据库重新开始
dropdb slim
bash run-migration.sh
```

### 错误：`relation "users" does not exist`

**原因**：未运行 001-init-schema.sql

**解决**：
```bash
# 确保按正确顺序执行脚本
psql -U postgres -d slim -f 001-init-schema.sql
psql -U postgres -d slim -f 002-migrate-users.sql
# ... 继续
```

### 脚本执行卡住或超时

**原因**：PostgreSQL 响应缓慢或网络延迟

**解决**：
```bash
# 增加超时时间（秒）
PGCONNECT_TIMEOUT=20 psql -U postgres -d slim -f 001-init-schema.sql

# 或者检查 PostgreSQL 是否运行
pg_isready -h 127.0.0.1 -p 5432
```

## 高级选项

### 自定义连接参数

```bash
# 修改主机、端口或用户
POSTGRES_HOST=192.168.1.100 \
POSTGRES_PORT=5433 \
POSTGRES_USER=admin \
POSTGRES_PASSWORD=secret123 \
bash run-migration.sh
```

### 仅运行特定脚本

```bash
# 仅初始化表结构，不迁移数据
psql -U postgres -d slim -f 001-init-schema.sql

# 仅迁移订单
psql -U postgres -d slim -f 003-migrate-orders.sql
```

### 备份和恢复

```bash
# 在迁移前备份
pg_dump -U postgres -d slim > backup_before_migration.sql

# 如果出现问题，恢复
psql -U postgres -d slim < backup_before_migration.sql
```

## 下一步工作

### 迁移后

1. **验证数据一致性**
   ```bash
   python3 ../../reconcile_db_vs_json.py
   ```

2. **更新后端代码以使用 PostgreSQL**
   - 修改 `server.py` 中的 `load_orders()` 以读取 PostgreSQL
   - 修改 `save_orders_to_db()` 以写入 PostgreSQL

3. **实施双写逻辑**（第 2 周）
   - 同时写入 PostgreSQL 和 JSON
   - 读取优先使用 PostgreSQL，JSON 作为备份

4. **性能监控**
   - 设置定时任务比对数据可确一致性
   - 监控查询性能和索引命中率

5. **最终切换**（第 3 周）
   - 变更为 PostgreSQL 优先（停止 JSON 更新）
   - 保留 JSON 作为存档备份
   - 准备 15 分钟快速回滚流程

## 支持和故障排除

### 获取服务器日志

```bash
# 查看迁移日志
cat migration_*.log

# 查看迁移报告
cat migration_report_*.txt
```

### 连接到数据库进行调试

```bash
# 以交互模式连接
psql -U postgres -d slim

# 运行调试查询
SELECT * FROM orders LIMIT 1;
SELECT COUNT(*) FROM orders;
```

### 重置数据库

```bash
# 完全重置（删除数据库）
dropdb slim
dropdb -U postgres slim

# 然后重新开始
bash run-migration.sh
```

## 安全提示

⚠️ **生产环境注意事项**：

1. **更改默认密码**
   - PostgreSQL 默认用户 postgres 密码为空或 'postgres'
   - 生产环境必须更改

2. **启用 SSL 连接**
   ```bash
   # 连接时使用 SSL
   psql "postgresql://postgres@127.0.0.1/slim?sslmode=require"
   ```

3. **设置备份策略**
   ```bash
   # 定期备份
   pg_dump -U postgres -d slim > slim_backup_$(date +%Y%m%d).sql
   ```

4. **限制数据库访问**
   - 配置 `pg_hba.conf` 仅允许授权的主机
   - 创建专用的数据库用户和角色

5. **启用审计日志**
   - 使用 PostgreSQL 的 `audit_logs` 表
   - 配置日志级别以捕获 DDL 和 DML 操作

## 许可证

本迁移脚本包是 `car-film-mini-program` 项目的一部分。

---

**最后更新**：2026 年 3 月  
**维护人员**：项目团队  
**版本**：1.0
