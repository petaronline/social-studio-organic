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
 * Not `?redirect=false` + `is_silhouette`. That field is optional and, for
 * real Pages in this workspace, reports false while the endpoint serves the
 * placeholder anyway — every fix built on it failed.
 *
 * Instead: follow the redirect and look at where it lands. The target is a
 * fact, not a claim. If the final URL is on a `static.*` host or a known
 * placeholder path, it IS the placeholder. One request settles it, the body
 * is discarded, and the answer is cached because a Page's photo does not
 * change minute to minute.
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
 * A placeholder we can identify from the URL alone — no round-trip needed.
 *
 * Real profile photos are only ever served from a `scontent*` CDN host. The
 * `static.*` hosts serve application chrome: sprites, icons, default
 * avatars. A resync can write one of these directly (rather than the graph
 * redirect endpoint), which is how the grey image came back after
 * re-syncing Pages — it wasn't a graph URL, so the resolver waved it past.
 */
const STATIC_ASSET_HOSTS = [
  'static.xx.fbcdn.net',
  'static.cdninstagram.com',
  'static.fbcdn.net',
];
const PLACEHOLDER_PATHS = ['/t1.30497-1/', 'rsrc.php', '/static/images/'];

export function isKnownPlaceholderUrl(url: string): boolean {
  if (STATIC_ASSET_HOSTS.some((h) => url.includes(h))) return true;
  if (PLACEHOLDER_PATHS.some((p) => url.includes(p))) return true;
  // Profile photos are jpg/png/webp; a gif from a Meta CDN is chrome.
  if (url.includes('fbcdn.net') && url.split('?')[0].endsWith('.gif')) return true;
  return false;
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
  // Cheap check first: some placeholders are identifiable without asking.
  if (isKnownPlaceholderUrl(url)) return null;
  if (!isGraphPictureEndpoint(url)) return url;

  const cacheKey = accessToken ? `tok:${url}` : url;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  /*
   * FOLLOW THE REDIRECT AND LOOK AT WHERE IT LANDS.
   *
   * The previous approach asked Graph `?redirect=false` and trusted
   * `is_silhouette`. That field is documented, optional, and — for these
   * Pages — simply wrong: it reports false while the redirect serves the
   * grey placeholder anyway. Every fix built on it failed for that reason.
   *
   * The redirect target is not an opinion. `/{id}/picture` 302s to the
   * actual image; if that image lives on a `static.*` host or a known
   * placeholder path, it IS the placeholder, whatever Graph claims. Node's
   * fetch follows redirects by default and exposes the final URL as
   * `res.url`, so one request answers it definitively.
   *
   * The body is cancelled immediately — we need the URL, not the bytes.
   */
  const sep = url.includes('?') ? '&' : '?';
  const probe = accessToken
    ? `${url}${sep}access_token=${encodeURIComponent(accessToken)}`
    : url;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(probe, { redirect: 'follow', signal: controller.signal });
    clearTimeout(timer);

    // Don't download the image itself.
    try {
      await res.body?.cancel();
    } catch {
      /* already consumed or unsupported — harmless */
    }

    const finalUrl = res.url || '';
    // A redirect that lands nowhere useful: keep what we had rather than
    // blanking a picture that might be fine.
    if (!res.ok || !finalUrl) return url;

    const value = isKnownPlaceholderUrl(finalUrl) ? null : url;
    cache.set(cacheKey, { at: Date.now(), value });
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
  T extends { id: string; platform: string; meta?: Record<string, unknown> | null }
>(accounts: T[], getToken?: (accountId: string) => Promise<string | null>): Promise<T[]> {
  return Promise.all(
    accounts.map(async (a) => {
      const meta = a.meta as { picture_url?: string | null } | null | undefined;
      const current = meta?.picture_url;
      if (a.platform !== 'facebook_page' || !current) return a;

      // Probe WITH the Page's own token when we can get it. Unauthenticated,
      // Graph returns the silhouette for any Page that isn't publicly
      // visible — unpublished, restricted by age or country, or still in
      // review — which would wrongly blank a real photo. With the token we
      // get the truth.
      let token: string | null = null;
      if (getToken) {
        try {
          token = await getToken(a.id);
        } catch {
          token = null;
        }
      }

      const resolved = await resolvePictureUrl(current, token);
      if (resolved === current) return a;
      return { ...a, meta: { ...(a.meta ?? {}), picture_url: resolved } };
    })
  );
}
