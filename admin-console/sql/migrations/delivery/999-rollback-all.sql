-- ============================================================================
-- 完整回滚脚本
-- ============================================================================
-- 用途：在迁移失败或需要回退时，恢复到迁移前状态
-- 执行方式：psql -U postgres -d slim -f 999-rollback-all.sql
-- 【警告】此脚本会删除所有数据！！！请先备份！！！

-- ============================================================================
-- 备份当前数据（推荐）
-- ============================================================================
-- 本地备份到JSON文件：
-- psql -U postgres -d slim -c "
--   SELECT jsonb_agg(row_to_json(t))
--   FROM (SELECT * FROM orders ORDER BY order_id) t
-- " > orders_backup_20260308.json

-- 或使用 pg_dump：
-- pg_dump -U postgres -d slim -t orders > orders_backup_20260308.sql

-- ============================================================================
-- 回滚步骤
-- ============================================================================

BEGIN;

-- 步骤 1: 删除审计日志
DELETE FROM audit_logs;
SELECT '✓ 已清空 audit_logs' as status;

-- 步骤 2: 删除附件引用
DELETE FROM attachments;
SELECT '✓ 已清空 attachments' as status;

-- 步骤 3: 删除回访节点
DELETE FROM followups;
SELECT '✓ 已清空 followups' as status;

-- 步骤 4: 删除财务日志
DELETE FROM finance_sync_logs;
SELECT '✓ 已清空 finance_sync_logs' as status;

-- 步骤 5: 删除施工部位（级联删除）
DELETE FROM order_work_parts;
SELECT '✓ 已清空 order_work_parts' as status;

-- 步骤 6: 删除派工信息（级联删除）
DELETE FROM order_dispatches;
SELECT '✓ 已清空 order_dispatches' as status;

-- 步骤 7: 删除订单主表
DELETE FROM orders;
SELECT '✓ 已清空 orders' as status;

-- 步骤 8: 删除用户
DELETE FROM users;
SELECT '✓ 已清空 users' as status;

-- ============================================================================
-- 验证表已清空
-- ============================================================================
SELECT 
  'users' as table_name,
  COUNT(*) as row_count
FROM users

UNION ALL

SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'order_dispatches', COUNT(*) FROM order_dispatches
UNION ALL
SELECT 'order_work_parts', COUNT(*) FROM order_work_parts
UNION ALL
SELECT 'followups', COUNT(*) FROM followups
UNION ALL
SELECT 'finance_sync_logs', COUNT(*) FROM finance_sync_logs
UNION ALL
SELECT 'audit_logs', COUNT(*) FROM audit_logs

ORDER BY row_count DESC;

-- ============================================================================
-- 可选：删除表结构（使用谨慎）
-- ============================================================================
-- 取消注释以下行以删除表定义（完全回滚）：
-- 
-- DROP TABLE IF EXISTS audit_logs CASCADE;
-- DROP TABLE IF EXISTS attachments CASCADE;
-- DROP TABLE IF EXISTS followups CASCADE;
-- DROP TABLE IF EXISTS order_work_parts CASCADE;
-- DROP TABLE IF EXISTS order_dispatches CASCADE;
-- DROP TABLE IF EXISTS finance_sync_logs CASCADE;
-- DROP TABLE IF EXISTS orders CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- COMMIT;

-- ============================================================================
-- 【重要】手动确认提交（防止意外删除）
-- ============================================================================
-- 如果上面的查询显示数据已删除，执行以下语句以确认回滚：
-- COMMIT;
--
-- 如果要中止回滚，执行：
-- ROLLBACK;
