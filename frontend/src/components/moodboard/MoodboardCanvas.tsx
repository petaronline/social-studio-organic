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
import { X, GripVertical } from 'lucide-react';
import type { MoodboardItem, MoodboardNoteContent } from '@/lib/api';
import { MoodboardItemView } from './MoodboardItemView';
import type { UseMoodboard } from './useMoodboard';

export type MoodboardView = 'messy' | 'pinterest';

/** Deterministic per-item width jitter so a wall of images isn't uniform.
 *  Derived from the id, so it's stable across renders and reloads. */
function widthFor(item: MoodboardItem): number {
  let h = 0;
  for (let i = 0; i < item.id.length; i++) h = (h * 31 + item.id.charCodeAt(i)) >>> 0;
  const jitter = h % 60; // 0..59
  switch (item.kind) {
    case 'image': return 180 + jitter;      // 180..239
    case 'link': return 224 + (jitter % 40); // 224..263
    case 'note': return 168 + (jitter % 44); // 168..211
    case 'swatch': return 108 + (jitter % 36); // 108..143
    default: return 200;
  }
}

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
    return (
      <div className="h-full overflow-y-auto px-8 pb-28 pt-8">
        <div className="mx-auto max-w-6xl [column-fill:_balance] gap-4 [columns:2] sm:[columns:3] lg:[columns:4]">
          {ordered.map((item) => (
            <div key={item.id} className="group relative mb-4 inline-block w-full break-inside-avoid">
              <MoodboardItemView item={item} width={widthFor(item)} />
              <DeleteButton onClick={() => board.remove(item.id)} />
            </div>
          ))}
        </div>
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
              if (item.kind === 'note') setEditingId(item.id);
            }}
          >
            {isEditing && item.kind === 'note' ? (
              <NoteEditor
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
              </>
            )}
          </div>
        );
      })}
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

function NoteEditor({
  item,
  width,
  onDone,
}: {
  item: MoodboardItem;
  width: number;
  onDone: (text: string) => void;
}) {
  const content = item.content as MoodboardNoteContent;
  const [text, setText] = useState(content.text);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div
      className="rounded-[3px] px-4 py-3.5 shadow-[0_10px_26px_-8px_rgba(20,20,50,0.38)]"
      style={{ width, backgroundColor: content.color || '#FFF3B0' }}
    >
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onDone(text.trim())}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onDone(text.trim());
        }}
        rows={3}
        maxLength={600}
        className="w-full resize-none border-0 bg-transparent p-0 font-hand text-[1.05rem] leading-snug text-[#2A2A3C] outline-none"
        placeholder="Type a note…"
      />
    </div>
  );
}
