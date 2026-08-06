/**
 * Notes service — per-user, per-brand rich notes and meeting notes.
 *
 * Body is the editor's HTML. It's rendered on the client through a read-only
 * editor (which only emits known nodes, so it can't execute injected script),
 * but we still strip the obvious dangerous bits here as defense in depth.
 */
import { query } from '../db/pool';

export type NoteType = 'note' | 'meeting';

export interface Note {
  id: string;
  brandId: string;
  type: NoteType;
  title: string;
  body: string;
  meetingAt: Date | null;
  attendees: string | null;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteWithBrand extends Note {
  brandName: string;
  brandColor: string;
}

/** Strip script/style/iframe blocks, inline event handlers and javascript:
 *  URLs. Not a full sanitiser (notes are private to their owner), but it
 *  removes the script-execution vectors before the HTML is ever stored. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed)\b[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'>]*\2/gi, '$1=$2#$2')
    .slice(0, 200_000);
}

function rowToNote(row: any): Note {
  return {
    id: row.id,
    brandId: row.brand_id,
    type: row.type,
    title: row.title,
    body: row.body,
    meetingAt: row.meeting_at,
    attendees: row.attendees,
    pinned: row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLS = `id, brand_id, type, title, body, meeting_at, attendees, pinned, created_at, updated_at`;

export async function userOwnsBrand(userId: string, brandId: string): Promise<boolean> {
  const { rows } = await query<{ one: number }>(
    `SELECT 1 AS one FROM brands WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [brandId, userId]
  );
  return rows.length > 0;
}

export async function listByBrand(userId: string, brandId: string): Promise<Note[]> {
  const { rows } = await query<any>(
    `SELECT ${COLS} FROM organic_notes
      WHERE user_id = $1 AND brand_id = $2
      ORDER BY pinned DESC, updated_at DESC`,
    [userId, brandId]
  );
  return rows.map(rowToNote);
}

export async function getNote(userId: string, id: string): Promise<Note | null> {
  const { rows } = await query<any>(
    `SELECT ${COLS} FROM organic_notes WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [id, userId]
  );
  return rows.length ? rowToNote(rows[0]) : null;
}

export async function listRecent(userId: string, limit: number): Promise<NoteWithBrand[]> {
  const { rows } = await query<any>(
    `SELECT t.${COLS.split(', ').join(', t.')}, b.name AS brand_name, b.color AS brand_color
       FROM organic_notes t
       JOIN brands b ON b.id = t.brand_id
      WHERE t.user_id = $1
      ORDER BY t.updated_at DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows.map((r) => ({ ...rowToNote(r), brandName: r.brand_name, brandColor: r.brand_color }));
}

export interface CreateNoteInput {
  type: NoteType;
  title?: string;
  body?: string;
  meetingAt?: string | null;
  attendees?: string | null;
}

export async function createNote(userId: string, brandId: string, input: CreateNoteInput): Promise<Note> {
  const { rows } = await query<any>(
    `INSERT INTO organic_notes (user_id, brand_id, type, title, body, meeting_at, attendees)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLS}`,
    [
      userId,
      brandId,
      input.type,
      (input.title ?? '').slice(0, 500),
      sanitizeHtml(input.body ?? ''),
      input.meetingAt ?? null,
      input.attendees ?? null,
    ]
  );
  return rowToNote(rows[0]);
}

export interface UpdateNoteInput {
  title?: string;
  body?: string;
  meetingAt?: string | null;
  attendees?: string | null;
  pinned?: boolean;
}

export async function updateNote(userId: string, id: string, patch: UpdateNoteInput): Promise<Note | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const add = (col: string, val: unknown) => { sets.push(`${col} = $${i++}`); vals.push(val); };

  if (patch.title !== undefined) add('title', patch.title.slice(0, 500));
  if (patch.body !== undefined) add('body', sanitizeHtml(patch.body));
  if (patch.meetingAt !== undefined) add('meeting_at', patch.meetingAt);
  if (patch.attendees !== undefined) add('attendees', patch.attendees);
  if (patch.pinned !== undefined) add('pinned', patch.pinned);

  if (sets.length === 0) return getNote(userId, id);

  vals.push(id, userId);
  const { rows } = await query<any>(
    `UPDATE organic_notes SET ${sets.join(', ')}
      WHERE id = $${i} AND user_id = $${i + 1}
      RETURNING ${COLS}`,
    vals
  );
  return rows.length ? rowToNote(rows[0]) : null;
}

export async function deleteNote(userId: string, id: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `DELETE FROM organic_notes WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows.length > 0;
}
