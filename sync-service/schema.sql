-- Durable, idempotent public aggregate/financial-effect delivery outbox.
-- Only the Worker with a valid client token should be allowed to write.
CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  lock_until INTEGER NOT NULL DEFAULT 0,
  delivered_at INTEGER,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_due
  ON sync_outbox (delivered_at, next_attempt_at, lock_until, created_at);
