/**
 * Fetch a remote image and store it as an upload.
 *
 * Why not just hotlink the URL from the moodboard? Because most sites block
 * cross-origin/referer-less requests for their images, so a pasted <img src>
 * renders blank. Pulling the bytes server-side and saving them through the
 * same content-addressed store the uploader uses means a pasted image always
 * displays, and stops depending on the source site staying up.
 *
 * Reuses the uploads table + on-disk layout from routes/uploads.ts, and the
 * SSRF guard from unfurl.ts.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { query } from '../db/pool';
import { isFetchableUrl } from './unfurl';
import { readImageDimensions, type MediaDimensions } from './media-dimensions';

const UPLOAD_ROOT = process.env.UPLOAD_ROOT ?? '/uploads';
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — plenty for a moodboard reference
const FETCH_TIMEOUT_MS = 8000;

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

export interface FetchedImage {
  id: string;
  widthPx: number | null;
  heightPx: number | null;
}

export class ImageFetchError extends Error {}

/** Fetch a remote image with SSRF + type + size guards. Returns the raw bytes
 *  and its MIME. Shared by the upload path and the streaming proxy. */
export async function fetchRemoteImage(url: string): Promise<{ buffer: Buffer; mime: string }> {
  if (!isFetchableUrl(url)) {
    throw new ImageFetchError('That URL is not allowed.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; StudioMoodboard/1.0; +https://organic.petaronline.us)',
        Accept: 'image/*,*/*;q=0.8',
      },
    });
    if (!res.ok) throw new ImageFetchError(`Source returned ${res.status}.`);

    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!mime.startsWith('image/')) {
      throw new ImageFetchError('That link is not an image.');
    }
    const len = Number(res.headers.get('content-length') ?? '0');
    if (len && len > MAX_BYTES) {
      throw new ImageFetchError('That image is too large (20 MB max).');
    }
    const ab = await res.arrayBuffer();
    const buffer = Buffer.from(ab);
    if (buffer.length > MAX_BYTES) throw new ImageFetchError('That image is too large (20 MB max).');
    if (buffer.length === 0) throw new ImageFetchError('That image was empty.');
    return { buffer, mime };
  } catch (err) {
    if (err instanceof ImageFetchError) throw err;
    throw new ImageFetchError('Could not fetch that image.');
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch `url`, verify it's an image within limits, store it, and return the
 *  new upload's id + dimensions. Throws ImageFetchError on any refusal. */
export async function fetchImageToUpload(userId: string, url: string): Promise<FetchedImage> {
  const { buffer: buf, mime } = await fetchRemoteImage(url);

  const ext = MIME_EXT[mime] ?? '.img';
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const relativePath = `image/${hash.substring(0, 2)}/${hash}${ext}`;
  const absPath = path.join(UPLOAD_ROOT, relativePath);

  try {
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    try {
      await fs.access(absPath); // already stored (same content) — skip write
    } catch {
      await fs.writeFile(absPath, buf);
    }
  } catch {
    throw new ImageFetchError('Could not save that image.');
  }

  let dims: MediaDimensions | null = null;
  try {
    dims = await readImageDimensions(buf);
  } catch {
    /* non-fatal */
  }

  const { rows } = await query<{ id: string; width_px: number | null; height_px: number | null }>(
    `INSERT INTO uploads
       (user_id, filename, storage_path, content_type, size_bytes, kind,
        width_px, height_px, aspect_bucket)
     VALUES ($1, $2, $3, $4, $5, 'image', $6, $7, $8)
     RETURNING id, width_px, height_px`,
    [
      userId,
      `pasted${ext}`,
      relativePath,
      mime,
      buf.length,
      dims?.widthPx ?? null,
      dims?.heightPx ?? null,
      dims?.aspectBucket ?? null,
    ]
  );

  return { id: rows[0].id, widthPx: rows[0].width_px, heightPx: rows[0].height_px };
}
