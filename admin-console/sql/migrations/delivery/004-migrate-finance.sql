-- 从 JSON 迁移财务同步日志到 PostgreSQL
-- 创建时间：2026-03-08
-- 执行方式：psql -U postgres -d slim -f 004-migrate-finance.sql

BEGIN;

-- ============================================================================
-- 迁移财务同步日志
-- ============================================================================
INSERT INTO finance_sync_logs (
  log_id, order_id, event_type, service_type, order_status,
  total_price, result, external_id, payload,
  created_at, updated_at
) VALUES
  -- 样本日志 1
  (
    'd290f181f2c44d71afc67649be3849e9',
    'TM20260102103000321',
    'FinanceSync',
    'FILM',
    '已完工',
    4960.00,
    'SUCCESS',
    'FIN-20260105-00321',
    '{"id":"d290f181f2c44d71afc67649be3849e9","receivedAt":"2026-01-05 17:20","eventType":"FinanceSync","source":"mini-program","orderId":"TM20260102103000321","serviceType":"FILM","orderStatus":"已完工","totalPrice":4960,"externalId":"FIN-20260105-00321","result":"SUCCESS"}'::jsonb,
    '2026-01-05 17:20'::timestamp,
    '2026-01-05 17:20'::timestamp
  ),
  -- 样本日志 2
  (
    'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    'TM20260304100100123',
    'FinanceSync',
    'FILM',
    '未完工',
    6800.00,
    'SUCCESS',
    'FIN-20260304-00123',
    '{"id":"a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6","receivedAt":"2026-03-04 10:01","eventType":"FinanceSync","source":"mini-program","orderId":"TM20260304100100123","serviceType":"FILM","orderStatus":"未完工","totalPrice":6800,"externalId":"FIN-20260304-00123","result":"SUCCESS"}'::jsonb,
    '2026-03-04 10:01'::timestamp,
    '2026-03-04 10:01'::timestamp
  )
ON CONFLICT (log_id) DO UPDATE SET
  order_id = EXCLUDED.order_id,
  event_type = EXCLUDED.event_type,
  service_type = EXCLUDED.service_type,
  order_status = EXCLUDED.order_status,
  total_price = EXCLUDED.total_price,
  result = EXCLUDED.result,
  external_id = EXCLUDED.external_id,
  payload = EXCLUDED.payload,
  updated_at = EXCLUDED.updated_at;

-- ============================================================================
-- 验证迁移结果
-- ============================================================================
SELECT '财务日志迁移完成' as status;

SELECT 
  '财务日志统计' as type,
  COUNT(*) as total_logs,
  COUNT(DISTINCT order_id) as unique_orders,
  SUM(total_price) as total_sync_amount,
  COUNT(CASE WHEN result = 'SUCCESS' THEN 1 END) as success_count,
  COUNT(CASE WHEN result != 'SUCCESS' THEN 1 END) as error_count
FROM finance_sync_logs;

SELECT 
  '按状态统计' as type,
  result as status,
  COUNT(*) as count,
  SUM(total_price) as amount
FROM finance_sync_logs
GROUP BY result
ORDER BY result;

SELECT 
  '按事件类型统计' as type,
  event_type,
  COUNT(*) as count
FROM finance_sync_logs
GROUP BY event_type
ORDER BY event_type;

COMMIT;
