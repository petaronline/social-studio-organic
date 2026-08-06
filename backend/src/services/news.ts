/**
 * Social-media news — pulls headlines from a few industry RSS feeds, merges
 * and de-duplicates them, and caches the result in memory (feeds don't change
 * minute to minute and we don't want to hammer them, or block a request on a
 * slow feed).
 *
 * Best-effort: any feed that times out, blocks us, or fails to parse is simply
 * skipped. If they all fail we return an empty list and the UI says so.
 */

const FEEDS: { url: string; source: string }[] = [
  { url: 'https://techcrunch.com/tag/social/feed/', source: 'TechCrunch' },
  { url: 'https://www.socialmediatoday.com/feeds/news/', source: 'Social Media Today' },
  { url: 'https://www.socialmediaexaminer.com/feed/', source: 'Social Media Examiner' },
];

const FETCH_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ITEMS = 12;

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null; // ISO
}

let cache: { items: NewsItem[]; at: number } | null = null;

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8230;/g, '…')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : null;
}

/** Parse RSS 2.0 <item> and Atom <entry> blocks out of a feed document. */
function parseFeed(xml: string, source: string): NewsItem[] {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  const items: NewsItem[] = [];
  for (const block of blocks) {
    const rawTitle = tag(block, 'title');
    if (!rawTitle) continue;
    const title = decode(rawTitle);
    if (!title) continue;

    // Link: RSS <link>url</link>, or Atom <link href="url" .../>.
    let url = '';
    const rssLink = tag(block, 'link');
    if (rssLink && /^https?:\/\//i.test(rssLink.trim())) {
      url = rssLink.trim();
    } else {
      const href = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (href) url = href[1];
    }
    if (!/^https?:\/\//i.test(url)) continue;

    const rawDate = tag(block, 'pubDate') ?? tag(block, 'published') ?? tag(block, 'updated');
    let publishedAt: string | null = null;
    if (rawDate) {
      const d = new Date(decode(rawDate));
      if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString();
    }

    items.push({ title: title.slice(0, 200), url, source, publishedAt });
  }
  return items;
}

async function fetchFeed(url: string, source: string): Promise<NewsItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; StudioNews/1.0; +https://organic.petaronline.us)',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseFeed(xml, source);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Merged, de-duplicated, freshest-first headlines. Cached for CACHE_TTL_MS. */
export async function getNews(): Promise<NewsItem[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.items;

  const results = await Promise.all(FEEDS.map((f) => fetchFeed(f.url, f.source)));
  const merged = results.flat();

  // De-dupe by title (case-insensitive).
  const seen = new Set<string>();
  const deduped = merged.filter((it) => {
    const k = it.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  deduped.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });

  const items = deduped.slice(0, MAX_ITEMS);
  // Only cache a non-empty result, so a transient total failure retries next
  // request rather than being pinned for 30 minutes.
  if (items.length > 0) cache = { items, at: Date.now() };
  return items;
}
