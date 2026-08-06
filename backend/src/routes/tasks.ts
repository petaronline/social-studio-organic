/**
 * Task routes — per-user, per-brand to-do lists.
 *
 *   GET    /organic/tasks?brandId=…   → a brand's tasks
 *   GET    /organic/tasks/recent?limit=5 → cross-brand list for the dashboard
 *   POST   /organic/tasks  { brandId, title }
 *   PATCH  /organic/tasks/:id  { title?, done? }
 *   DELETE /organic/tasks/:id
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import * as tasks from '../services/tasks';

export const tasksRouter = Router();

// GET /organic/tasks/recent — must be declared before '/:id'-style paths, but
// this router has no such collision; kept first for clarity anyway.
tasksRouter.get('/recent', requireAuth, async (req: Request, res: Response) => {
  const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
  const list = await tasks.listRecent(req.user!.id, limit);
  res.json({ tasks: list });
});

// GET /organic/tasks?brandId=…
tasksRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const brandId = typeof req.query.brandId === 'string' ? req.query.brandId : '';
  if (!/^[0-9a-f-]{36}$/i.test(brandId)) {
    return res.status(400).json({ error: 'A valid brandId is required.' });
  }
  if (!(await tasks.userOwnsBrand(req.user!.id, brandId))) {
    return res.status(404).json({ error: 'Brand not found' });
  }
  const list = await tasks.listByBrand(req.user!.id, brandId);
  res.json({ tasks: list });
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  brandId: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  dueDate: z.string().regex(DATE_RE).nullable().optional(),
  tag: z.string().max(60).nullable().optional(),
});

tasksRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'A brandId and a non-empty title are required.' });
  }
  if (!(await tasks.userOwnsBrand(req.user!.id, parsed.data.brandId))) {
    return res.status(404).json({ error: 'Brand not found' });
  }
  const task = await tasks.createTask(req.user!.id, parsed.data.brandId, parsed.data.title, {
    dueDate: parsed.data.dueDate ?? null,
    tag: parsed.data.tag ?? null,
  });
  res.status(201).json({ task });
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  done: z.boolean().optional(),
  dueDate: z.string().regex(DATE_RE).nullable().optional(),
  tag: z.string().max(60).nullable().optional(),
});

tasksRouter.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid id' });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid update' });
  const task = await tasks.updateTask(req.user!.id, id, parsed.data);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ task });
});

tasksRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Invalid id' });
  const ok = await tasks.deleteTask(req.user!.id, id);
  if (!ok) return res.status(404).json({ error: 'Task not found' });
  res.json({ ok: true });
});
