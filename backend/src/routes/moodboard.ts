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
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import * as moodboard from '../services/moodboard';
import { unfurl } from '../services/unfurl';
import { fetchImageToUpload, ImageFetchError } from '../services/image-fetch';

export const moodboardRouter = Router();

const UPLOAD_ROOT = process.env.UPLOAD_ROOT ?? '/uploads';

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

const textContent = z.object({
  text: z.string().max(200),
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
    case 'text': return textContent;
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
  kind: z.enum(['image', 'swatch', 'note', 'link', 'text']),
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

// ---------------------------------------------------------------------
// POST /organic/moodboard/fetch-image  { url } → stores the bytes as an
// upload and returns its id. Used when pasting an image copied from a web
// page: hotlinking the source URL usually renders blank (referer/CORS
// blocks), so we pull the bytes server-side instead.
// ---------------------------------------------------------------------
const fetchImageSchema = z.object({ url: httpUrl });

moodboardRouter.post('/fetch-image', requireAuth, async (req: Request, res: Response) => {
  const parsed = fetchImageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'A valid http(s) image url is required.' });
  }
  try {
    const upload = await fetchImageToUpload(req.user!.id, parsed.data.url);
    res.json({ upload });
  } catch (err) {
    if (err instanceof ImageFetchError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

// =====================================================================
// Sharing (authed) — manage a brand's public share token.
//   GET    /organic/moodboard/share?brandId=…  → { token: string | null }
//   POST   /organic/moodboard/share  { brandId } → { token }
//   DELETE /organic/moodboard/share  { brandId } → { ok }
// =====================================================================
moodboardRouter.get('/share', requireAuth, async (req: Request, res: Response) => {
  const brandId = typeof req.query.brandId === 'string' ? req.query.brandId : '';
  if (!/^[0-9a-f-]{36}$/i.test(brandId)) {
    return res.status(400).json({ error: 'A valid brandId is required.' });
  }
  const token = await moodboard.getShareToken(req.user!.id, brandId);
  res.json({ token });
});

const shareBodySchema = z.object({ brandId: z.string().uuid() });

moodboardRouter.post('/share', requireAuth, async (req: Request, res: Response) => {
  const parsed = shareBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A valid brandId is required.' });
  const token = await moodboard.createShare(req.user!.id, parsed.data.brandId);
  if (!token) return res.status(404).json({ error: 'Brand not found' });
  res.json({ token });
});

moodboardRouter.delete('/share', requireAuth, async (req: Request, res: Response) => {
  const brandId = typeof req.query.brandId === 'string' ? req.query.brandId : '';
  if (!/^[0-9a-f-]{36}$/i.test(brandId)) {
    return res.status(400).json({ error: 'A valid brandId is required.' });
  }
  const ok = await moodboard.revokeShare(req.user!.id, brandId);
  if (!ok) return res.status(404).json({ error: 'Brand not found' });
  res.json({ ok: true });
});

// =====================================================================
// Public (NO auth) — the shared board and its image bytes. The token is
// the grant; anyone holding it can read. Revoking it (deleting the row)
// makes both endpoints 404.
//   GET /organic/moodboard/public/:token             → { board }
//   GET /organic/moodboard/public/:token/media/:itemId → image bytes
// =====================================================================
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

moodboardRouter.get('/public/:token', async (req: Request, res: Response) => {
  const token = String(req.params.token);
  if (!TOKEN_RE.test(token)) return res.status(404).json({ error: 'Not found' });
  const board = await moodboard.getBoardByShareToken(token);
  if (!board) return res.status(404).json({ error: 'This board is not shared, or the link was revoked.' });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ board });
});

moodboardRouter.get('/public/:token/media/:itemId', async (req: Request, res: Response) => {
  const token = String(req.params.token);
  const itemId = String(req.params.itemId);
  if (!TOKEN_RE.test(token) || !/^[0-9a-f-]{36}$/i.test(itemId)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const file = await moodboard.getSharedItemUpload(token, itemId);
  if (!file) return res.status(404).json({ error: 'Not found' });

  const absPath = path.join(UPLOAD_ROOT, file.storagePath);
  try {
    await fs.access(absPath);
  } catch {
    return res.status(404).json({ error: 'File missing on disk' });
  }
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  createReadStream(absPath).pipe(res);
});
