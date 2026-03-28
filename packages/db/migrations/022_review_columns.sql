-- 022_review_columns.sql
-- レビュー項目をPDFフォームに合わせてリネーム
-- Worker→園: want_to_return, job_accuracy, announcement_quality, time_accuracy
-- 園→Worker: overall_rating(働きぶり), want_to_return(また来てほしいか)

-- D1はALTER TABLE RENAME COLUMNをサポートしないため、テーブル再作成
-- テスト環境のため既存データは移行不要

DROP TABLE IF EXISTS reviews;

CREATE TABLE IF NOT EXISTS reviews (
  id                    TEXT PRIMARY KEY,
  booking_id            TEXT NOT NULL REFERENCES calendar_bookings (id) ON DELETE CASCADE,
  job_id                TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  reviewer_type         TEXT NOT NULL CHECK (reviewer_type IN ('worker', 'nursery')),
  reviewer_id           TEXT NOT NULL,
  target_id             TEXT NOT NULL,
  overall_rating        REAL NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  want_to_return        INTEGER CHECK (want_to_return BETWEEN 1 AND 5),
  job_accuracy          INTEGER CHECK (job_accuracy BETWEEN 1 AND 5),
  announcement_quality  INTEGER CHECK (announcement_quality BETWEEN 1 AND 5),
  time_accuracy         INTEGER CHECK (time_accuracy BETWEEN 1 AND 5),
  comment               TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_booking ON reviews (booking_id);
CREATE INDEX IF NOT EXISTS idx_reviews_job ON reviews (job_id);
CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews (target_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews (reviewer_id, reviewer_type);
