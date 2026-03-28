import { jstNow } from './utils.js';

// --- 評価（Reviews）クエリヘルパー ---
// Worker→園: want_to_return, job_accuracy, announcement_quality, time_accuracy
// 園→Worker: overall_rating(働きぶり), want_to_return(また来てほしいか)

export interface ReviewRow {
  id: string;
  booking_id: string;
  job_id: string;
  reviewer_type: 'worker' | 'nursery';
  reviewer_id: string;
  target_id: string;
  overall_rating: number;
  want_to_return: number | null;
  job_accuracy: number | null;
  announcement_quality: number | null;
  time_accuracy: number | null;
  comment: string | null;
  created_at: string;
}

export interface CreateReviewInput {
  bookingId: string;
  jobId: string;
  reviewerType: 'worker' | 'nursery';
  reviewerId: string;
  targetId: string;
  overallRating: number;
  wantToReturn?: number;
  jobAccuracy?: number;
  announcementQuality?: number;
  timeAccuracy?: number;
  comment?: string;
}

// --- 評価作成 ---

export async function createReview(db: D1Database, input: CreateReviewInput): Promise<ReviewRow> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO reviews (id, booking_id, job_id, reviewer_type, reviewer_id, target_id, overall_rating, want_to_return, job_accuracy, announcement_quality, time_accuracy, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.bookingId,
      input.jobId,
      input.reviewerType,
      input.reviewerId,
      input.targetId,
      input.overallRating,
      input.wantToReturn ?? null,
      input.jobAccuracy ?? null,
      input.announcementQuality ?? null,
      input.timeAccuracy ?? null,
      input.comment ?? null,
    )
    .run();
  return (await getReviewById(db, id))!;
}

// --- 評価取得 ---

export async function getReviewById(db: D1Database, id: string): Promise<ReviewRow | null> {
  return db.prepare('SELECT * FROM reviews WHERE id = ?').bind(id).first<ReviewRow>();
}

// --- 予約に対する評価があるか確認 ---

export async function getReviewByBookingAndType(
  db: D1Database,
  bookingId: string,
  reviewerType: 'worker' | 'nursery',
): Promise<ReviewRow | null> {
  return db
    .prepare('SELECT * FROM reviews WHERE booking_id = ? AND reviewer_type = ?')
    .bind(bookingId, reviewerType)
    .first<ReviewRow>();
}

// --- ターゲットの平均評価 ---

export interface RatingStats {
  averageRating: number;
  totalReviews: number;
  avgWantToReturn: number | null;
  avgJobAccuracy: number | null;
  avgAnnouncementQuality: number | null;
  avgTimeAccuracy: number | null;
}

export async function getTargetRatingStats(
  db: D1Database,
  targetId: string,
  reviewerType?: 'worker' | 'nursery',
): Promise<RatingStats> {
  const where = reviewerType
    ? 'WHERE target_id = ? AND reviewer_type = ?'
    : 'WHERE target_id = ?';
  const binds = reviewerType ? [targetId, reviewerType] : [targetId];

  const row = await db
    .prepare(
      `SELECT
        ROUND(AVG(overall_rating), 1) as avg_rating,
        COUNT(*) as total,
        ROUND(AVG(want_to_return), 1) as avg_want_to_return,
        ROUND(AVG(job_accuracy), 1) as avg_job_accuracy,
        ROUND(AVG(announcement_quality), 1) as avg_announcement_quality,
        ROUND(AVG(time_accuracy), 1) as avg_time_accuracy
       FROM reviews ${where}`,
    )
    .bind(...binds)
    .first<{
      avg_rating: number | null;
      total: number;
      avg_want_to_return: number | null;
      avg_job_accuracy: number | null;
      avg_announcement_quality: number | null;
      avg_time_accuracy: number | null;
    }>();

  return {
    averageRating: row?.avg_rating ?? 0,
    totalReviews: row?.total ?? 0,
    avgWantToReturn: row?.avg_want_to_return ?? null,
    avgJobAccuracy: row?.avg_job_accuracy ?? null,
    avgAnnouncementQuality: row?.avg_announcement_quality ?? null,
    avgTimeAccuracy: row?.avg_time_accuracy ?? null,
  };
}

// --- nursery_id ベースで園の評価統計を取得 ---

export async function getNurseryRatingStats(
  db: D1Database,
  nurseryId: string,
): Promise<RatingStats> {
  const row = await db
    .prepare(
      `SELECT
        ROUND(AVG(r.overall_rating), 1) as avg_rating,
        COUNT(*) as total,
        ROUND(AVG(r.want_to_return), 1) as avg_want_to_return,
        ROUND(AVG(r.job_accuracy), 1) as avg_job_accuracy,
        ROUND(AVG(r.announcement_quality), 1) as avg_announcement_quality,
        ROUND(AVG(r.time_accuracy), 1) as avg_time_accuracy
       FROM reviews r
       JOIN jobs j ON r.job_id = j.id
       WHERE j.nursery_id = ? AND r.reviewer_type = 'worker'`,
    )
    .bind(nurseryId)
    .first<{
      avg_rating: number | null;
      total: number;
      avg_want_to_return: number | null;
      avg_job_accuracy: number | null;
      avg_announcement_quality: number | null;
      avg_time_accuracy: number | null;
    }>();

  return {
    averageRating: row?.avg_rating ?? 0,
    totalReviews: row?.total ?? 0,
    avgWantToReturn: row?.avg_want_to_return ?? null,
    avgJobAccuracy: row?.avg_job_accuracy ?? null,
    avgAnnouncementQuality: row?.avg_announcement_quality ?? null,
    avgTimeAccuracy: row?.avg_time_accuracy ?? null,
  };
}

// --- 求人の評価一覧 ---

export async function getReviewsByJob(db: D1Database, jobId: string): Promise<ReviewRow[]> {
  const result = await db
    .prepare('SELECT * FROM reviews WHERE job_id = ? ORDER BY created_at DESC')
    .bind(jobId)
    .all<ReviewRow>();
  return result.results;
}

// --- ターゲットの評価一覧 ---

export async function getReviewsByTarget(
  db: D1Database,
  targetId: string,
  limit = 20,
): Promise<ReviewRow[]> {
  const result = await db
    .prepare('SELECT * FROM reviews WHERE target_id = ? ORDER BY created_at DESC LIMIT ?')
    .bind(targetId, limit)
    .all<ReviewRow>();
  return result.results;
}

// --- 全レビュー一覧（管理用: 園名・ワーカー名付き） ---

export interface ReviewWithContext extends ReviewRow {
  nursery_name: string | null;
  work_date: string | null;
  friend_display_name: string | null;
}

export async function getAllReviews(
  db: D1Database,
  limit = 100,
): Promise<ReviewWithContext[]> {
  const result = await db
    .prepare(
      `SELECT r.*,
        j.nursery_name,
        j.work_date,
        f.display_name as friend_display_name
       FROM reviews r
       LEFT JOIN jobs j ON r.job_id = j.id
       LEFT JOIN calendar_bookings b ON r.booking_id = b.id
       LEFT JOIN friends f ON b.friend_id = f.id
       ORDER BY r.created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<ReviewWithContext>();
  return result.results;
}

// --- 園IDで全レビュー取得 ---

export async function getReviewsByNurseryId(
  db: D1Database,
  nurseryId: string,
  limit = 50,
): Promise<ReviewRow[]> {
  const result = await db
    .prepare(
      `SELECT r.* FROM reviews r
       JOIN jobs j ON r.job_id = j.id
       WHERE j.nursery_id = ? AND r.reviewer_type = 'worker'
       ORDER BY r.created_at DESC LIMIT ?`,
    )
    .bind(nurseryId, limit)
    .all<ReviewRow>();
  return result.results;
}
