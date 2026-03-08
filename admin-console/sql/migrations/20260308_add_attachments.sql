-- Add attachments table for object-storage metadata.
-- Generated on 2026-03-08.

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

CREATE INDEX IF NOT EXISTS idx_attachments_order_id ON attachments(order_id);
CREATE INDEX IF NOT EXISTS idx_attachments_kind ON attachments(kind);
CREATE INDEX IF NOT EXISTS idx_attachments_created_at ON attachments(created_at DESC);

-- Optional uniqueness guard for same object key under same order.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_attachments_order_object_key ON attachments(order_id, object_key);
