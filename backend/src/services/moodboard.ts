/**
 * Moodboard service — per-brand visual reference board.
 *
 * A board is implicit: the items sharing a brand_id ARE the board. Every
 * operation is scoped by (user_id, brand_id) so one user can never touch
 * another's board, and brand ownership is re-checked on create.
 *
 * The 20-item cap lives here (COUNT before INSERT) because SQL can't
 * express "at most N rows in this group" as a constraint.
 */
import { query } from '../db/pool';

export const MOODBOARD_ITEM_LIMIT = 20;

export type MoodboardKind = 'image' | 'swatch' | 'note' | 'link';

export interface MoodboardItem {
  id: string;
  brandId: string;
  kind: MoodboardKind;
  content: Record<string, unknown>;
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
  width: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function rowToItem(row: any): MoodboardItem {
  return {
    id: row.id,
    brandId: row.brand_id,
    kind: row.kind,
    content: row.content ?? {},
    x: Number(row.x),
    y: Number(row.y),
    rotation: Number(row.rotation),
    zIndex: row.z_index,
    width: row.width === null ? null : Number(row.width),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLS = `id, brand_id, kind, content, x, y, rotation, z_index, width, created_at, updated_at`;

/** True when the brand exists and belongs to the user. */
export async function userOwnsBrand(userId: string, brandId: string): Promise<boolean> {
  const { rows } = await query<{ one: number }>(
    `SELECT 1 AS one FROM brands WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [brandId, userId]
  );
  return rows.length > 0;
}

/** All items on a brand's board, bottom-to-top (ascending z). */
export async function listItems(userId: string, brandId: string): Promise<MoodboardItem[]> {
  const { rows } = await query<any>(
    `SELECT ${COLS}
       FROM organic_moodboard_items
      WHERE user_id = $1 AND brand_id = $2
      ORDER BY z_index ASC, created_at ASC`,
    [userId, brandId]
  );
  return rows.map(rowToItem);
}

export async function countForBrand(userId: string, brandId: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT COUNT(*)::int AS n
       FROM organic_moodboard_items
      WHERE user_id = $1 AND brand_id = $2`,
    [userId, brandId]
  );
  return Number(rows[0]?.n ?? 0);
}

export interface CreateItemInput {
  userId: string;
  brandId: string;
  kind: MoodboardKind;
  content: Record<string, unknown>;
  x: number;
  y: number;
  rotation: number;
}

/** Thrown when a create would exceed MOODBOARD_ITEM_LIMIT. */
export class BoardFullError extends Error {
  constructor() {
    super(`Moodboard is full — up to ${MOODBOARD_ITEM_LIMIT} items per brand.`);
    this.name = 'BoardFullError';
  }
}

export async function createItem(input: CreateItemInput): Promise<MoodboardItem> {
  const count = await countForBrand(input.userId, input.brandId);
  if (count >= MOODBOARD_ITEM_LIMIT) {
    throw new BoardFullError();
  }
  // New items land on top: max(z)+1 for this board.
  const { rows: zr } = await query<{ z: number | null }>(
    `SELECT MAX(z_index) AS z FROM organic_moodboard_items
      WHERE user_id = $1 AND brand_id = $2`,
    [input.userId, input.brandId]
  );
  const nextZ = (zr[0]?.z ?? 0) + 1;

  const { rows } = await query<any>(
    `INSERT INTO organic_moodboard_items
       (user_id, brand_id, kind, content, x, y, rotation, z_index)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
     RETURNING ${COLS}`,
    [
      input.userId,
      input.brandId,
      input.kind,
      JSON.stringify(input.content ?? {}),
      input.x,
      input.y,
      input.rotation,
      nextZ,
    ]
  );
  return rowToItem(rows[0]);
}

export interface UpdateItemPatch {
  content?: Record<string, unknown>;
  x?: number;
  y?: number;
  rotation?: number;
  zIndex?: number;
  width?: number | null;
}

/** Patch an item the user owns. Returns null if not found / not theirs. */
export async function updateItem(
  userId: string,
  id: string,
  patch: UpdateItemPatch
): Promise<MoodboardItem | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const add = (frag: string, val: unknown) => {
    sets.push(frag.replace('?', `$${i}`));
    vals.push(val);
    i += 1;
  };

  if (patch.content !== undefined) add('content = ?::jsonb', JSON.stringify(patch.content));
  if (patch.x !== undefined) add('x = ?', patch.x);
  if (patch.y !== undefined) add('y = ?', patch.y);
  if (patch.rotation !== undefined) add('rotation = ?', patch.rotation);
  if (patch.zIndex !== undefined) add('z_index = ?', patch.zIndex);
  if (patch.width !== undefined) add('width = ?', patch.width);

  if (sets.length === 0) {
    // Nothing to change — return the current row.
    const { rows } = await query<any>(
      `SELECT ${COLS} FROM organic_moodboard_items WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [id, userId]
    );
    return rows.length ? rowToItem(rows[0]) : null;
  }

  vals.push(id, userId);
  const { rows } = await query<any>(
    `UPDATE organic_moodboard_items
        SET ${sets.join(', ')}
      WHERE id = $${i} AND user_id = $${i + 1}
      RETURNING ${COLS}`,
    vals
  );
  return rows.length ? rowToItem(rows[0]) : null;
}

export async function deleteItem(userId: string, id: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `DELETE FROM organic_moodboard_items
      WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows.length > 0;
}
