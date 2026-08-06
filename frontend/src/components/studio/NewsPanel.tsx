'use client';

/**
 * Studio dashboard box: latest social-media news headlines, merged from a few
 * industry feeds server-side. Titles link out. Self-contained fetch.
 */

import { useEffect, useState } from 'react';
import { Newspaper, ExternalLink } from 'lucide-react';
import { organicNews, type NewsItem } from '@/lib/api';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function NewsPanel() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    organicNews
      .list()
      .then((r) => { if (!cancelled) setItems(r.items); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="lab">Social media news</h2>
        <Newspaper size={15} className="text-ink-subtle" />
      </div>

      {loading ? (
        <p className="py-2 text-sm text-ink-subtle">Loading headlines…</p>
      ) : items.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">Couldn’t load headlines right now.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {items.slice(0, 6).map((it, i) => (
            <li key={i}>
              <a
                href={it.url}
                target="_blank"
                rel="noreferrer noopener"
                className="group flex items-start gap-2 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-medium leading-snug text-ink group-hover:text-cherry">
                    {it.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wide text-ink-subtle">
                    {it.source}
                    {it.publishedAt && <span>· {timeAgo(it.publishedAt)}</span>}
                  </span>
                </span>
                <ExternalLink size={13} className="mt-0.5 shrink-0 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
