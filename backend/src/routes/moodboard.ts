/**
 * Moodboard routes — per-brand visual reference board.
 *
 *   GET    /organic/moodboard?brandId=…   → { items, limit }
 *   POST   /organic/moodboard             → create an item
 *   PATCH  /organic/moodboard/:id         → move / restyle / reorder
 *   DELETE /organic/moodboard/:id         → remove an item
 *   POST   /organic/moodboard/unfurl      → { url } → link-card metadata
 *
 * Image bytes don't flow through here: the client uploads via the shared
 * /uploads route (content-addressed, deduped) and then creates an `image`
 * item referencing the upload id — or, for a pasted external image URL, an
 * `image` item carrying { url } directly.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import * as moodboard from '../services/moodboard';
import { unfurl } from '../services/unfurl';

export const moodboardRouter = Router();

const HEX = /^#[0-9A-Fa-f]{6}$/;

// Per-kind content schemas. Kept strict so a note can't smuggle a huge blob
// or a link card can't carry a javascript: URL.
const httpUrl = z.string().url().max(2000).refine(
  (u) => /^https?:\/\//i.test(u),
  'Must be an http(s) URL'
);

const imageContent = z
  .object({
    uploadId: z.string().uuid().optional(),
    url: httpUrl.optional(),
    naturalWidth: z.number().positive().max(20000).optional(),
    naturalHeight: z.number().positive().max(20000).optional(),
  })
  .refine((c) => c.uploadId || c.url, 'Image needs an uploadId or a url');

const swatchContent = z.object({
  color: z.string().regex(HEX),
});

const noteContent = z.object({
  text: z.string().max(600),
  color: z.string().regex(HEX).optional(),
});

const linkContent = z.object({
  url: httpUrl,
  title: z.string().max(200),
  description: z.string().max(300).nullable().optional(),
  imageUrl: httpUrl.nullable().optional(),
  siteName: z.string().max(100).nullable().optional(),
});

function contentSchemaFor(kind: string) {
  switch (kind) {
    case 'image': return imageContent;
    case 'swatch': return swatchContent;
    case 'note': return noteContent;
    case 'link': return linkContent;
    default: return null;
  }
}

// ---------------------------------------------------------------------
// GET /organic/moodboard?brandId=…
// ---------------------------------------------------------------------
moodboardRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const brandId = typeof req.query.brandId === 'string' ? req.query.brandId : '';
  if (!/^[0-9a-f-]{36}$/i.test(brandId)) {
    return res.status(400).json({ error: 'A valid brandId query param is required.' });
  }
  if (!(await moodboard.userOwnsBrand(req.user!.id, brandId))) {
    return res.status(404).json({ error: 'Brand not found' });
  }
  const items = await moodboard.listItems(req.user!.id, brandId);
  res.json({ items, limit: moodboard.MOODBOARD_ITEM_LIMIT });
});

// ---------------------------------------------------------------------
// POST /organic/moodboard
// ---------------------------------------------------------------------
const createSchema = z.object({
  brandId: z.string().uuid(),
  kind: z.enum(['image', 'swatch', 'note', 'link']),
  content: z.record(z.unknown()),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  rotation: z.number().finite().min(-45).max(45).optional(),
});

moodboardRouter.post('/', requireAuth, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid item', detail: parsed.error.flatten() });
  }
  const { brandId, kind, content, x, y, rotation } = parsed.data;

  const contentSchema = contentSchemaFor(kind);
  const cParsed = contentSchema!.safeParse(content);
  if (!cParsed.success) {
    return res.status(400).json({ error: `Invalid ${kind} content`, detail: cParsed.error.flatten() });
  }

  if (!(await moodboard.userOwnsBrand(req.user!.id, brandId))) {
    return res.status(404).json({ error: 'Brand not found' });
  }

  try {
    const item = await moodboard.createItem({
      userId: req.user!.id,
      brandId,
      kind,
      content: cParsed.data as Record<string, unknown>,
      x: x ?? 0,
      y: y ?? 0,
      rotation: rotation ?? 0,
    });
    res.status(201).json({ item });
  } catch (err) {
    if (err instanceof moodboard.BoardFullError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
});

// ---------------------------------------------------------------------
// PATCH /organic/moodboard/:id
// ---------------------------------------------------------------------
const updateSchema = z.object({
  content: z.record(z.unknown()).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  rotation: z.number().finite().min(-45).max(45).optional(),
  zIndex: z.number().int().optional(),
  width: z.number().positive().max(4000).nullable().optional(),
});

moodboardRouter.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid update', detail: parsed.error.flatten() });
  }
  const item = await moodboard.updateItem(req.user!.id, id, parsed.data);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json({ item });
});

// ---------------------------------------------------------------------
// DELETE /organic/moodboard/:id
// ---------------------------------------------------------------------
moodboardRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const ok = await moodboard.deleteItem(req.user!.id, id);
  if (!ok) return res.status(404).json({ error: 'Item not found' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------
// POST /organic/moodboard/unfurl  { url } → link-card metadata
// ---------------------------------------------------------------------
const unfurlSchema = z.object({ url: httpUrl });

moodboardRouter.post('/unfurl', requireAuth, async (req: Request, res: Response) => {
  const parsed = unfurlSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'A valid http(s) url is required.' });
  }
  const meta = await unfurl(parsed.data.url);
  res.json({ meta });
});
