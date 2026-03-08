-- PostgreSQL 数据库表结构初始化
-- 创建时间：2026-03-08
-- 用途：建立 car-film-mini-program 单一真源数据库
-- 执行方式：psql -U postgres -d slim -f 001-init-schema.sql

-- 清理过期表（可选，仅在迁移演练时使用）
-- DROP TABLE IF EXISTS audit_logs CASCADE;
-- DROP TABLE IF EXISTS attachments CASCADE;
-- DROP TABLE IF EXISTS followups CASCADE;
-- DROP TABLE IF EXISTS order_work_parts CASCADE;
-- DROP TABLE IF EXISTS order_dispatches CASCADE;
-- DROP TABLE IF EXISTS finance_sync_logs CASCADE;
-- DROP TABLE IF EXISTS orders CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- ============================================================================
-- 1. 用户表
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'sales',
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMP,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE users IS '用户表：店长、销售、技师、财务';

-- ============================================================================
-- 2. 订单表（主表）
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  service_type TEXT NOT NULL DEFAULT 'FILM',
  status TEXT NOT NULL DEFAULT '未完工',
  customer_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  plate_number TEXT NOT NULL DEFAULT '',
  car_model TEXT NOT NULL DEFAULT '',
  sales_owner TEXT NOT NULL DEFAULT '',
  store TEXT NOT NULL DEFAULT '',
  appointment_time TIMESTAMP,
  total_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  delivery_status TEXT NOT NULL DEFAULT '',
  commission_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE orders IS '订单主表：贴膜/洗车工单';

CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_sales_owner ON orders(sales_owner);
CREATE INDEX IF NOT EXISTS idx_orders_appointment_time ON orders(appointment_time);
CREATE INDEX IF NOT EXISTS idx_orders_service_type ON orders(service_type);

-- ============================================================================
-- 3. 派工表
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_dispatches (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  dispatch_date DATE,
  dispatch_time TEXT,
  work_bay TEXT,
  technician_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  remark TEXT NOT NULL DEFAULT '',
  dispatch_status TEXT NOT NULL DEFAULT 'ASSIGNED',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE order_dispatches IS '派工信息：分配工位、技师、施工时间';
CREATE INDEX IF NOT EXISTS idx_dispatches_order_id ON order_dispatches(order_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_dispatch_date ON order_dispatches(dispatch_date);

-- ============================================================================
-- 4. 施工部位表
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_work_parts (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  technician_name TEXT NOT NULL DEFAULT '',
  part_label TEXT NOT NULL DEFAULT '',
  commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE order_work_parts IS '施工部位与提成明细';
CREATE INDEX IF NOT EXISTS idx_work_parts_order_id ON order_work_parts(order_id);

-- ============================================================================
-- 5. 回访节点表
-- ============================================================================
CREATE TABLE IF NOT EXISTS followups (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  node_type TEXT NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  done_at TIMESTAMP,
  remark TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, node_type)
);
COMMENT ON TABLE followups IS '回访节点：7/30/60/180天回访';
CREATE INDEX IF NOT EXISTS idx_followups_due_date ON followups(due_date);
CREATE INDEX IF NOT EXISTS idx_followups_status ON followups(status);
CREATE INDEX IF NOT EXISTS idx_followups_order_id ON followups(order_id);

-- ============================================================================
-- 6. 财务同步日志表
-- ============================================================================
CREATE TABLE IF NOT EXISTS finance_sync_logs (
  log_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL DEFAULT '',
  sync_type TEXT NOT NULL DEFAULT 'SYNC',
  event_type TEXT NOT NULL DEFAULT '',
  service_type TEXT NOT NULL DEFAULT '',
  order_status TEXT NOT NULL DEFAULT '',
  total_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  result TEXT NOT NULL DEFAULT 'SUCCESS',
  external_id TEXT NOT NULL DEFAULT '',
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  retry_count INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE finance_sync_logs IS '财务系统同步日志';
CREATE INDEX IF NOT EXISTS idx_finance_logs_order_id ON finance_sync_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_finance_logs_created_at ON finance_sync_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_logs_result ON finance_sync_logs(result);

-- ============================================================================
-- 7. 审计日志表
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_username TEXT NOT NULL DEFAULT '',
  actor_role TEXT NOT NULL DEFAULT '',
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  before_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE audit_logs IS '审计日志：记录所有数据变更';
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_username);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================================
-- 8. 对象存储元数据表
-- ============================================================================
CREATE TABLE IF NOT EXISTS attachments (
  attachment_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  object_key TEXT NOT NULL,
  cdn_url TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  uploaded_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE attachments IS '对象存储文件元数据：图片、文档链接';
CREATE INDEX IF NOT EXISTS idx_attachments_order_id ON attachments(order_id);
CREATE INDEX IF NOT EXISTS idx_attachments_kind ON attachments(kind);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_attachments_order_object_key ON attachments(order_id, object_key);

-- ============================================================================
-- 初始化完成
-- ============================================================================
SELECT 
  'Tables created:' as status,
  COUNT(*) as table_count
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
