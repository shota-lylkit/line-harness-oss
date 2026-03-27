-- 015: 書類タイプ拡張（本人確認書類裏面・検便検査証）
-- D1 (SQLite) では CHECK制約を ALTER できないため、テーブル再作成が必要

CREATE TABLE IF NOT EXISTS user_documents_new (
  id          TEXT PRIMARY KEY,
  friend_id   TEXT NOT NULL,
  doc_type    TEXT NOT NULL CHECK (doc_type IN ('id_card', 'id_card_back', 'qualification_cert', 'bacterial_test_cert')),
  r2_key      TEXT NOT NULL,
  file_name   TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  created_at  TEXT NOT NULL
);

INSERT INTO user_documents_new SELECT * FROM user_documents;
DROP TABLE user_documents;
ALTER TABLE user_documents_new RENAME TO user_documents;
