import { jstNow } from './utils.js';

// 園マスタ（Nurseries）クエリヘルパー

export interface NurseryRow {
  id: string;
  name: string;
  prefecture: string | null;
  area: string | null;
  nursery_type: string | null;
  qualification_req: string | null;
  address: string | null;
  station: string | null;
  access_info: string | null;
  hp_url: string | null;
  description: string | null;
  requirements: string | null;
  notes: string | null;
  transport_fee: number;
  break_minutes: number;
  photo_r2_keys: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface CreateNurseryInput {
  name: string;
  prefecture?: string;
  area?: string;
  nurseryType?: string;
  qualificationReq?: string;
  address?: string;
  station?: string;
  accessInfo?: string;
  hpUrl?: string;
  description?: string;
  requirements?: string;
  notes?: string;
  transportFee?: number;
  breakMinutes?: number;
  photoR2Keys?: string[];
}

// --- 一覧 ---

export async function getNurseries(
  db: D1Database,
  opts: { activeOnly?: boolean } = {},
): Promise<NurseryRow[]> {
  let sql = 'SELECT * FROM nurseries';
  if (opts.activeOnly !== false) {
    sql += ' WHERE is_active = 1';
  }
  sql += ' ORDER BY name ASC';
  const result = await db.prepare(sql).all<NurseryRow>();
  return result.results;
}

// --- 単体取得 ---

export async function getNurseryById(db: D1Database, id: string): Promise<NurseryRow | null> {
  return db.prepare('SELECT * FROM nurseries WHERE id = ?').bind(id).first<NurseryRow>();
}

export async function getNurseryByName(db: D1Database, name: string): Promise<NurseryRow | null> {
  return db.prepare('SELECT * FROM nurseries WHERE name = ?').bind(name).first<NurseryRow>();
}

// --- 作成 ---

export async function createNursery(db: D1Database, input: CreateNurseryInput): Promise<NurseryRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare(
      `INSERT INTO nurseries (id, name, prefecture, area, nursery_type, qualification_req, address, station, access_info, hp_url, description, requirements, notes, transport_fee, break_minutes, photo_r2_keys, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.name,
      input.prefecture ?? null,
      input.area ?? null,
      input.nurseryType ?? null,
      input.qualificationReq ?? null,
      input.address ?? null,
      input.station ?? null,
      input.accessInfo ?? null,
      input.hpUrl ?? null,
      input.description ?? null,
      input.requirements ?? null,
      input.notes ?? null,
      input.transportFee ?? 0,
      input.breakMinutes ?? 60,
      JSON.stringify(input.photoR2Keys ?? []),
      now,
      now,
    )
    .run();
  return (await getNurseryById(db, id))!;
}

// --- 更新 ---

export async function updateNursery(
  db: D1Database,
  id: string,
  input: Partial<CreateNurseryInput>,
): Promise<NurseryRow | null> {
  const sets: string[] = [];
  const binds: unknown[] = [];

  if (input.name !== undefined) { sets.push('name = ?'); binds.push(input.name); }
  if (input.prefecture !== undefined) { sets.push('prefecture = ?'); binds.push(input.prefecture); }
  if (input.area !== undefined) { sets.push('area = ?'); binds.push(input.area); }
  if (input.nurseryType !== undefined) { sets.push('nursery_type = ?'); binds.push(input.nurseryType); }
  if (input.qualificationReq !== undefined) { sets.push('qualification_req = ?'); binds.push(input.qualificationReq); }
  if (input.address !== undefined) { sets.push('address = ?'); binds.push(input.address); }
  if (input.station !== undefined) { sets.push('station = ?'); binds.push(input.station); }
  if (input.accessInfo !== undefined) { sets.push('access_info = ?'); binds.push(input.accessInfo); }
  if (input.hpUrl !== undefined) { sets.push('hp_url = ?'); binds.push(input.hpUrl); }
  if (input.description !== undefined) { sets.push('description = ?'); binds.push(input.description); }
  if (input.requirements !== undefined) { sets.push('requirements = ?'); binds.push(input.requirements); }
  if (input.notes !== undefined) { sets.push('notes = ?'); binds.push(input.notes); }
  if (input.transportFee !== undefined) { sets.push('transport_fee = ?'); binds.push(input.transportFee); }
  if (input.breakMinutes !== undefined) { sets.push('break_minutes = ?'); binds.push(input.breakMinutes); }
  if (input.photoR2Keys !== undefined) { sets.push('photo_r2_keys = ?'); binds.push(JSON.stringify(input.photoR2Keys)); }

  if (sets.length === 0) return getNurseryById(db, id);

  sets.push('updated_at = ?');
  binds.push(jstNow());
  binds.push(id);

  await db.prepare(`UPDATE nurseries SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  return getNurseryById(db, id);
}

// --- 削除（論理削除） ---

export async function deactivateNursery(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE nurseries SET is_active = 0, updated_at = ? WHERE id = ?').bind(jstNow(), id).run();
}
