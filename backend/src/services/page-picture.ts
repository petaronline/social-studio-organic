/**
 * Resolving Facebook Page profile pictures.
 *
 * THE PROBLEM
 *
 * We deliberately store the STABLE endpoint for a Page's picture:
 *
 *     https://graph.facebook.com/<page-id>/picture?type=large
 *
 * rather than the signed CDN URL, because the signed one expires and starts
 * returning "URL signature expired". The stable endpoint 302-redirects to
 * whatever the current image is, every time.
 *
 * The catch: for a Page with no photo, that redirect lands on Meta's grey
 * placeholder — a real, cacheable image on their static host. So the URL we
 * stored looks perfectly valid, the browser fetches it happily, and the user
 * sees a grey question mark where their brand should be.
 *
 * The connect flow does check `is_silhouette`, but only once, at connect
 * time. A Page that had a photo then and lost it since keeps its stored URL
 * and starts rendering the placeholder. No amount of inspecting the URL can
 * tell you which case you're in — the answer is behind the redirect.
 *
 * THE FIX
 *
 * Graph answers the question directly when asked not to redirect:
 *
 *     GET /<page-id>/picture?type=large&redirect=false
 *     → { "data": { "url": "...", "is_silhouette": true|false, ... } }
 *
 * So we ask, and null the picture out when it's a silhouette. Results are
 * cached in-process because this runs on every accounts list and a Page's
 * photo does not change minute to minute.
 *
 * Failures are non-fatal: on a network error or a rate limit we return the
 * URL unchanged. Showing a placeholder occasionally beats an accounts list
 * that errors, and the next call will re-check.
 */

/** How long a resolved answer stays good. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Don't let a slow Graph call hold up the accounts list. */
const TIMEOUT_MS = 4000;

interface CacheEntry {
  at: number;
  /** The URL to use, or null when Graph says it's a silhouette. */
  value: string | null;
}

const cache = new Map<string, CacheEntry>();

/** Is this one of the redirect endpoints we need to look behind? */
function isGraphPictureEndpoint(url: string): boolean {
  return url.includes('graph.facebook.com') && url.includes('/picture');
}

/**
 * Returns the picture URL to use, or null if Graph reports the Page has no
 * real photo. Anything that isn't a Graph picture endpoint — Instagram and
 * LinkedIn CDN URLs, for instance — passes straight through.
 */
export async function resolvePictureUrl(
  url: string | null | undefined,
  accessToken?: string | null
): Promise<string | null> {
  if (!url) return null;
  if (!isGraphPictureEndpoint(url)) return url;

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const sep = url.includes('?') ? '&' : '?';
  const probe =
    `${url}${sep}redirect=false` +
    (accessToken ? `&access_token=${encodeURIComponent(accessToken)}` : '');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(probe, { signal: controller.signal });
    clearTimeout(timer);

    const body = (await res.json()) as {
      data?: { is_silhouette?: boolean };
      error?: unknown;
    };

    // If Graph refuses (token scope, rate limit), keep what we have rather
    // than blanking a picture that may well be fine.
    if (body.error || !body.data) return url;

    const value = body.data.is_silhouette ? null : url;
    cache.set(url, { at: Date.now(), value });
    return value;
  } catch {
    return url;
  }
}

/**
 * Resolve a whole list of accounts at once. Concurrent, because these are
 * independent round-trips and a workspace can hold a dozen Pages.
 */
export async function resolveAccountPictures<
  T extends { platform: string; meta?: Record<string, unknown> | null }
>(accounts: T[]): Promise<T[]> {
  return Promise.all(
    accounts.map(async (a) => {
      const meta = a.meta as { picture_url?: string | null } | null | undefined;
      const current = meta?.picture_url;
      if (a.platform !== 'facebook_page' || !current) return a;

      const resolved = await resolvePictureUrl(current);
      if (resolved === current) return a;
      return { ...a, meta: { ...(a.meta ?? {}), picture_url: resolved } };
    })
  );
}
