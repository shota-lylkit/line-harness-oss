-- 管理者操作の監査ログ
CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT PRIMARY KEY,
  admin_id      TEXT,
  admin_email   TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  method        TEXT NOT NULL,
  path          TEXT NOT NULL,
  ip            TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);
CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON audit_log (admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at);
