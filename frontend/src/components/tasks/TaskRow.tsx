'use client';

/**
 * One task line: a round checkbox (the "ticker") at the start, the title, and
 * a delete button. Checking it strikes the title through; done or not, it can
 * be deleted. An optional brandMark renders at the row end — the dashboard box
 * uses it to show which brand each cross-brand task belongs to.
 */

import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';

export function TaskRow({
  title,
  done,
  onToggle,
  onDelete,
  brandMark,
}: {
  title: string;
  done: boolean;
  onToggle: (next: boolean) => void;
  onDelete: () => void;
  brandMark?: ReactNode;
}) {
  return (
    <li className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-alt">
      <button
        onClick={() => onToggle(!done)}
        aria-label={done ? 'Mark not done' : 'Mark done'}
        aria-pressed={done}
        className={[
          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          done ? 'border-cherry bg-cherry text-white' : 'border-line-strong text-transparent hover:border-cherry',
        ].join(' ')}
      >
        <Check size={11} strokeWidth={3.5} />
      </button>

      <span
        className={[
          'min-w-0 flex-1 truncate text-sm transition-colors',
          done ? 'text-ink-subtle line-through' : 'text-ink',
        ].join(' ')}
      >
        {title}
      </span>

      {brandMark}

      <button
        onClick={onDelete}
        aria-label="Delete task"
        className="shrink-0 rounded-md p-1 text-ink-subtle opacity-0 transition-all hover:bg-black/5 hover:text-danger group-hover:opacity-100"
      >
        <X size={14} />
      </button>
    </li>
  );
}

/** Small circular brand mark — initials on the brand colour. Robust (no
 *  dependence on a profile picture that might be a placeholder). */
export function BrandMark({ name, color, size = 20 }: { name: string; color: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.42 }}
      title={name}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
