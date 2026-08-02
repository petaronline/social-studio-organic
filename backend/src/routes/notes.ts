/**
 * Note routes — per-user, per-brand notes & meeting notes.
 *
 *   GET    /organic/notes?brandId=…   → a brand's notes
 *   GET    /organic/notes/recent?limit=… → cross-brand recent
 *   GET    /organic/notes/:id
 *   POST   /organic/notes  { brandId, type, title?, body?, meetingAt?, attendees? }
 *   PATCH  /organic/notes/:id
 *   DELETE /organic/notes/:id
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import * as notes from '../services/notes';

export const notesRouter = Router();

const UUID = /^[0-9a-f-]{36}$/i;

notesRouter.get('/recent', requireAuth, async (req: Request, res: Response) => {
  const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
  res.json({ notes: await notes.listRecent(req.user!.id, limit) });
});

notesRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const brandId = typeof req.query.brandId === 'string' ? req.query.brandId : '';
  if (!UUID.test(brandId)) return res.status(400).json({ error: 'A valid brandId is required.' });
  if (!(await notes.userOwnsBrand(req.user!.id, brandId))) {
    return res.status(404).json({ error: 'Brand not found' });
  }
  res.json({ notes: await notes.listByBrand(req.user!.id, brandId) });
});

notesRouter.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid id' });
  const note = await notes.getNote(req.user!.id, id);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json({ note });
});

const createSchema = z.object({
  brandId: z.string().uuid(),
  type: z.enum(['note', 'meeting']),
  title: z.string().max(500).optional(),
  body: z.string().optional(),
  meetingAt: z.string().datetime().nullable().optional(),
  attendees: z.string().max(2000).nullable().optional(),
});

notesRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid note', detail: parsed.error.flatten() });
  const { brandId, ...input } = parsed.data;
  if (!(await notes.userOwnsBrand(req.user!.id, brandId))) {
    return res.status(404).json({ error: 'Brand not found' });
  }
  const note = await notes.createNote(req.user!.id, brandId, input);
  res.status(201).json({ note });
});

const updateSchema = z.object({
  title: z.string().max(500).optional(),
  body: z.string().optional(),
  meetingAt: z.string().datetime().nullable().optional(),
  attendees: z.string().max(2000).nullable().optional(),
  pinned: z.boolean().optional(),
});

notesRouter.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid id' });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid update', detail: parsed.error.flatten() });
  const note = await notes.updateNote(req.user!.id, id, parsed.data);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json({ note });
});

notesRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid id' });
  const ok = await notes.deleteNote(req.user!.id, id);
  if (!ok) return res.status(404).json({ error: 'Note not found' });
  res.json({ ok: true });
});
