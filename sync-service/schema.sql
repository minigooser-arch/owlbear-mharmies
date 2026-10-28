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

-- Existing deployments can reapply this schema safely before deploying Worker.
-- One global lease prevents parallel cron and request handlers from flooding
-- Apps Script's ScriptLock with concurrent writeback packets.
CREATE TABLE IF NOT EXISTS sync_dispatch_lease (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lock_until INTEGER NOT NULL DEFAULT 0,
  owner TEXT
);
INSERT OR IGNORE INTO sync_dispatch_lease (id, lock_until) VALUES (1, 0);
