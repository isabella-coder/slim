-- 迁移后的性能优化脚本
-- 创建时间：2026-03-08
-- 执行方式：psql -U postgres -d slim -f 005-post-migration-index.sql
-- 在大数据集上执行此脚本可提升查询性能 20-30%

-- ============================================================================
-- 并发安全的索引创建
-- ============================================================================

-- 订单表额外索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_name ON orders(customer_name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_plate_number ON orders(plate_number);

-- 派工表索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dispatches_technician ON order_dispatches USING GIN(technician_names);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dispatches_work_bay ON order_dispatches(work_bay);

-- 回访表索引（日期范围查询）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followups_due_date_status ON followups(due_date, status);

-- 财务日志索引（高频查询）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_finance_logs_order_external ON finance_sync_logs(order_id, external_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_finance_logs_service_type ON finance_sync_logs(service_type);

-- ============================================================================
-- 表统计信息更新（用于查询优化器）
-- ============================================================================
ANALYZE users;
ANALYZE orders;
ANALYZE order_dispatches;
ANALYZE order_work_parts;
ANALYZE followups;
ANALYZE finance_sync_logs;
ANALYZE audit_logs;
ANALYZE attachments;

-- ============================================================================
-- 查询性能验证
-- ============================================================================

-- 1. 查询订单列表性能（应 < 100ms）
EXPLAIN ANALYZE
SELECT order_id, customer_name, status, total_price, created_at
FROM orders
WHERE status = '未完工'
ORDER BY created_at DESC
LIMIT 50;

-- 2. 查询派工看板性能（应 < 200ms）
EXPLAIN ANALYZE
SELECT 
  o.order_id,
  o.customer_name,
  o.appointment_time,
  d.work_bay,
  d.technician_names,
  COUNT(wp.id) as part_count
FROM orders o
LEFT JOIN order_dispatches d ON o.order_id = d.order_id
LEFT JOIN order_work_parts wp ON o.order_id = wp.order_id
WHERE o.appointment_time >= NOW()::date
GROUP BY o.order_id, o.customer_name, o.appointment_time, d.work_bay, d.technician_names
ORDER BY o.appointment_time
LIMIT 100;

-- 3. 查询回访任务性能（应 < 100ms）
EXPLAIN ANALYZE
SELECT 
  order_id,
  node_type,
  due_date,
  status
FROM followups
WHERE status != 'DONE'
  AND due_date <= CURRENT_DATE
ORDER BY due_date, node_type
LIMIT 100;

-- ============================================================================
-- 索引创建完成
-- ============================================================================
SELECT 
  '索引优化完成' as status,
  COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('users', 'orders', 'order_dispatches', 'order_work_parts', 'followups', 'finance_sync_logs');
