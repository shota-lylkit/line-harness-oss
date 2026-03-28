import { jstNow } from './utils.js';
import { getOrCreateTagByName, addTagToFriend, removeTagFromFriend } from './tags.js';

export interface NurseryContactRow {
  id: string;
  nursery_id: string;
  friend_id: string;
  role: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface NurseryContactWithFriend extends NurseryContactRow {
  line_user_id: string;
  display_name: string | null;
}

// --- 園の担当者一覧（LINE送信用にline_user_idも取得） ---

export async function getNurseryContacts(
  db: D1Database,
  nurseryId: string,
): Promise<NurseryContactWithFriend[]> {
  const result = await db
    .prepare(
      `SELECT nc.*, f.line_user_id, f.display_name
       FROM nursery_contacts nc
       INNER JOIN friends f ON f.id = nc.friend_id
       WHERE nc.nursery_id = ? AND nc.is_active = 1 AND f.is_following = 1
       ORDER BY nc.created_at ASC`,
    )
    .bind(nurseryId)
    .all<NurseryContactWithFriend>();
  return result.results;
}

// --- 担当者を園に紐づけ ---

export async function addNurseryContact(
  db: D1Database,
  nurseryId: string,
  friendId: string,
  role = 'staff',
): Promise<NurseryContactRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO nursery_contacts (id, nursery_id, friend_id, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (nursery_id, friend_id) DO UPDATE SET is_active = 1, role = excluded.role, updated_at = excluded.updated_at`,
    )
    .bind(id, nurseryId, friendId, role, now, now)
    .run();

  // 「園担当者」タグを自動付与（一斉送信から除外するため）
  const tag = await getOrCreateTagByName(db, '園担当者', '#F97316');
  await addTagToFriend(db, friendId, tag.id);

  const row = await db
    .prepare('SELECT * FROM nursery_contacts WHERE nursery_id = ? AND friend_id = ?')
    .bind(nurseryId, friendId)
    .first<NurseryContactRow>();
  return row!;
}

// --- 担当者解除 ---

export async function removeNurseryContact(
  db: D1Database,
  nurseryId: string,
  friendId: string,
): Promise<void> {
  await db
    .prepare('UPDATE nursery_contacts SET is_active = 0, updated_at = ? WHERE nursery_id = ? AND friend_id = ?')
    .bind(jstNow(), nurseryId, friendId)
    .run();

  // 他の園の担当者でなければ「園担当者」タグを外す
  const otherActive = await db
    .prepare(
      'SELECT COUNT(*) as cnt FROM nursery_contacts WHERE friend_id = ? AND is_active = 1',
    )
    .bind(friendId)
    .first<{ cnt: number }>();

  if (!otherActive || otherActive.cnt === 0) {
    const tag = await getOrCreateTagByName(db, '園担当者', '#F97316');
    await removeTagFromFriend(db, friendId, tag.id);
  }
}

// --- 園担当者の担当園に紐づくbooking一覧 ---

export interface NurseryStaffBooking {
  id: string;
  friend_id: string | null;
  job_id: string | null;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
  approval_status: string | null;
  approval_note: string | null;
  created_at: string;
  // job info
  nursery_id: string | null;
  nursery_name: string | null;
  work_date: string | null;
  start_time: string | null;
  end_time: string | null;
  hourly_rate: number | null;
  // worker info
  display_name: string | null;
  picture_url: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
}

export async function getBookingsByNurseryContact(
  db: D1Database,
  contactFriendId: string,
  filter: 'pending' | 'approved' | 'all' = 'all',
): Promise<NurseryStaffBooking[]> {
  let statusFilter = '';
  if (filter === 'pending') statusFilter = "AND cb.approval_status = 'pending'";
  else if (filter === 'approved') statusFilter = "AND cb.approval_status = 'approved'";

  const result = await db
    .prepare(
      `SELECT cb.id, cb.friend_id, cb.job_id, cb.title, cb.start_at, cb.end_at,
              cb.status, cb.approval_status, cb.approval_note, cb.created_at,
              j.nursery_id, j.nursery_name, j.work_date, j.start_time, j.end_time, j.hourly_rate,
              f.display_name, f.picture_url,
              cb.check_in_at, cb.check_out_at
       FROM calendar_bookings cb
       INNER JOIN jobs j ON j.id = cb.job_id
       INNER JOIN nursery_contacts nc ON nc.nursery_id = j.nursery_id
       LEFT JOIN friends f ON f.id = cb.friend_id
       WHERE nc.friend_id = ? AND nc.is_active = 1
         AND cb.status != 'cancelled'
         ${statusFilter}
       ORDER BY j.work_date DESC, j.start_time ASC`,
    )
    .bind(contactFriendId)
    .all<NurseryStaffBooking>();
  return result.results;
}

// --- 友だちが担当する園の一覧 ---

export async function getNurseriesByContact(
  db: D1Database,
  friendId: string,
): Promise<{ nursery_id: string; nursery_name: string }[]> {
  const result = await db
    .prepare(
      `SELECT nc.nursery_id, n.name as nursery_name
       FROM nursery_contacts nc
       INNER JOIN nurseries n ON n.id = nc.nursery_id
       WHERE nc.friend_id = ? AND nc.is_active = 1 AND n.is_active = 1
       ORDER BY n.name ASC`,
    )
    .bind(friendId)
    .all<{ nursery_id: string; nursery_name: string }>();
  return result.results;
}
