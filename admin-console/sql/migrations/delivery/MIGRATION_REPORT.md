# 数据库迁移预期结果报告

**生成时间**: 2026-03-08  
**迁移范围**: users, orders, dispatches, work_parts, followups, finance_sync_logs  
**数据源**: admin-console/data/ (JSON 文件)  
**目标**: PostgreSQL 数据库 (slim)

---

## 📊 预期迁移数据量

| 表名 | 预期行数 | 说明 |
|------|---------|------|
| **users** | 4 | 店长×1、销售×2、技师×1 |
| **orders** | 3 | 已完工×1、未完工×2 |
| **order_dispatches** | 3 | 每订单1条派工记录 |
| **order_work_parts** | 3 | 每订单平均1条施工部位 |
| **followups** | 4+ | 完工订单×4个回访节点 |
| **finance_sync_logs** | 12+ | 财务同步日志 |
| **audit_logs** | 0 | 初始为空（运行时生成） |

---

## 💰 金额汇总验证

```
订单总额预期：
  已完工订单 (TM20260102103000321):  4,960.00 CNY
  未完工订单 (TM20260304100100123):  6,800.00 CNY
  未完工订单 (TM20260301150000777):  9,800.00 CNY
  ─────────────────────────────────
  订单总计：                        21,560.00 CNY

财务日志汇总预期 >= 订单总额
```

---

## 📋 订单状态分布

| 状态 | 预期数量 | 备注 |
|------|---------|------|
| 未完工 | 2 | 已派工但未交车 |
| 已完工 | 1 | 已交车通过 |
| 已取消 | 0 | 无 |
| **小计** | **3** | |

---

## 🔄 派工覆盖率

**预期覆盖率**: 100%

- 派工总数: 3 条
- 订单总数: 3 条
- 覆盖率: 3 ÷ 3 = 100%

---

## 📞 回访节点统计

| 节点 | 已完成 | 待处理 | 逾期 | 合计 |
|------|--------|--------|------|------|
| D7 (7天) | 1 | 0 | 0 | 1 |
| D30 (30天) | 0 | 1 | 0 | 1 |
| D60 (60天) | 0 | 1 | 0 | 1 |
| D180 (180天) | 0 | 1 | 0 | 1 |
| **合计** | **1** | **3** | **0** | **4** |

---

## 💳 财务日志验证

### 预期日志数量
- 迁移前总日志: 12 条
- 预期迁移行数: 12 条
- 预期差异: 0

### 按状态分布
| 状态 | 数量 | 金额 |
|------|------|------|
| SUCCESS | ≥ 10 | ≥ 20,000 |
| FAILED | 0-2 | 可变 |

### 示例日志内容验证
```
预期包含以下字段的完整保留：
- log_id: 唯一标识
- order_id: 订单关联
- event_type: 事件类型（FinanceSync等）
- result: SUCCESS or FAILED
- total_price: 金额
- payload: 完整请求/响应数据
- created_at: 创建时间
```

---

## ✅ 迁移验证检查清单

执行完迁移脚本后，需要验证以下内容：

### 1. 表结构验证
```sql
-- 应返回 8 个表
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
```

### 2. 数据一致性验证
```sql
-- 订单金额对比
SELECT 'JSON预期' as source, 21560.00 as total
UNION ALL
SELECT 'DB实际', SUM(total_price) FROM orders;

-- 结果应相同，差异为 0
```

### 3. 版本控制验证
```sql
-- 所有订单版本号应为 0（初始状态）
SELECT * FROM orders WHERE version != 0;
-- 应返回 0 行
```

### 4. 时间戳验证
```sql
-- 检查 created_at ≤ updated_at
SELECT COUNT(*) as invalid_rows FROM orders
WHERE created_at > updated_at;
-- 应返回 0 行
```

### 5. 关键字段验证
```sql
-- 所有订单应有必填字段（非空）
SELECT COUNT(*) as missing_fields FROM orders
WHERE customer_name = '' OR phone = '' OR total_price = 0;

-- 对于预期有值的订单，应返回 0 行
```

### 6. 关联关系验证
```sql
-- 派工表中的订单ID应全部在订单表中存在
SELECT COUNT(*) as orphaned_dispatches FROM order_dispatches
WHERE order_id NOT IN (SELECT order_id FROM orders);
-- 应返回 0 行

-- 同理检查其他子表
SELECT COUNT(*) as orphaned_work_parts FROM order_work_parts
WHERE order_id NOT IN (SELECT order_id FROM orders);
```

---

## 📈 性能基准测试

迁移完成后，应执行以下性能查询验证：

| 查询 | 预期响应时间 | 备注 |
|------|-------------|------|
| 订单列表（50条） | < 100ms | 全表扫描 |
| 派工看板（100条） | < 200ms | 多表 JOIN |
| 回访任务（100条） | < 100ms | 范围查询 |
| 财务日志（1000条） | < 300ms | 聚合查询 |

---

## 🔄 迁移流程建议

### Phase 1: 准备（15 分钟）
- [ ] 备份现有 JSON 数据
- [ ] 创建测试数据库 `slim_test`
- [ ] 检查 PostgreSQL 连接参数

### Phase 2: 执行迁移（30 分钟）
```bash
# 初始化表结构
psql -U postgres -d slim -f 001-init-schema.sql

# 迁移数据
psql -U postgres -d slim -f 002-migrate-users.sql
psql -U postgres -d slim -f 003-migrate-orders.sql
psql -U postgres -d slim -f 004-migrate-finance.sql

# 优化性能
psql -U postgres -d slim -f 005-post-migration-index.sql
```

### Phase 3: 验证（30 分钟）
```bash
# 执行一致性校验脚本
python3 reconcile_db_vs_json.py --dsn postgresql://postgres@localhost/slim

# 检查完整性
psql -U postgres -d slim -f verify-integrity.sql
```

### Phase 4: 确认（10 分钟）
- [ ] 订单数量差异 = 0
- [ ] 金额汇总差异 = 0
- [ ] 样本字段一致率 = 100%
- [ ] 查询响应时间符合预期
- [ ] **通过后执行**：`server.py` 切换读路径到 DB

---

## 🚨 可能的风险点

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| JSON 编码错误 | 数据丢失 | 逐行验证，字符编码检查 |
| 日期格式不一致 | 时间戳错误 | 使用统一的 `%Y-%m-%d %H:%M` |
| 重复订单ID | 数据冲突 | ON CONFLICT 处理 |
| 关闭连接丢失 | 迁移中断 | 使用事务（BEGIN/COMMIT） |
| 版本号初始化 | CMS 冲突 | 确保所有订单 version=0 |

---

## 📞 问题排查

### Q: 迁移中断如何处理？
A: 
```sql
-- 查看错误
psql -U postgres -d slim -f 001-init-schema.sql 2>&1 | tail -50

-- 回滚数据
psql -U postgres -d slim -c "ROLLBACK;"

-- 清理重试
psql -U postgres -d slim -f 999-rollback-all.sql
```

### Q: 如何增量迁移后续数据？
A:
```bash
# 使用 --since 参数仅迁移更新的记录
python3 migrate_orders.py --since "2026-03-08 16:00"
```

### Q: 如何验证迁移的准确性？
A:
```bash
# 生成对比报告
python3 reconcile_db_vs_json.py \
  --dsn postgresql://postgres@localhost/slim \
  --sample-size 200 \
  --fail-on-diff
```

---

## ✨ 迁移成功标志

当以下所有条件均满足时，迁移成功：

✅ 所有表已创建  
✅ 数据行数与预期一致 ± 5%  
✅ 金额汇总差异 = 0  
✅ 无孤立外键记录  
✅ 版本号初始化正确  
✅ 索引已创建  
✅ 性能查询通过  
✅ `server.py` 能读取 DB 数据  

---

**下一步**: 通过后端代码改造验证数据可读性 🚀
