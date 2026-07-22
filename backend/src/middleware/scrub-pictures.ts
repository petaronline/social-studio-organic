/**
 * Response-wide placeholder-picture scrubber.
 *
 * WHY THIS IS A MIDDLEWARE AND NOT ANOTHER PER-ROUTE FIX
 *
 * Facebook Page pictures are stored as `graph.facebook.com/<id>/picture`,
 * a redirect endpoint. For a Page with no photo it 302s to Meta's grey
 * placeholder. Nothing about the stored string reveals which case you're in
 * — you have to follow it.
 *
 * That URL reached the browser through several different responses: the
 * accounts list, brand thumbnails, post-target chips. Each was fixed
 * individually, and each time another one surfaced, because "find every
 * route that returns a picture" is a job you can only ever be one miss away
 * from failing — and any route added later starts out broken.
 *
 * So this walks the entire JSON body of every response, finds anything that
 * looks like a Meta picture URL, resolves it (cached, so this is nearly free
 * after the first call), and nulls out the ones that lead to a placeholder.
 * No route has to remember to do anything.
 *
 * Cost: one Graph round-trip per distinct URL per 6 hours, from a cache
 * shared with services/page-picture.ts. Everything else is a walk over an
 * object that was about to be serialised anyway.
 *
 * Deliberately conservative: only keys that plausibly hold a picture are
 * touched, and only string values. On any failure the value is left alone —
 * a stale picture is a smaller problem than a broken response.
 */
import type { Request, Response, NextFunction } from 'express';
import { resolvePictureUrl, isKnownPlaceholderUrl } from '../services/page-picture';

/** Keys whose string values may hold a profile/brand picture. */
const PICTURE_KEYS = new Set([
  'picture_url',
  'pictureUrl',
  'thumbnail_url',
  'thumbnailUrl',
  'avatarUrl',
  'avatar_url',
  'logoUrl',
  'logo_url',
  'profile_picture_url',
  'profilePictureUrl',
]);

/** Cheap pre-filter so we only pay for URLs that could be affected. */
function looksLikeMetaPicture(value: string): boolean {
  return (
    (value.includes('graph.facebook.com') && value.includes('/picture')) ||
    isKnownPlaceholderUrl(value)
  );
}

/**
 * Walk the body, replacing placeholder picture URLs with null.
 *
 * Depth-limited and cycle-safe: response bodies are plain JSON, but a
 * runaway recursion here would take the API down, and that trade is never
 * worth it for a cosmetic fix.
 */
async function scrub(node: unknown, seen: WeakSet<object>, depth = 0): Promise<unknown> {
  if (depth > 12 || node === null || typeof node !== 'object') return node;
  if (seen.has(node as object)) return node;
  seen.add(node as object);

  if (Array.isArray(node)) {
    await Promise.all(node.map((item) => scrub(item, seen, depth + 1)));
    return node;
  }

  const obj = node as Record<string, unknown>;
  await Promise.all(
    Object.keys(obj).map(async (key) => {
      const value = obj[key];

      if (typeof value === 'string' && PICTURE_KEYS.has(key) && looksLikeMetaPicture(value)) {
        try {
          obj[key] = await resolvePictureUrl(value);
        } catch {
          /* leave it as-is — a stale picture beats a failed response */
        }
        return;
      }

      if (value && typeof value === 'object') {
        await scrub(value, seen, depth + 1);
      }
    })
  );

  return node;
}

/**
 * Express middleware. Wraps res.json so the body is scrubbed before it is
 * serialised. `res.json` stays synchronous from the caller's point of view;
 * the send simply happens a tick later.
 */
export function scrubPictures() {
  return function scrubPicturesMiddleware(_req: Request, res: Response, next: NextFunction) {
    const originalJson = res.json.bind(res);

    res.json = function patchedJson(body?: unknown): Response {
      if (!body || typeof body !== 'object') return originalJson(body);

      scrub(body, new WeakSet())
        .then(() => originalJson(body))
        .catch(() => originalJson(body));

      return res;
    };

    next();
  };
}
