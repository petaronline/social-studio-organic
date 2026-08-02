'use client';

/**
 * The moodboard stage. Two layouts over the same items:
 *
 *   messy     — a freeform collage. Each item sits at its stored (x, y)
 *               fraction, tilted by its rotation, draggable, stack order by
 *               z-index. This is the "pin things to a wall" view.
 *   pinterest — a tidy masonry grid (CSS columns), rotation dropped, ordered
 *               by z-index. Same items, calm layout.
 *
 * Drag maths: pointer deltas are converted to fractions of the stage rect so
 * a move persists proportionally regardless of screen width.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, GripVertical, Minus, Plus } from 'lucide-react';
import type { MoodboardItem, MoodboardSwatchContent } from '@/lib/api';
import { MoodboardItemView } from './MoodboardItemView';
import { widthFor, TEXT_MIN_W, TEXT_MAX_W } from './widthFor';
import type { UseMoodboard } from './useMoodboard';

export type MoodboardView = 'messy' | 'pinterest';

interface DragState {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
}

export function MoodboardCanvas({
  board,
  view,
}: {
  board: UseMoodboard;
  view: MoodboardView;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, item: MoodboardItem) => {
      if (view !== 'messy') return;
      // Don't start a drag from an interactive element (link, textarea, button).
      const target = e.target as HTMLElement;
      if (target.closest('a, textarea, button, input')) return;
      const stage = stageRef.current;
      if (!stage) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = {
        id: item.id,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: item.x,
        originY: item.y,
        moved: false,
      };
    },
    [view]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      const stage = stageRef.current;
      if (!d || !stage || e.pointerId !== d.pointerId) return;
      const rect = stage.getBoundingClientRect();
      const dx = (e.clientX - d.startX) / rect.width;
      const dy = (e.clientY - d.startY) / rect.height;
      if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 3) {
        d.moved = true;
      }
      const nx = Math.min(0.98, Math.max(0.02, d.originX + dx));
      const ny = Math.min(0.98, Math.max(0.02, d.originY + dy));
      board.moveItem(d.id, nx, ny);
    },
    [board]
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      drag.current = null;
      const item = board.items.find((i) => i.id === d.id);
      if (item) {
        if (d.moved) {
          void board.commitMove(d.id, item.x, item.y, item.rotation);
        }
        void board.bringToFront(d.id);
      }
    },
    [board]
  );

  // Escape closes the note editor.
  useEffect(() => {
    if (!editingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditingId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingId]);

  if (view === 'pinterest') {
    const ordered = [...board.items].sort((a, b) => b.zIndex - a.zIndex);
    // Swatches don't belong in the masonry — they're a palette. Pull them out
    // and stack them, overlapping, in the bottom-right corner.
    const swatches = ordered.filter((i) => i.kind === 'swatch');
    const rest = ordered.filter((i) => i.kind !== 'swatch');
    return (
      <div className="relative h-full">
        <div className="h-full overflow-y-auto px-8 pb-28 pt-8">
          <div className="mx-auto max-w-6xl [column-fill:_balance] gap-4 [columns:2] sm:[columns:3] lg:[columns:4]">
            {rest.map((item) => (
              <div key={item.id} className="group relative mb-4 inline-block w-full break-inside-avoid">
                <MoodboardItemView item={item} width={widthFor(item)} />
                <DeleteButton onClick={() => board.remove(item.id)} />
              </div>
            ))}
          </div>
        </div>

        {swatches.length > 0 && (
          <div className="pointer-events-none absolute bottom-5 right-5 flex flex-col items-end">
            {swatches.map((s, i) => {
              const color = (s.content as MoodboardSwatchContent).color;
              return (
                <div
                  key={s.id}
                  className="group pointer-events-auto relative"
                  style={{ marginTop: i === 0 ? 0 : -26, zIndex: swatches.length - i }}
                >
                  {/* hex label, revealed on hover to the left */}
                  <span className="absolute right-[72px] top-1/2 -translate-y-1/2 rounded-md bg-ink px-2 py-1 font-mono text-2xs font-bold uppercase text-white opacity-0 shadow-lift transition-opacity group-hover:opacity-100">
                    {color}
                  </span>
                  <div
                    className="h-16 w-16 rounded-2xl shadow-lift ring-2 ring-white"
                    style={{ backgroundColor: color }}
                  />
                  <DeleteButton onClick={() => board.remove(s.id)} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Messy view ──────────────────────────────────────────────────
  return (
    <div
      ref={stageRef}
      className="relative h-full w-full overflow-hidden"
      onPointerMove={onPointerMove}
    >
      {board.items.map((item) => {
        const w = widthFor(item);
        const isEditing = editingId === item.id;
        return (
          <div
            key={item.id}
            className="group absolute touch-none select-none"
            style={{
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              zIndex: item.zIndex + 1,
              transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
              cursor: 'grab',
            }}
            onPointerDown={(e) => onPointerDown(e, item)}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={() => {
              if (item.kind === 'note' || item.kind === 'text') setEditingId(item.id);
            }}
          >
            {isEditing && (item.kind === 'note' || item.kind === 'text') ? (
              <InlineEditor
                item={item}
                width={w}
                onDone={(text) => {
                  void board.updateNoteText(item.id, text);
                  setEditingId(null);
                }}
              />
            ) : (
              <MoodboardItemView item={item} width={w} />
            )}

            {/* Hover chrome: a drag nub and a delete button. Hidden while
                editing so they don't fight the textarea. */}
            {!isEditing && (
              <>
                <div
                  className="pointer-events-none absolute -left-2 -top-2 rounded-full bg-white/90 p-0.5 text-ink-subtle opacity-0 shadow ring-1 ring-black/5 transition-opacity group-hover:opacity-100"
                  aria-hidden
                >
                  <GripVertical size={13} />
                </div>
                <DeleteButton onClick={() => board.remove(item.id)} />
                {item.kind === 'text' && (
                  <TextSizeControls
                    onSmaller={() =>
                      board.setWidth(item.id, Math.max(TEXT_MIN_W, w * 0.85))
                    }
                    onBigger={() =>
                      board.setWidth(item.id, Math.min(TEXT_MAX_W, w * 1.18))
                    }
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Smaller / bigger pill for text titles — appears under the title on hover. */
function TextSizeControls({
  onSmaller,
  onBigger,
}: {
  onSmaller: () => void;
  onBigger: () => void;
}) {
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();
  return (
    <div
      className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-white p-0.5 opacity-0 shadow-md ring-1 ring-black/5 transition-opacity group-hover:opacity-100"
      onPointerDown={stop}
    >
      <button
        onClick={(e) => { stop(e); onSmaller(); }}
        aria-label="Smaller"
        className="rounded-full p-1 text-ink-subtle transition-colors hover:bg-surface-alt hover:text-ink"
      >
        <Minus size={13} />
      </button>
      <button
        onClick={(e) => { stop(e); onBigger(); }}
        aria-label="Bigger"
        className="rounded-full p-1 text-ink-subtle transition-colors hover:bg-surface-alt hover:text-ink"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label="Remove"
      className="absolute -right-2 -top-2 z-10 rounded-full bg-white p-1 text-ink-subtle opacity-0 shadow-md ring-1 ring-black/5 transition-all hover:text-danger group-hover:opacity-100"
    >
      <X size={13} />
    </button>
  );
}

function InlineEditor({
  item,
  width,
  onDone,
}: {
  item: MoodboardItem;
  width: number;
  onDone: (text: string) => void;
}) {
  const content = item.content as { text: string; color?: string };
  const [text, setText] = useState(content.text);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => onDone(text.trim());
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
  };

  // Text title — big display type, no card.
  if (item.kind === 'text') {
    return (
      <div style={{ width }}>
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={200}
          placeholder="Title"
          className="w-full resize-none border-0 bg-transparent p-0 font-display font-extrabold uppercase leading-[0.95] tracking-tight outline-none"
          style={{ color: content.color || '#151529', fontSize: Math.round(width * 0.16) }}
        />
      </div>
    );
  }

  // Post-it note.
  return (
    <div
      className="rounded-[3px] px-4 py-3.5 shadow-[0_10px_26px_-8px_rgba(20,20,50,0.38)]"
      style={{ width, backgroundColor: content.color || '#FFF3B0' }}
    >
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        rows={3}
        maxLength={600}
        className="w-full resize-none border-0 bg-transparent p-0 font-hand text-[1.05rem] leading-snug text-[#2A2A3C] outline-none"
        placeholder="Type a note…"
      />
    </div>
  );
}
