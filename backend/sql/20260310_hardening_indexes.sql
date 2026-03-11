-- DB hardening for lead query and daily stats dedup.
-- Safe to execute multiple times.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_lead_assigned_sales_id
  ON lead (assigned_sales_id);

CREATE INDEX IF NOT EXISTS idx_lead_account_code
  ON lead (account_code);

CREATE INDEX IF NOT EXISTS idx_lead_store_status_created_at
  ON lead (store_code, status, created_at);

CREATE INDEX IF NOT EXISTS idx_lead_timeline_lead_event_at
  ON lead_timeline (lead_id, event_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_stats_dim
  ON daily_stats (stat_date, store_code, platform, source_channel);

COMMIT;
