-- 从 JSON 迁移订单及相关表到 PostgreSQL
-- 创建时间：2026-03-08
-- 【注意】这个脚本需要从 JSON 数据生成实际的 INSERT 语句
-- 使用 admin-console/scripts/migrate/migrate_orders.py 生成完整的 INSERT 语句

-- ============================================================================
-- 订单迁移示例
-- ============================================================================
-- 这是一个示例，展示订单及派工、施工部位、回访的完整迁移结构
-- 实际迁移数据由 Python 脚本生成的 SQL 语句替换此处

BEGIN;

-- ============================================================================
-- 1. 迁移订单主数据
-- ============================================================================
INSERT INTO orders (
  order_id, service_type, status, customer_name, phone, plate_number,
  car_model, sales_owner, store, appointment_time, total_price, 
  delivery_status, commission_total, version,
  payload, created_at, updated_at
) VALUES 
  -- 样本 1：已完工订单
  (
    'TM20260102103000321',
    'FILM',
    '已完工',
    '李先生',
    '13900005678',
    '沪B88990',
    'BMW 5系',
    '销售B',
    '龙膜精英店',
    '2026-01-03 09:30'::timestamp,
    4960.00,
    '交车通过',
    0.00,
    0,
    '{"id":"TM20260102103000321","serviceType":"FILM","status":"已完工","customerName":"李先生","phone":"13900005678","carModel":"BMW 5系","plateNumber":"沪B88990","sourceChannel":"老客户转介绍","salesBrandText":"销售B","store":"龙膜精英店","appointmentDate":"2026-01-03","appointmentTime":"09:30","packageLabel":"龙膜 AIR80 + LATI35","packageDesc":"前挡+侧后挡","priceSummary":{"totalPrice":4960},"dispatchInfo":{"date":"2026-01-03","time":"09:30","workBay":"2号工位","technicianName":"技师A","remark":"","updatedAt":"2026-01-02 11:00"},"deliveryStatus":"交车通过","deliveryPassedAt":"2026-01-05 17:20","followupRecords":[{"type":"D7","done":true,"doneAt":"2026-01-12 11:00","remark":""}],"workPartRecords":[{"technicianName":"技师A","partLabel":"左侧面"}]}'::jsonb,
    '2026-01-02 10:30'::timestamp,
    '2026-01-05 17:20'::timestamp
  ),
  -- 样本 2：未完工订单
  (
    'TM20260304100100123',
    'FILM',
    '未完工',
    '王总',
    '13800001234',
    '沪A12345',
    'Tesla Model Y',
    '销售A',
    'BOP 保镖上海工厂店',
    '2026-03-06 10:00'::timestamp,
    6800.00,
    '待交车验收',
    0.00,
    0,
    '{"id":"TM20260304100100123","serviceType":"FILM","status":"未完工","customerName":"王总","phone":"13800001234","carModel":"Tesla Model Y","plateNumber":"沪A12345","sourceChannel":"抖音","salesBrandText":"销售A","store":"BOP 保镖上海工厂店","appointmentDate":"2026-03-06","appointmentTime":"10:00","packageLabel":"BOP G75","packageDesc":"整车","priceSummary":{"totalPrice":6800},"dispatchInfo":{"date":"2026-03-06","time":"10:00","workBay":"1号工位","technicianName":"技师A","remark":"","updatedAt":"2026-03-04 11:00"},"deliveryStatus":"待交车验收","deliveryPassedAt":"","followupRecords":[],"workPartRecords":[{"technicianName":"技师A","partLabel":"前杠机盖"}]}'::jsonb,
    '2026-03-04 10:01'::timestamp,
    '2026-03-04 10:01'::timestamp
  )
ON CONFLICT (order_id) DO UPDATE SET
  service_type = EXCLUDED.service_type,
  status = EXCLUDED.status,
  customer_name = EXCLUDED.customer_name,
  phone = EXCLUDED.phone,
  plate_number = EXCLUDED.plate_number,
  car_model = EXCLUDED.car_model,
  sales_owner = EXCLUDED.sales_owner,
  store = EXCLUDED.store,
  appointment_time = EXCLUDED.appointment_time,
  total_price = EXCLUDED.total_price,
  delivery_status = EXCLUDED.delivery_status,
  commission_total = EXCLUDED.commission_total,
  version = EXCLUDED.version,
  payload = EXCLUDED.payload,
  updated_at = EXCLUDED.updated_at;

-- ============================================================================
-- 2. 迁移派工信息
-- ============================================================================
INSERT INTO order_dispatches (order_id, dispatch_date, dispatch_time, work_bay, technician_names, remark, updated_at)
VALUES
  ('TM20260102103000321', '2026-01-03'::date, '09:30', '2号工位', '["技师A"]'::jsonb, '', '2026-01-02 11:00'::timestamp),
  ('TM20260304100100123', '2026-03-06'::date, '10:00', '1号工位', '["技师A"]'::jsonb, '', '2026-03-04 11:00'::timestamp)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. 迁移施工部位
-- ============================================================================
INSERT INTO order_work_parts (order_id, technician_name, part_label, commission_amount, updated_at)
VALUES
  ('TM20260102103000321', '技师A', '左侧面', 0.00, '2026-01-05 17:20'::timestamp),
  ('TM20260304100100123', '技师A', '前杠机盖', 0.00, '2026-03-04 10:01'::timestamp)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. 迁移回访节点
-- ============================================================================
INSERT INTO followups (order_id, node_type, due_date, status, done_at, remark, updated_at)
VALUES
  ('TM20260102103000321', 'D7', '2026-01-12'::date, 'DONE', '2026-01-12 11:00'::timestamp, '', '2026-01-12 11:00'::timestamp),
  ('TM20260102103000321', 'D30', '2026-02-04'::date, 'PENDING', NULL, '', NOW()),
  ('TM20260102103000321', 'D60', '2026-03-06'::date, 'PENDING', NULL, '', NOW()),
  ('TM20260102103000321', 'D180', '2026-07-04'::date, 'PENDING', NULL, '', NOW())
ON CONFLICT (order_id, node_type) DO UPDATE SET
  status = EXCLUDED.status,
  done_at = EXCLUDED.done_at,
  updated_at = EXCLUDED.updated_at;

-- ============================================================================
-- 验证迁移结果
-- ============================================================================
SELECT '订单迁移完成' as status;

SELECT 
  '订单统计' as type,
  COUNT(*) as total_orders,
  COUNT(DISTINCT service_type) as service_types,
  SUM(total_price) as total_amount
FROM orders;

SELECT 
  '订单状态分布' as type,
  status,
  COUNT(*) as count
FROM orders
GROUP BY status
ORDER BY status;

SELECT 
  '派工覆盖率' as type,
  COUNT(DISTINCT order_id) as dispatched_orders,
  (SELECT COUNT(*) FROM orders) as total_orders,
  ROUND(100.0 * COUNT(DISTINCT order_id) / (SELECT COUNT(*) FROM orders), 2) as coverage_percent
FROM order_dispatches;

SELECT 
  '回访节点统计' as type,
  node_type,
  status,
  COUNT(*) as count
FROM followups
GROUP BY node_type, status
ORDER BY node_type, status;

COMMIT;
