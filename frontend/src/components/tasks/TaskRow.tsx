'use client';

/**
 * One task line: a round checkbox (the "ticker"), the title, an optional due
 * date and tag, and a delete button. Checking it strikes the title through;
 * done or not, it can be deleted.
 *
 * When onSetDue / onSetTag are provided (the Tasks page), the due/tag chips are
 * editable inline and hover reveals affordances to add them. Without them (the
 * dashboard box) the chips are read-only.
 */

import { useState, type ReactNode } from 'react';
import { Check, X, CalendarClock, Tag } from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────

function localTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDue(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Soft tag palette, picked deterministically from the tag text. */
const TAG_STYLES = [
  { bg: '#FFE1EC', ink: '#B4245C' },
  { bg: '#DDE8FF', ink: '#2547A8' },
  { bg: '#D3F3E9', ink: '#0B6B52' },
  { bg: '#ECE2FF', ink: '#5B2FB0' },
  { bg: '#FFF0D6', ink: '#8A5A00' },
];
function tagStyle(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_STYLES[h % TAG_STYLES.length];
}

export function TaskRow({
  title,
  done,
  onToggle,
  onDelete,
  brandMark,
  dueDate = null,
  tag = null,
  onSetDue,
  onSetTag,
}: {
  title: string;
  done: boolean;
  onToggle: (next: boolean) => void;
  onDelete: () => void;
  brandMark?: ReactNode;
  dueDate?: string | null;
  tag?: string | null;
  onSetDue?: (date: string | null) => void;
  onSetTag?: (tag: string | null) => void;
}) {
  const [editing, setEditing] = useState<null | 'due' | 'tag'>(null);
  const overdue = !done && dueDate != null && dueDate < localTodayStr();

  return (
    <li className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-alt">
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

      {/* Due date */}
      {editing === 'due' ? (
        <input
          type="date"
          defaultValue={dueDate ?? ''}
          autoFocus
          onChange={(e) => { onSetDue?.(e.target.value || null); setEditing(null); }}
          onBlur={() => setEditing(null)}
          className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-2xs text-ink outline-none ring-1 ring-line"
        />
      ) : dueDate ? (
        <button
          onClick={() => onSetDue && setEditing('due')}
          className={[
            'flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums',
            overdue ? 'bg-cherry/10 text-cherry' : 'bg-surface-alt text-ink-muted',
          ].join(' ')}
        >
          <CalendarClock size={11} /> {fmtDue(dueDate)}
        </button>
      ) : onSetDue ? (
        <button
          onClick={() => setEditing('due')}
          title="Set due date"
          className="shrink-0 rounded-md p-1 text-ink-subtle opacity-0 transition-all hover:bg-black/5 hover:text-ink group-hover:opacity-100"
        >
          <CalendarClock size={13} />
        </button>
      ) : null}

      {/* Tag */}
      {editing === 'tag' ? (
        <input
          defaultValue={tag ?? ''}
          autoFocus
          placeholder="tag"
          maxLength={40}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onSetTag?.((e.target as HTMLInputElement).value || null); setEditing(null); }
            if (e.key === 'Escape') setEditing(null);
          }}
          onBlur={(e) => { onSetTag?.(e.target.value || null); setEditing(null); }}
          className="w-20 rounded-md bg-surface px-1.5 py-0.5 text-2xs text-ink outline-none ring-1 ring-line"
        />
      ) : tag ? (
        <button
          onClick={() => onSetTag && setEditing('tag')}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide"
          style={{ backgroundColor: tagStyle(tag).bg, color: tagStyle(tag).ink }}
        >
          {tag}
        </button>
      ) : onSetTag ? (
        <button
          onClick={() => setEditing('tag')}
          title="Add tag"
          className="shrink-0 rounded-md p-1 text-ink-subtle opacity-0 transition-all hover:bg-black/5 hover:text-ink group-hover:opacity-100"
        >
          <Tag size={13} />
        </button>
      ) : null}

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

/** Small circular brand mark — initials on the brand colour. */
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

