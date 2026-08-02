'use client';

/**
 * Floating control cluster, bottom-left of the board (matches the approved
 * messy-view mock). One tool per row:
 *
 *   switch view — messy ⇄ pinterest
 *   add note    — drops a post-it you then edit in place
 *   add swatch  — a colour block (native picker)
 *   add link    — paste a URL; it's unfurled into a card
 *   upload      — file picker for images
 *
 * Pasting anywhere on the page also works (images + URLs) — these buttons
 * are the deliberate, discoverable path to the same thing.
 */

import { useRef, useState } from 'react';
import { LayoutGrid, StickyNote, Palette, Link2, Upload, Loader2, type LucideIcon } from 'lucide-react';
import type { UseMoodboard } from './useMoodboard';
import type { MoodboardView } from './MoodboardCanvas';

export function MoodboardControls({
  board,
  view,
  onToggleView,
}: {
  board: UseMoodboard;
  view: MoodboardView;
  onToggleView: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const disabled = board.full || board.busy;

  return (
    <div className="pointer-events-none absolute bottom-6 left-6 z-40 flex flex-col items-start gap-2">
      {board.full && (
        <div className="pointer-events-auto rounded-full bg-ink/85 px-3 py-1 text-2xs font-semibold text-white shadow-lift">
          Board full · {board.limit} max
        </div>
      )}

      {linkOpen && (
        <form
          className="pointer-events-auto flex items-center gap-1 rounded-full bg-surface p-1 pl-3 shadow-lift ring-1 ring-line"
          onSubmit={(e) => {
            e.preventDefault();
            const url = linkUrl.trim();
            if (url) {
              void board.addLink(url);
              setLinkUrl('');
              setLinkOpen(false);
            }
          }}
        >
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setLinkOpen(false)}
            placeholder="Paste a link…"
            className="w-52 bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
          />
          <button type="submit" className="btn-primary btn-sm rounded-full">
            Add
          </button>
        </form>
      )}

      <div className="pointer-events-auto flex flex-col gap-1 rounded-2xl bg-surface/95 p-1.5 shadow-lift ring-1 ring-line backdrop-blur">
        <Tool icon={LayoutGrid} label={view === 'messy' ? 'Tidy view' : 'Messy view'} onClick={onToggleView} />
        <div className="mx-2 my-0.5 h-px bg-line" />
        <Tool
          icon={StickyNote}
          label="Add note"
          disabled={disabled}
          onClick={() => void board.addNote('New note')}
        />
        <label className="contents">
          <Tool
            icon={Palette}
            label="Add swatch"
            disabled={disabled}
            asLabel
          />
          <input
            type="color"
            className="sr-only"
            disabled={disabled}
            onChange={(e) => void board.addSwatch(e.target.value.toUpperCase())}
          />
        </label>
        <Tool
          icon={Link2}
          label="Add link"
          disabled={disabled}
          onClick={() => setLinkOpen((v) => !v)}
        />
        <Tool
          icon={board.busy ? Loader2 : Upload}
          label={board.busy ? 'Working…' : 'Upload'}
          spin={board.busy}
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
        />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          files.forEach((f) => void board.addImageFromFile(f));
          e.target.value = '';
        }}
      />
    </div>
  );
}

function Tool({
  icon: Icon,
  label,
  onClick,
  disabled,
  spin,
  asLabel,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  spin?: boolean;
  /** Render the visual as a <span> so it can sit inside a <label>. */
  asLabel?: boolean;
}) {
  const cls =
    'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40';
  const inner = (
    <>
      <Icon size={16} className={['text-ink-subtle', spin ? 'animate-spin' : ''].join(' ')} />
      <span className="pr-1">{label}</span>
    </>
  );
  if (asLabel) {
    return (
      <span className={[cls, disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'].join(' ')}>
        {inner}
      </span>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}
