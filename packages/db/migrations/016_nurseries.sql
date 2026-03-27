-- 016: nurseries マスタテーブル新設 + jobs.nursery_id 追加
-- 園の詳細情報（写真・HP・アクセス・注意事項等）を一元管理

CREATE TABLE IF NOT EXISTS nurseries (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  prefecture        TEXT,
  area              TEXT,
  nursery_type      TEXT,
  qualification_req TEXT,
  address           TEXT,
  station           TEXT,
  access_info       TEXT,
  hp_url            TEXT,
  description       TEXT,
  requirements      TEXT,
  notes             TEXT,
  transport_fee     INTEGER DEFAULT 0,
  break_minutes     INTEGER DEFAULT 60,
  photo_r2_keys     TEXT DEFAULT '[]',
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_nurseries_name ON nurseries (name);
CREATE INDEX IF NOT EXISTS idx_nurseries_active ON nurseries (is_active);

-- jobs テーブルに nursery_id 追加（既存データは NULL 許容）
ALTER TABLE jobs ADD COLUMN nursery_id TEXT REFERENCES nurseries(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_nursery ON jobs (nursery_id);
