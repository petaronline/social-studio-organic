/**
 * Tasks service — per-user, per-brand to-do lists.
 *
 * Every operation is scoped by (user_id, …) so a user only ever touches their
 * own tasks; creating one re-checks brand ownership. The dashboard's
 * cross-brand top-5 comes from listRecent, which joins the brand so each row
 * can show its brand mark.
 */
import { query } from '../db/pool';

export interface Task {
  id: string;
  brandId: string;
  title: string;
  done: boolean;
  completedAt: Date | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  /** 'YYYY-MM-DD' or null. */
  dueDate: string | null;
  tag: string | null;
}

/** A task plus the brand it belongs to — for the cross-brand dashboard list. */
export interface TaskWithBrand extends Task {
  brandName: string;
  brandColor: string;
}

function rowToTask(row: any): Task {
  return {
    id: row.id,
    brandId: row.brand_id,
    title: row.title,
    done: row.done,
    completedAt: row.completed_at,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dueDate: row.due_date ?? null,
    tag: row.tag ?? null,
  };
}

const COLS = `id, brand_id, title, done, completed_at, sort_order, created_at, updated_at, due_date, tag`;

function cleanTag(tag: string | null | undefined): string | null {
  if (tag == null) return null;
  const t = tag.trim().replace(/^#+/, '').slice(0, 40);
  return t.length ? t : null;
}

export async function userOwnsBrand(userId: string, brandId: string): Promise<boolean> {
  const { rows } = await query<{ one: number }>(
    `SELECT 1 AS one FROM brands WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [brandId, userId]
  );
  return rows.length > 0;
}

/** A brand's tasks — open first, then done, each group by manual order then age. */
export async function listByBrand(userId: string, brandId: string): Promise<Task[]> {
  const { rows } = await query<any>(
    `SELECT ${COLS}
       FROM organic_tasks
      WHERE user_id = $1 AND brand_id = $2
      ORDER BY done ASC, sort_order ASC, created_at ASC`,
    [userId, brandId]
  );
  return rows.map(rowToTask);
}

/** Cross-brand list for the dashboard box: open tasks first, newest first,
 *  capped. Each row carries its brand's name + colour for the row-end mark. */
export async function listRecent(userId: string, limit: number): Promise<TaskWithBrand[]> {
  const { rows } = await query<any>(
    `SELECT t.${COLS.split(', ').join(', t.')}, b.name AS brand_name, b.color AS brand_color
       FROM organic_tasks t
       JOIN brands b ON b.id = t.brand_id
      WHERE t.user_id = $1
      ORDER BY t.done ASC, t.created_at DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows.map((r) => ({ ...rowToTask(r), brandName: r.brand_name, brandColor: r.brand_color }));
}

export interface CreateTaskInput {
  dueDate?: string | null;
  tag?: string | null;
}

export async function createTask(
  userId: string,
  brandId: string,
  title: string,
  input: CreateTaskInput = {}
): Promise<Task> {
  const { rows } = await query<any>(
    `INSERT INTO organic_tasks (user_id, brand_id, title, due_date, tag)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLS}`,
    [userId, brandId, title.trim(), input.dueDate ?? null, cleanTag(input.tag)]
  );
  return rowToTask(rows[0]);
}

export interface TaskPatch {
  title?: string;
  done?: boolean;
  dueDate?: string | null;
  tag?: string | null;
}

export async function updateTask(userId: string, id: string, patch: TaskPatch): Promise<Task | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.title !== undefined) {
    sets.push(`title = $${i++}`);
    vals.push(patch.title.trim());
  }
  if (patch.done !== undefined) {
    sets.push(`done = $${i++}`);
    vals.push(patch.done);
    // Stamp / clear completion time alongside the flag.
    sets.push(`completed_at = ${patch.done ? 'NOW()' : 'NULL'}`);
  }
  if (patch.dueDate !== undefined) {
    sets.push(`due_date = $${i++}`);
    vals.push(patch.dueDate);
  }
  if (patch.tag !== undefined) {
    sets.push(`tag = $${i++}`);
    vals.push(cleanTag(patch.tag));
  }
  if (sets.length === 0) {
    const { rows } = await query<any>(
      `SELECT ${COLS} FROM organic_tasks WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [id, userId]
    );
    return rows.length ? rowToTask(rows[0]) : null;
  }
  vals.push(id, userId);
  const { rows } = await query<any>(
    `UPDATE organic_tasks SET ${sets.join(', ')}
      WHERE id = $${i} AND user_id = $${i + 1}
      RETURNING ${COLS}`,
    vals
  );
  return rows.length ? rowToTask(rows[0]) : null;
}

export async function deleteTask(userId: string, id: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `DELETE FROM organic_tasks WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  );
  return rows.length > 0;
}
