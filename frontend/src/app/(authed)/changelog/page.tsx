'use client';

/**
 * What's new — a Sketch-style changelog. Each release leads with its big
 * features (large cards) and lists the smaller fixes & improvements below.
 *
 * Content is hand-authored here; add a new release object to the top of
 * RELEASES when something ships.
 */

import { Sparkles, Images, ListChecks, NotebookPen, Share2, FileDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  tag: 'New' | 'Improved';
  title: string;
  body: string;
}
interface Release {
  date: string; // display label
  features: Feature[];
  fixes: string[];
}

const RELEASES: Release[] = [
  {
    date: 'August 6, 2026',
    features: [
      {
        icon: NotebookPen,
        tag: 'New',
        title: 'Notes & meeting notes',
        body: 'A per-brand notebook with a proper rich editor — headings, checklists, lists, quotes and formatting — that autosaves as you type. Meeting notes add a date and attendees and open on an Agenda / Discussion / Action-items template.',
      },
      {
        icon: ListChecks,
        tag: 'New',
        title: 'Task lists',
        body: 'Simple per-brand to-do lists: tick to strike through, delete when done. The Studio dashboard shows the five most pressing tasks across every brand, each tagged with its brand.',
      },
    ],
    fixes: [
      'The Studio dashboard is now three columns — Pipeline, Tasks, and Notable dates — instead of piling everything into one side.',
      'New post and Drop an idea moved up into the stats row.',
      'Removed the placeholder notifications bell (it will return once there’s multi-user activity to surface).',
      'Refresh on Settings → Social profiles now confirms when it re-reads your profiles.',
      'Added this What’s-new page.',
    ],
  },
  {
    date: 'August 2, 2026',
    features: [
      {
        icon: Images,
        tag: 'New',
        title: 'Moodboard',
        body: 'A per-brand visual reference wall (up to 25 items): drop images, colour swatches, post-it notes and iMessage-style link cards. Paste anything — screenshots, copied images, links. Two views: a freeform “messy” collage you can drag and tilt, and a tidy masonry. Add things from a springy “+” menu; notes use a handwritten face.',
      },
      {
        icon: Share2,
        tag: 'New',
        title: 'Share a moodboard by link',
        body: 'Publish a board behind an unguessable link — anyone can view it read-only, no sign-in, no sidebar. Revoke any time.',
      },
      {
        icon: FileDown,
        tag: 'New',
        title: 'Export to PNG or PDF',
        body: 'Download a board as an image or a PDF, from your board or the shared page.',
      },
    ],
    fixes: [
      'Copied web images now paste reliably and display everywhere — they’re fetched through the server, so hotlink blocks don’t leave blank tiles, and they survive export.',
      'Notes render in the Casual Human handwriting face.',
      'Text titles you can resize; colour swatches take a hex code alongside the picker.',
      'A soft dot-grid working surface behind the board.',
      'The profile rail is hidden on the moodboard (the brand is already shown).',
      'Fixed image uploads failing to save (a storage-permissions issue on the server).',
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-2xl pb-16">
      <header className="mb-10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-cherry/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cherry">
          <Sparkles size={13} /> What’s new
        </div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Changelog</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Everything we’ve shipped in The Social Studio, newest first.
        </p>
      </header>

      <div className="flex flex-col gap-14">
        {RELEASES.map((release) => (
          <section key={release.date}>
            <div className="mb-4 flex items-center gap-3">
              <span className="font-mono text-xs font-bold uppercase tracking-wide text-ink-subtle">
                {release.date}
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>

            {/* Big features */}
            <div className="flex flex-col gap-3">
              {release.features.map((f) => {
                const Icon = f.icon;
                return (
                  <article
                    key={f.title}
                    className="overflow-hidden rounded-2xl bg-surface shadow-lift ring-1 ring-line"
                  >
                    <div className="flex items-start gap-4 p-5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cherry/10 text-cherry">
                        <Icon size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="font-display text-lg font-extrabold text-ink">{f.title}</h2>
                          <span
                            className={[
                              'rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide',
                              f.tag === 'New' ? 'bg-cherry text-white' : 'bg-surface-alt text-ink-muted',
                            ].join(' ')}
                          >
                            {f.tag}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{f.body}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Small fixes */}
            {release.fixes.length > 0 && (
              <div className="mt-5">
                <h3 className="lab mb-2">Fixes & improvements</h3>
                <ul className="flex flex-col gap-1.5">
                  {release.fixes.map((fix, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-ink-muted">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
                      <span>{fix}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
