'use client';

/**
 * Read-only board — the exact messy/tidy layouts the interactive canvas
 * produces, with every affordance stripped out. Used by the public share
 * page and as the snapshot target for PNG/PDF export.
 *
 * Uploaded images resolve through the token-scoped public media endpoint
 * (passed as shareToken) since a public visitor has no auth cookie.
 */

import { forwardRef } from 'react';
import type { MoodboardItem, MoodboardSwatchContent } from '@/lib/api';
import { MoodboardItemView } from './MoodboardItemView';
import { widthFor } from './widthFor';
import type { MoodboardView } from './MoodboardCanvas';

export const ReadOnlyBoard = forwardRef<
  HTMLDivElement,
  { items: MoodboardItem[]; view: MoodboardView; shareToken?: string }
>(function ReadOnlyBoard({ items, view, shareToken }, ref) {
  if (view === 'pinterest') {
    const ordered = [...items].sort((a, b) => b.zIndex - a.zIndex);
    const swatches = ordered.filter((i) => i.kind === 'swatch');
    const rest = ordered.filter((i) => i.kind !== 'swatch');
    return (
      <div ref={ref} className="relative h-full bg-[#FBFBFD]">
        <div className="h-full overflow-y-auto px-8 pb-12 pt-8">
          <div className="mx-auto max-w-6xl [column-fill:_balance] gap-4 [columns:2] sm:[columns:3] lg:[columns:4]">
            {rest.map((item) => (
              <div key={item.id} className="mb-4 inline-block w-full break-inside-avoid">
                <MoodboardItemView item={item} width={widthFor(item)} shareToken={shareToken} />
              </div>
            ))}
          </div>
        </div>
        {swatches.length > 0 && (
          <div className="pointer-events-none absolute bottom-5 right-5 flex flex-col items-end">
            {swatches.map((s, i) => (
              <div key={s.id} style={{ marginTop: i === 0 ? 0 : -26, zIndex: swatches.length - i }}>
                <div
                  className="h-16 w-16 rounded-2xl shadow-lift ring-2 ring-white"
                  style={{ backgroundColor: (s.content as MoodboardSwatchContent).color }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Messy — absolute placement by stored fraction/rotation/z.
  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden bg-[#FBFBFD]">
      {items.map((item) => (
        <div
          key={item.id}
          className="absolute"
          style={{
            left: `${item.x * 100}%`,
            top: `${item.y * 100}%`,
            zIndex: item.zIndex + 1,
            transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
          }}
        >
          <MoodboardItemView item={item} width={widthFor(item)} shareToken={shareToken} />
        </div>
      ))}
    </div>
  );
});
