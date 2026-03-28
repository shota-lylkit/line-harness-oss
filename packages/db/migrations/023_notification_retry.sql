-- 通知リトライキュー（LINE API障害時の再送用）
CREATE TABLE IF NOT EXISTS notification_retries (
  id          TEXT PRIMARY KEY,
  line_user_id TEXT NOT NULL,
  messages    TEXT NOT NULL,          -- JSON array of LINE message objects
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  context     TEXT,                   -- optional: booking_id, broadcast_id etc.
  created_at  TEXT NOT NULL,
  next_retry_at TEXT NOT NULL
);

CREATE INDEX idx_notification_retries_status ON notification_retries (status, next_retry_at);
