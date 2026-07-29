'use client';

/**
 * Notable-dates panel + overlay for Studio.
 *
 * The panel lists the marketing moments coming up this month; clicking one
 * opens a small overlay with what the date is and a "Create a post" button
 * that launches the composer with that day already scheduled.
 *
 * Why an overlay and not straight into the composer: the composer is a heavy
 * modal, and half the value of a notable date is deciding whether it's worth
 * a post at all. The overlay is the cheap "should I?" step before the
 * expensive "let's write it" one.
 */

import { useMemo, useState } from 'react';
import { CalendarHeart, ArrowRight, X } from 'lucide-react';
import {
  notableDatesForMonth,
  CATEGORY_STYLE,
  type NotableDateInstance,
} from '@/lib/notable-dates';
import { NotableDateArt } from './NotableDateArt';

/** A sensible default post time, so the composer opens on a real slot rather
 *  than midnight: 10:00 local on the date. */
function defaultTimeFor(date: Date): string {
  const d = new Date(date);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

export function NotableDatesPanel({
  onCreateForDate,
  now = new Date(),
}: {
  /** Launch the composer with this ISO time pre-scheduled. */
  onCreateForDate: (isoTime: string, title: string) => void;
  now?: Date;
}) {
  const [selected, setSelected] = useState<NotableDateInstance | null>(null);

  // This month, but only dates still ahead — a passed awareness day isn't
  // something you can plan for. Roll to next month once this one's spent.
  const upcoming = useMemo(() => {
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisMonth = notableDatesForMonth(now.getFullYear(), now.getMonth() + 1).filter(
      (d) => d.date >= todayMid
    );
    if (thisMonth.length >= 3) return { label: 'This month', items: thisMonth };

    // Thin tail of the month → show next month instead of a near-empty list.
    const nextM = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
    const nextY = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const next = notableDatesForMonth(nextY, nextM);
    return {
      label: new Date(nextY, nextM - 1, 1).toLocaleDateString(undefined, { month: 'long' }),
      items: [...thisMonth, ...next].slice(0, 8),
    };
  }, [now]);

  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="lab">Notable dates · {upcoming.label}</h2>
        <CalendarHeart size={15} className="text-ink-subtle" />
      </div>

      {upcoming.items.length === 0 ? (
        <p className="text-sm text-ink-muted">No notable dates left this month.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {upcoming.items.map((d) => {
            const style = CATEGORY_STYLE[d.category];
            return (
              <li key={`${d.month}-${d.day}-${d.title}`}>
                <button
                  onClick={() => setSelected(d)}
                  className="group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-alt"
                >
                  {/* Motif tile doubles as the date chip: the illustration on
                      a faint category-tinted ground, with the day number
                      pinned in the corner — one element carries both "what"
                      and "when". */}
                  <span
                    className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg"
                    style={{ backgroundColor: style.bg }}
                  >
                    <NotableDateArt title={d.title} category={d.category} size={40} />
                    <span
                      className="absolute bottom-0 right-0 rounded-tl-md bg-surface px-1 font-mono text-2xs font-bold tabular-nums"
                      style={{ color: style.ink }}
                    >
                      {d.day}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {d.title}
                    </span>
                    <span className="lab" style={{ color: style.ink }}>
                      {style.label}
                    </span>
                  </span>
                  <ArrowRight
                    size={14}
                    className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <NotableDateOverlay
          date={selected}
          onClose={() => setSelected(null)}
          onCreate={() => {
            const iso = defaultTimeFor(selected.date);
            const title = selected.title;
            setSelected(null);
            onCreateForDate(iso, title);
          }}
        />
      )}
    </section>
  );
}

// ─── Overlay ─────────────────────────────────────────────────────────

function NotableDateOverlay({
  date,
  onClose,
  onCreate,
}: {
  date: NotableDateInstance;
  onClose: () => void;
  onCreate: () => void;
}) {
  const style = CATEGORY_STYLE[date.category];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="animate-slide-up w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        {/* White header so the coral+blue illustration is the hero — a
            category tint behind it fought the fixed two-tone art. The tint
            survives only as the small category label. The motif sits large
            on the right; the title/date sit left. */}
        <div className="relative overflow-hidden bg-surface p-6">
          <div className="pointer-events-none absolute -right-2 top-2" aria-hidden>
            <NotableDateArt title={date.title} category={date.category} size={132} />
          </div>

          <div className="relative flex items-start justify-between">
            <div className="pr-24">
              <div className="lab" style={{ color: style.ink }}>
                {style.label}
              </div>
              <h3 className="mt-1 max-w-[14ch] font-display text-2xl font-extrabold leading-tight text-ink">
                {date.title}
              </h3>
              <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-ink-muted">
                {date.date.toLocaleDateString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="relative z-10 rounded-full p-1.5 text-ink-subtle transition-colors hover:bg-surface-alt hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="mx-6 border-t border-line" />

        <div className="p-6">
          {date.note ? (
            <p className="text-sm text-ink-muted">{date.note}</p>
          ) : (
            <p className="text-sm text-ink-muted">
              A moment worth posting for. Create a post scheduled for this day.
            </p>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            <button onClick={onClose} className="btn-secondary btn-sm">
              Not this time
            </button>
            <button onClick={onCreate} className="btn-primary btn-sm">
              Create a post for {dayLabel(date.date)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
