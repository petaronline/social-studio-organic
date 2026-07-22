'use client';

/**
 * Studio dashboard panels.
 *
 * Deliberately built only on data we trust today — the calendar, drafts,
 * ideas, and token expiry. No engagement figures: insights are unreliable
 * right now, and a dashboard that states wrong numbers confidently is worse
 * than one that stays quiet. The layout leaves room for a reach/top-post
 * tile to slot in when they're fixed.
 */

import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarClock } from 'lucide-react';
import type { CalendarPost } from '@/lib/api';
import { multiPlatformVisual } from '@/lib/platform-visuals';
import { relativeWhen, type AttentionItem, type DayCell } from './DashboardData';

// ─── Next up ─────────────────────────────────────────────────────────

export function NextUpPanel({
  posts,
  accountNames,
  onOpenComposer,
}: {
  posts: CalendarPost[];
  accountNames: Record<string, string>;
  onOpenComposer: () => void;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="lab">Next up</h2>
        <Link href="/organic/pipeline" className="lab hover:text-ink">
          Pipeline →
        </Link>
      </div>

      {posts.length === 0 ? (
        /* An empty queue is the one state worth an action rather than a
           shrug — it's the whole reason to open this page. */
        <div className="flex flex-col items-start gap-3 py-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-alt text-ink-subtle">
            <CalendarClock size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Nothing scheduled</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              This brand has no posts queued.
            </p>
          </div>
          <button onClick={onOpenComposer} className="btn-primary btn-sm">
            Schedule one
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((p) => {
            const pv = multiPlatformVisual(p.platforms);
            const who =
              p.accountIds.map((id) => accountNames[id]).filter(Boolean)[0] ?? pv.label;
            const when = relativeWhen(p.timestamp);
            const overdue = when === 'overdue';
            return (
              <li
                key={`${p.source}:${p.id}`}
                className="flex items-start gap-3 rounded-md px-3 py-2.5"
                style={{ backgroundColor: pv.bg, color: pv.ink }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="chip-when">{when}</span>
                    {overdue && (
                      <span className="rounded-sm bg-danger px-1.5 py-0.5 font-mono text-2xs font-bold uppercase tracking-[0.1em] text-white">
                        stuck
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs font-medium leading-snug">
                    {p.body || <span className="italic opacity-60">(no text)</span>}
                  </p>
                  <span className="chip-when mt-1 block truncate">{who}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Needs attention ─────────────────────────────────────────────────

export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  return (
    <section className="card p-5">
      <h2 className="lab mb-4">Needs attention</h2>

      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Nothing broken. Every post landed and every connection is healthy.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li key={i}>
              <Link
                href={item.href}
                className="group flex items-start gap-3 rounded-md border border-danger/20 bg-danger/5 px-3 py-2.5 transition-colors hover:bg-danger/10"
              >
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-ink">{item.label}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{item.detail}</p>
                </div>
                <ArrowRight
                  size={14}
                  className="mt-0.5 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Week cadence ────────────────────────────────────────────────────

/**
 * Seven bars, one per day. The gaps are the point — you can see at a glance
 * that Thursday and Friday are empty while there's still time to fix it.
 * Past days are muted so an empty Monday doesn't read as a task.
 */
export function CadencePanel({
  week,
  emptyDaysAhead,
}: {
  week: DayCell[];
  emptyDaysAhead: number;
}) {
  const busiest = Math.max(1, ...week.map((d) => d.scheduled + d.published));

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="lab">This week</h2>
        <p className="text-xs text-ink-muted">
          {emptyDaysAhead === 0
            ? 'Every remaining day has something'
            : `${emptyDaysAhead} day${emptyDaysAhead === 1 ? '' : 's'} ahead still empty`}
        </p>
      </div>

      <div className="flex items-end gap-2">
        {week.map((d, i) => {
          const total = d.scheduled + d.published;
          // Always give an occupied day a visible bar, so "one post" never
          // rounds down to nothing.
          const height = total === 0 ? 4 : Math.max(10, Math.round((total / busiest) * 56));
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="font-mono text-2xs tabular-nums text-ink-subtle">
                {total > 0 ? total : ''}
              </span>
              <div
                className={[
                  'w-full rounded-sm transition-colors',
                  total === 0
                    ? 'bg-line'
                    : d.isPast
                    ? 'bg-ink/25'
                    : 'bg-cherry',
                ].join(' ')}
                style={{ height }}
                title={`${d.published} published · ${d.scheduled} scheduled`}
              />
              <span
                className={[
                  'lab',
                  d.isToday ? 'text-cherry' : '',
                ].join(' ')}
              >
                {d.date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
