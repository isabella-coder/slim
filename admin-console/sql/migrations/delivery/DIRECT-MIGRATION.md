# 直接迁移方案 - JSON 完全迁移到 PostgreSQL

## 📋 概览

**决策**：跳过分阶段方案，直接将所有数据一步迁移到 PostgreSQL。  
**优势**：
- ✅ 简化架构，无需维护 JSON/DB 一致性
- ✅ 快速上线，一天完成迁移
- ✅ 清晰的数据流，所有东西都在数据库
- ✅ 更容易维护和扩展

**风险**：
- 如果出现问题，需要快速回滚
- 测试要充分

---

## 🚀 迁移流程（一步完成）

### 步骤 1：启动 PostgreSQL

```bash
# 方案A：使用 Docker
bash docker-postgres-start.sh

# 方案B：Homebrew (Mac)
brew services start postgresql@15

# 验证连接
psql -U postgres -c "SELECT 1"
```

### 步骤 2：初始化表结构

```bash
cd admin-console/sql/migrations/delivery

# 创建所有表和索引
psql -U postgres -d slim -f 001-init-schema.sql
```

**耗时**：~2 秒  
**输出**：创建 8 个表，15+ 索引，外键约束

### 步骤 3：迁移所有真实数据

```bash
# 方式 A：使用 Python 脚本（推荐，自动处理所有数据）
python3 migrate-all-data.py

# 方式 B：使用新的全量迁移 SQL（如果只有小部分数据）
psql -U postgres -d slim -f 006-migrate-all-real-data.sql
```

**会自动迁移**：
- ✅ 用户（users.json）
- ✅ 订单（orders.json）含派工、工作项、跟进
- ✅ 财务日志（finance-sync-log.json）

**耗时**：10-30 秒（取决于数据量）

### 步骤 4：验证迁移结果

```bash
# 快速验证
psql -U postgres -d slim -c "
  SELECT 'users' as t, COUNT(*) as c FROM users
  UNION ALL SELECT 'orders', COUNT(*) FROM orders
  UNION ALL SELECT 'dispatches', COUNT(*) FROM order_dispatches
  UNION ALL SELECT 'finance_logs', COUNT(*) FROM finance_sync_logs;
"
```

### 步骤 5：优化性能索引

```bash
# 创建额外的优化索引和统计
psql -U postgres -d slim -f 005-post-migration-index.sql
```

**耗时**：~3-5 秒

---

## 📊 预期迁移结果

完成后应该看到：

```
      t       │ c 
──────────────┼───
 users        │ 20  (真实用户数)
 orders       │ 25  (真实订单数)
 dispatches   │ 23  (派工记录数)
 finance_logs │ 12  (财务日志数)
```

**总金额**：`SELECT SUM(total_price) FROM orders;`

---

## 🔧 Python 脚本选项

### 配置连接参数

```bash
# 方式 1：使用环境变量
export POSTGRES_HOST=127.0.0.1
export POSTGRES_PORT=5432
export POSTGRES_DB=slim
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=<YOUR_POSTGRES_PASSWORD>

python3 migrate-all-data.py

# 方式 2：直接修改脚本中的参数
# 编辑 migrate-all-data.py，修改：
# POSTGRES_HOST = '...'
# POSTGRES_PORT = '...'
# POSTGRES_DB = '...'
```

### 脚本功能

- 自动连接 PostgreSQL
- 验证表结构已创建
- 逐条插入用户、订单、财务日志
- 自动处理日期格式转换
- 详细日志记录
- 错误自动恢复（使用 ON CONFLICT）
- 完整的迁移摘要报告

### 查看迁移日志

```bash
# 查看最新日志
cat migration_all_data_*.log

# 或
tail -50 migration_all_data_*.log
```

---

## ✅ 一键快速迁移脚本

创建 `quick-migrate.sh` 以完全自动化：

```bash
#!/bin/bash
set -e

echo "🚀 开始直接迁移..."

# 1. 检查 PostgreSQL
pg_isready -h 127.0.0.1 -p 5432 || {
    echo "❌ PostgreSQL 未运行"
    exit 1
}

# 2. 创建数据库（如果不存在）
psql -U postgres -c "CREATE DATABASE slim;" 2>/dev/null || true

# 3. 初始化表结构
echo "📊 初始化表结构..."
psql -U postgres -d slim -f 001-init-schema.sql > /dev/null

# 4. 迁移所有数据
echo "📥 迁移所有真实数据..."
python3 migrate-all-data.py

# 5. 优化索引
echo "⚡ 优化性能索引..."
psql -U postgres -d slim -f 005-post-migration-index.sql > /dev/null

# 6. 验证
echo "✅ 验证迁移结果..."
psql -U postgres -d slim << EOF
SELECT '=== 迁移完成 ===' as status;
SELECT 'users: ' || COUNT(*) FROM users;
SELECT 'orders: ' || COUNT(*) FROM orders;
SELECT 'total_price: ' || SUM(total_price)::text FROM orders;
EOF

echo "🎉 迁移完成！"
```

保存为 `quick-migrate.sh` 后运行：

```bash
chmod +x quick-migrate.sh
./quick-migrate.sh
```

---

## 🔄 更新 Server.py

迁移成功后，需要更新 `server.py` 以完全使用 PostgreSQL：

### 关键改动

#### 1. 初始化函数（已完成）
```python
def init_database_if_needed():
    """
    初始化数据库（如果需要）
    现在只检查连接，不需要创建表（已通过 SQL 脚本创建）
    """
    # 检查 PostgreSQL 连接
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        logger.info("✓ Database initialized")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise
```

#### 2. 读取订单（完全改用 PostgreSQL）
```python
def load_orders_from_db():
    """从 PostgreSQL 读取所有订单"""
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM orders ORDER BY updated_at DESC")
            # ... 转换为 JSON 返回给前端
    except Exception as e:
        logger.error(f"Failed to load orders: {e}")
        return []
```

#### 3. 保存订单（完全改用 PostgreSQL）
```python
def save_order_to_db(order: dict):
    """直接保存到 PostgreSQL，不再写 JSON"""
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO orders (...) VALUES (...)
            ON CONFLICT (order_id) DO UPDATE SET ...
        """, params)
    # 不再调用 save_json_orders()
```

### 删除的代码

下面这些函数可以**完全删除**：
- `load_json_orders()` - 不再需要
- `save_json_orders()` - 不再需要
- `json_orders_file` - 不再需要JSON文件

---

## 🔐 快速回滚方案

如果迁移有问题，快速回滚：

### 方案 A：恢复数据库备份

```bash
# 在迁移前创建备份
pg_dump -U postgres -d slim > backup_before_migration.sql

# 如果出问题，恢复
dropdb slim
psql -U postgres -d slim < backup_before_migration.sql
```

### 方案 B：使用回滚脚本

```bash
# 清除所有数据但保留表结构
psql -U postgres -d slim -f 999-rollback-all.sql

# 重新初始化并迁移
psql -U postgres -d slim -f 001-init-schema.sql
python3 migrate-all-data.py
```

### 方案 C：快速切回 JSON（临时）

如果 PostgreSQL 出现问题，临时切回 JSON：

1. 从备份恢复或重新启动 server.py（使用 JSON 模式）
2. 检查和修复 PostgreSQL 问题
3. 验证后重新迁移

---

## 📋 完整迁移检查清单

迁移前：
- [ ] 备份了当前数据（orders.json, users.json, finance-sync-log.json）
- [ ] PostgreSQL 已安装并可连接
- [ ] 已确认 orders.json 中有真实数据

迁移过程：
- [ ] 初始化表结构成功
- [ ] Python 脚本成功迁移所有数据
- [ ] 迁移日志中没有错误

迁移后：
- [ ] 用户数、订单数、金额都与源数据一致
- [ ] 可以查询订单、派工、跟进记录
- [ ] 索引已创建，查询性能正常
- [ ] 更新了 server.py 以使用 PostgreSQL

---

## 🚨 常见问题

### Q1：Python 脚本找不到数据文件怎么办？

```bash
# 确保在正确的目录运行
cd admin-console/sql/migrations/delivery

# 检查数据文件是否存在
ls ../../data/orders.json
ls ../../data/users.json
ls ../../data/finance-sync-log.json

# 如果路径不对，修改脚本中的 DATA_DIR
```

### Q2：迁移中途断开连接了怎么办？

```bash
# 无需担心，脚本使用 ON CONFLICT 确保幂等性
# 重新运行迁移脚本即可，会自动跳过已插入的数据

python3 migrate-all-data.py
```

### Q3：想要删除所有数据重新开始怎么办？

```bash
# 使用回滚脚本
psql -U postgres -d slim -f 999-rollback-all.sql

# 然后重新迁移
python3 migrate-all-data.py
```

### Q4：如何验证迁移完整性？

```bash
# 对比源数据和迁移后的数据
psql -U postgres -d slim << 'EOF'
SELECT table_name, count(*) 
FROM (
  SELECT 'orders' as table_name, COUNT(*) as count FROM orders
  UNION ALL
  SELECT 'users', COUNT(*) FROM users
  UNION ALL
  SELECT 'dispatches', COUNT(*) FROM order_dispatches
  UNION ALL
  SELECT 'finance_logs', COUNT(*) FROM finance_sync_logs
) t
GROUP BY table_name;
EOF
```

---

## 📊 迁移统计

**需要迁移的数据**（来自 JSON 文件）：

从 `orders.json`：
- 订单数量：~25 条
- 包含的关联数据：派工、工作项、跟进

从 `users.json`：
- 用户数量：~20 条

从 `finance-sync-log.json`：
- 日志数量：~12 条

**迁移后**：
- PostgreSQL 中的表：8 个
- 索引：15+
- 总数据量：~60+ 条记录

---

## 🎯 后续工作

### 立即（迁移后 1 天内）
1. ✅ 执行数据迁移
2. ✅ 验证所有数据已正确迁移
3. ✅ 更新 server.py
4. ✅ 进行集成测试

### 第 2 周
1. 删除 JSON 文件（可选，先保留备份）
2. 清理不再使用的代码（json_orders_file 等）
3. 性能测试和优化
4. 准备生产部署

### 第 3 周
1. 生产环境迁移
2. 最终数据验证
3. 旧系统下线

---

## 📝 总结

| 方面 | 直接迁移方案 | 分阶段方案 |
|------|-----------|---------|
| 上线时间 | 1 天 | 3 周 |
| 代码复杂度 | 低（只需改一次） | 高（双写逻辑） |
| 风险 | 中（一次性迁移）| 低（逐步切换） |
| 维护成本 | 低（无需维护两套系统） | 高（需维护双写逻辑） |
| 适用场景 | 数据量小，测试充分 | 生产环境，数据量大 |

---

**倒计时**：除去迁移、验证、代码更新，可在一天内完成所有工作！🚀

