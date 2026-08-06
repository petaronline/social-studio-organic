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
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import * as notes from '../services/notes';
import { getTranscribeQueue } from '../services/queue';

export const notesRouter = Router();

const UUID = /^[0-9a-f-]{36}$/i;

const UPLOAD_ROOT = process.env.UPLOAD_ROOT ?? '/uploads';
// Meeting recordings can be large; 500 MB covers a long call. In-memory then
// written to a content-addressed path, same pattern as /uploads.
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024, files: 1 },
});
const AUDIO_EXT: Record<string, string> = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

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

// ---------------------------------------------------------------------
// POST /organic/notes/:id/transcribe — upload a meeting recording. Stores the
// audio, marks the note processing, and enqueues the background transcription
// job. Returns the note immediately; the client polls until it's done.
// ---------------------------------------------------------------------
notesRouter.post(
  '/:id/transcribe',
  requireAuth,
  audioUpload.single('file'),
  async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid id' });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No audio provided (field "file").' });

    // Confirm ownership before writing anything.
    const existing = await notes.getNote(req.user!.id, id);
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    const ext = AUDIO_EXT[file.mimetype] ?? '.bin';
    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const relativePath = `audio/${hash.substring(0, 2)}/${hash}${ext}`;
    const absPath = path.join(UPLOAD_ROOT, relativePath);
    try {
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, file.buffer);
    } catch (err) {
      console.error('[notes] audio write failed:', err);
      return res.status(500).json({ error: 'Failed to save recording' });
    }

    const note = await notes.startTranscription(req.user!.id, id, relativePath);
    if (!note) return res.status(404).json({ error: 'Note not found' });

    await getTranscribeQueue().add('transcribe', { noteId: id });
    res.status(202).json({ note });
  }
);

// Multer error handler (payload too large, etc.)
notesRouter.use((err: any, _req: Request, res: Response, next: any) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Recording too large (500 MB max).' });
  }
  next(err);
});
