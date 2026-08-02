'use client';

/**
 * Bottom-left controls.
 *
 * A single cherry "+" button is the resting state; clicking it opens the add
 * menu upward (title, note, swatch, link, upload). Swatch and link expand an
 * inline composer. The messy/tidy view toggle sits beside the "+" as its own
 * always-visible button, since it's flipped often and shouldn't be buried.
 *
 * Pasting anywhere on the page also adds things — these are the deliberate,
 * discoverable path.
 */

import { useRef, useState } from 'react';
import {
  Plus,
  X,
  Type,
  StickyNote,
  Palette,
  Link2,
  Upload,
  Loader2,
  LayoutGrid,
  Shuffle,
  type LucideIcon,
} from 'lucide-react';
import type { UseMoodboard } from './useMoodboard';
import type { MoodboardView } from './MoodboardCanvas';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

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
  const [open, setOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [swatchOpen, setSwatchOpen] = useState(false);
  const [hex, setHex] = useState('#30915A');

  const disabled = board.full || board.busy;

  const closeAll = () => {
    setOpen(false);
    setLinkOpen(false);
    setSwatchOpen(false);
  };

  return (
    <div className="absolute bottom-6 left-6 z-40 flex flex-col items-start gap-2">
      {board.full && (
        <div className="rounded-full bg-ink/85 px-3 py-1 text-2xs font-semibold text-white shadow-lift">
          Board full · {board.limit} max
        </div>
      )}

      {/* Add menu — springs up from the + button (PillFlow-ish: the card
          scales from its bottom-left origin and the rows flow in staggered). */}
      {open && (
        <div className="mb-menu w-56 overflow-hidden rounded-2xl bg-surface/95 p-1.5 shadow-lift ring-1 ring-line backdrop-blur">
          <Tool
            icon={Type}
            label="Add title"
            delay={0}
            disabled={disabled}
            onClick={() => {
              void board.addText('Title');
              closeAll();
            }}
          />
          <Tool
            icon={StickyNote}
            label="Add note"
            delay={40}
            disabled={disabled}
            onClick={() => {
              void board.addNote('New note');
              closeAll();
            }}
          />

          {/* Swatch — colour picker + hex field side by side. */}
          <Tool
            icon={Palette}
            label="Add swatch"
            delay={80}
            disabled={disabled}
            active={swatchOpen}
            onClick={() => {
              setSwatchOpen((v) => !v);
              setLinkOpen(false);
            }}
          />
          {swatchOpen && (
            <div className="mb-1 flex items-center gap-2 rounded-xl bg-surface-alt px-2.5 py-2">
              <input
                type="color"
                value={HEX_RE.test(hex) ? hex : '#30915A'}
                onChange={(e) => setHex(e.target.value.toUpperCase())}
                className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-0"
                aria-label="Pick a colour"
              />
              <input
                value={hex}
                onChange={(e) => {
                  let v = e.target.value.toUpperCase();
                  if (v && !v.startsWith('#')) v = `#${v}`;
                  setHex(v.slice(0, 7));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && HEX_RE.test(hex)) {
                    void board.addSwatch(hex);
                    closeAll();
                  }
                }}
                placeholder="#RRGGBB"
                spellCheck={false}
                className="w-full min-w-0 bg-transparent font-mono text-sm uppercase text-ink outline-none placeholder:text-ink-subtle"
              />
              <button
                disabled={!HEX_RE.test(hex)}
                onClick={() => {
                  void board.addSwatch(hex);
                  closeAll();
                }}
                className="btn-primary btn-sm shrink-0 rounded-lg disabled:opacity-40"
              >
                Add
              </button>
            </div>
          )}

          {/* Link — paste a URL, unfurled into a card. */}
          <Tool
            icon={Link2}
            label="Add link"
            delay={120}
            disabled={disabled}
            active={linkOpen}
            onClick={() => {
              setLinkOpen((v) => !v);
              setSwatchOpen(false);
            }}
          />
          {linkOpen && (
            <form
              className="mb-1 flex items-center gap-1 rounded-xl bg-surface-alt px-2.5 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                const url = linkUrl.trim();
                if (url) {
                  void board.addLink(url);
                  setLinkUrl('');
                  closeAll();
                }
              }}
            >
              <input
                autoFocus
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="Paste a link…"
                className="w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
              />
              <button type="submit" className="btn-primary btn-sm shrink-0 rounded-lg">
                Add
              </button>
            </form>
          )}

          <Tool
            icon={board.busy ? Loader2 : Upload}
            label={board.busy ? 'Working…' : 'Upload image'}
            delay={160}
            spin={board.busy}
            disabled={disabled}
            onClick={() => fileRef.current?.click()}
          />
        </div>
      )}

      {/* Resting stack — the "+" sits on top of the view toggle. Both are
          small round buttons; the toggle is icon-only with a hover tooltip. */}
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => (open ? closeAll() : setOpen(true))}
          title={open ? 'Close' : 'Add to board'}
          aria-label={open ? 'Close menu' : 'Add to board'}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-cherry text-white shadow-lift transition-transform hover:scale-105"
        >
          <Plus size={20} className={`transition-transform duration-200 ${open ? 'rotate-45' : ''}`} />
        </button>

        <button
          onClick={onToggleView}
          title={view === 'messy' ? 'Tidy view' : 'Messy view'}
          aria-label={view === 'messy' ? 'Tidy view' : 'Messy view'}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-surface/95 text-ink shadow-lift ring-1 ring-line backdrop-blur transition-colors hover:bg-surface-alt"
        >
          {view === 'messy' ? <LayoutGrid size={18} /> : <Shuffle size={18} />}
        </button>
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
          closeAll();
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
  active,
  delay,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  spin?: boolean;
  active?: boolean;
  /** Stagger offset (ms) for the flow-in animation. */
  delay?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={delay != null ? { animationDelay: `${delay}ms` } : undefined}
      className={[
        'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink transition-colors',
        delay != null ? 'mb-pop' : '',
        active ? 'bg-surface-alt' : 'hover:bg-surface-alt',
        'disabled:cursor-not-allowed disabled:opacity-40',
      ].join(' ')}
    >
      <Icon size={16} className={['text-ink-subtle', spin ? 'animate-spin' : ''].join(' ')} />
      <span className="pr-1">{label}</span>
    </button>
  );
}
