-- PostgreSQL schema v2: business-structured tables for database-first rollout

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

CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  service_type TEXT NOT NULL DEFAULT 'FILM',
  status TEXT NOT NULL DEFAULT '未完工',
  customer_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  plate_number TEXT NOT NULL DEFAULT '',
  car_model TEXT NOT NULL DEFAULT '',
  sales_owner TEXT NOT NULL DEFAULT '',
  appointment_time TIMESTAMP,
  total_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS order_work_parts (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  technician_name TEXT NOT NULL DEFAULT '',
  part_label TEXT NOT NULL DEFAULT '',
  commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS finance_sync_logs (
  log_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT '',
  service_type TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT 'SUCCESS',
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  retry_count INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_sales_owner ON orders(sales_owner);
CREATE INDEX IF NOT EXISTS idx_orders_appointment_time ON orders(appointment_time);
CREATE INDEX IF NOT EXISTS idx_dispatches_order_id ON order_dispatches(order_id);
CREATE INDEX IF NOT EXISTS idx_followups_due_date ON followups(due_date);
CREATE INDEX IF NOT EXISTS idx_followups_status ON followups(status);
CREATE INDEX IF NOT EXISTS idx_finance_logs_order_id ON finance_sync_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_finance_logs_created_at ON finance_sync_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
