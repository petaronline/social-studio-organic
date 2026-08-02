'use client';

/**
 * Moodboard — a per-brand visual reference wall.
 *
 * Deliberately unlike every other page: no PageHeader, no card chrome. It
 * breaks out of the layout's padding to a full-bleed canvas, because a
 * moodboard is a place, not a report. Chrome is reduced to a brand chip
 * (top-left) and the floating tool cluster (bottom-left).
 *
 * Per-brand: the board belongs to whichever brand is in scope. With "All
 * brands" (or a multi-select) there's no single board to show, so we prompt
 * to pick one — mirroring how "Drop an idea" gates on a concrete scope.
 *
 * Paste anywhere: images become cards, URLs become link previews. The tool
 * cluster is the discoverable path to the same actions.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Images } from 'lucide-react';
import {
  brands as brandsApi,
  type Brand,
} from '@/lib/api';
import {
  getActiveBrandId,
  VASS_ACTIVE_SCOPE_EVENT,
} from '@/components/BrandSelector';
import { useMoodboard } from '@/components/moodboard/useMoodboard';
import { MoodboardCanvas, type MoodboardView } from '@/components/moodboard/MoodboardCanvas';
import { MoodboardControls } from '@/components/moodboard/MoodboardControls';
import { MoodboardTopActions } from '@/components/moodboard/MoodboardTopActions';

export default function MoodboardPage() {
  // ── Active brand ────────────────────────────────────────────────
  const [brandId, setBrandId] = useState<string | 'all'>('all');
  useEffect(() => {
    setBrandId(getActiveBrandId());
    const onChange = () => setBrandId(getActiveBrandId());
    window.addEventListener(VASS_ACTIVE_SCOPE_EVENT, onChange);
    return () => window.removeEventListener(VASS_ACTIVE_SCOPE_EVENT, onChange);
  }, []);

  const activeBrandId = brandId === 'all' ? null : brandId;

  // Brand name for the chip.
  const [brandList, setBrandList] = useState<Brand[]>([]);
  useEffect(() => {
    brandsApi.list().then((r) => setBrandList(r.brands)).catch(() => { /* silent */ });
  }, []);
  const brand = useMemo(
    () => brandList.find((b) => b.id === activeBrandId) ?? null,
    [brandList, activeBrandId]
  );

  // ── Board state ─────────────────────────────────────────────────
  const board = useMoodboard(activeBrandId);
  const [view, setView] = useState<MoodboardView>('messy');
  // Snapshot target for PNG/PDF export — wraps the canvas only, so the chip
  // and floating controls stay out of the exported image.
  const boardRef = useRef<HTMLDivElement | null>(null);

  // Paste anywhere on the page.
  useEffect(() => {
    if (!activeBrandId) return;
    const onPaste = (e: ClipboardEvent) => board.handlePaste(e);
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [activeBrandId, board]);

  // Auto-dismiss the notice.
  useEffect(() => {
    if (!board.notice) return;
    const t = setTimeout(board.clearNotice, 3200);
    return () => clearTimeout(t);
  }, [board.notice, board.clearNotice]);

  // The canvas fills the layout's padding box exactly (see the height calc):
  // panel height minus <main>'s py-7 top+bottom, with -m-7 reclaiming the
  // padding so the board runs edge to edge.
  const shell =
    'mb-paper relative -m-7 h-[calc(100vh-5rem)] overflow-hidden sm:h-[calc(100vh-6rem)]';

  // ── No brand in scope ───────────────────────────────────────────
  if (!activeBrandId) {
    return (
      <div className={`${shell} flex items-center justify-center`}>
        <div className="max-w-sm rounded-2xl bg-surface px-8 py-10 text-center shadow-lift ring-1 ring-line">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-platform-ig text-platform-ig-ink">
            <Images size={22} />
          </div>
          <h2 className="font-display text-lg font-extrabold text-ink">
            Pick a brand to open its moodboard
          </h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            Each brand keeps its own wall of references — images, colours, notes and
            links. Choose one brand in the picker on the left to start pinning.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      {/* Brand chip, top-left. */}
      <div className="pointer-events-none absolute left-6 top-6 z-40 flex items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-surface/95 py-1.5 pl-2 pr-3.5 shadow-lift ring-1 ring-line backdrop-blur">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full text-2xs font-bold text-white"
            style={{ backgroundColor: brand?.color ?? '#FF2D55' }}
          >
            {(brand?.name ?? '?').charAt(0).toUpperCase()}
          </span>
          <span className="text-sm font-semibold text-ink">
            {brand?.name ?? 'Moodboard'}
          </span>
          <span className="font-mono text-2xs font-bold tabular-nums text-ink-subtle">
            {board.items.length}/{board.limit}
          </span>
        </div>
      </div>

      {/* The board itself. */}
      {board.loading ? (
        <div className="flex h-full items-center justify-center text-sm text-ink-subtle">
          Loading board…
        </div>
      ) : board.error ? (
        <div className="flex h-full items-center justify-center">
          <div className="rounded-xl bg-surface px-6 py-5 text-center shadow-lift ring-1 ring-line">
            <p className="text-sm text-ink-muted">{board.error}</p>
            <button onClick={board.reload} className="btn-secondary btn-sm mt-3">
              Try again
            </button>
          </div>
        </div>
      ) : (
        <>
          <div ref={boardRef} className="h-full w-full">
            <MoodboardCanvas board={board} view={view} />
          </div>
          {board.items.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="font-hand text-2xl text-ink-subtle">a blank wall</p>
                <p className="mt-2 max-w-xs text-sm text-ink-muted">
                  Paste an image or a link anywhere, or use the tools in the corner ↙
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Share + Export, top-right. */}
      {!board.loading && !board.error && (
        <MoodboardTopActions
          brandId={activeBrandId}
          brandName={brand?.name ?? 'Moodboard'}
          boardRef={boardRef}
        />
      )}

      {/* Tools. */}
      {!board.loading && !board.error && (
        <MoodboardControls
          board={board}
          view={view}
          onToggleView={() => setView((v) => (v === 'messy' ? 'pinterest' : 'messy'))}
        />
      )}

      {/* Notice toast. */}
      {board.notice && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow-lift">
            {board.notice}
          </div>
        </div>
      )}
    </div>
  );
}
