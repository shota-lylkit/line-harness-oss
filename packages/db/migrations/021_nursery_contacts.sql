-- 021: 園担当者マッピングテーブル
-- 1つの園に複数担当者、1人が複数園を担当するケースの両方に対応

CREATE TABLE IF NOT EXISTS nursery_contacts (
  id          TEXT PRIMARY KEY,
  nursery_id  TEXT NOT NULL REFERENCES nurseries(id) ON DELETE CASCADE,
  friend_id   TEXT NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'staff',
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nursery_contacts_unique ON nursery_contacts (nursery_id, friend_id);
CREATE INDEX IF NOT EXISTS idx_nursery_contacts_nursery ON nursery_contacts (nursery_id);
CREATE INDEX IF NOT EXISTS idx_nursery_contacts_friend ON nursery_contacts (friend_id);
