/**
 * Link unfurl — fetch a URL server-side and pull out enough to render an
 * iMessage-style link card: title, description, preview image, site name.
 *
 * Server-side on purpose: the browser can't read cross-origin OG tags, and
 * doing it here also keeps the user's IP off arbitrary third-party sites.
 *
 * Deliberately forgiving. Any failure (timeout, non-HTML, blocked) degrades
 * to a bare card with just the hostname as the title — a moodboard link is
 * still useful as a labelled swatch of "this thing exists".
 */

const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 512 * 1024; // read at most the head of the document

export interface Unfurled {
  url: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

/** Reject anything that isn't a plain http(s) URL to a public host. */
export function isFetchableUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  // Block obvious SSRF targets. Not exhaustive, but stops the easy ones.
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return false;
  }
  return true;
}

function hostTitle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Decode the handful of HTML entities that show up in title/description. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/** Pull `content` from a <meta> tag matching property/name = key. */
function metaContent(html: string, key: string): string | null {
  // property="og:title" content="..."  OR  content="..." property="og:title"
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeEntities(m[1]);
  }
  return null;
}

/** Resolve a possibly-relative image URL against the page URL. */
function absoluteImage(img: string | null, base: string): string | null {
  if (!img) return null;
  try {
    return new URL(img, base).toString();
  } catch {
    return null;
  }
}

export async function unfurl(rawUrl: string): Promise<Unfurled> {
  const fallback: Unfurled = {
    url: rawUrl,
    title: hostTitle(rawUrl),
    description: null,
    imageUrl: null,
    siteName: hostTitle(rawUrl),
  };

  if (!isFetchableUrl(rawUrl)) return fallback;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(rawUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Some sites gate OG tags behind a real-looking UA.
        'User-Agent':
          'Mozilla/5.0 (compatible; StudioMoodboard/1.0; +https://organic.petaronline.us)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const finalUrl = res.url || rawUrl;
    const type = res.headers.get('content-type') ?? '';

    // A direct image link: no HTML to parse — it IS the preview.
    if (type.startsWith('image/')) {
      return {
        url: finalUrl,
        title: hostTitle(finalUrl),
        description: null,
        imageUrl: finalUrl,
        siteName: hostTitle(finalUrl),
      };
    }
    if (!type.includes('html')) {
      return { ...fallback, url: finalUrl, title: hostTitle(finalUrl) };
    }

    // Read only the head of the document — OG tags live near the top and we
    // don't want to pull megabytes for a preview card.
    const reader = res.body?.getReader();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder();
      let received = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (received >= MAX_BYTES || /<\/head>/i.test(html)) {
          await reader.cancel().catch(() => {});
          break;
        }
      }
    } else {
      html = await res.text();
    }

    const ogTitle = metaContent(html, 'og:title') ?? metaContent(html, 'twitter:title');
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
    const title = ogTitle || (titleTag ? decodeEntities(titleTag) : hostTitle(finalUrl));

    const description =
      metaContent(html, 'og:description') ??
      metaContent(html, 'twitter:description') ??
      metaContent(html, 'description');

    const image = absoluteImage(
      metaContent(html, 'og:image') ??
        metaContent(html, 'og:image:url') ??
        metaContent(html, 'twitter:image') ??
        metaContent(html, 'twitter:image:src'),
      finalUrl
    );

    const siteName = metaContent(html, 'og:site_name') ?? hostTitle(finalUrl);

    return {
      url: finalUrl,
      title: title.slice(0, 200),
      description: description ? description.slice(0, 300) : null,
      imageUrl: image,
      siteName: siteName.slice(0, 100),
    };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
