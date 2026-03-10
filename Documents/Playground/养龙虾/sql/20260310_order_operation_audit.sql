-- 订单操作审计表（用于门店经营中心状态变更追踪）

CREATE TABLE IF NOT EXISTS order_operation_audit (
  audit_id VARCHAR(60) PRIMARY KEY,
  store_code VARCHAR(20) NOT NULL,
  actor_sales_id VARCHAR(20) NOT NULL,
  actor_sales_name VARCHAR(50),
  actor_role VARCHAR(20) NOT NULL DEFAULT 'sales',
  target_type VARCHAR(20) NOT NULL DEFAULT 'order',
  target_id VARCHAR(80) NOT NULL,
  action VARCHAR(40) NOT NULL,
  result VARCHAR(20) NOT NULL DEFAULT 'success',
  before_status VARCHAR(30),
  after_status VARCHAR(30),
  error_code VARCHAR(60),
  error_message TEXT,
  source VARCHAR(80),
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_audit_store_created_at
  ON order_operation_audit (store_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_audit_target_created_at
  ON order_operation_audit (target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_audit_actor_created_at
  ON order_operation_audit (actor_sales_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_audit_result
  ON order_operation_audit (result);
