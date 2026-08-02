import type { MoodboardItem } from '@/lib/api';

export const TEXT_MIN_W = 120;
export const TEXT_MAX_W = 680;

/** Rendered width in px. A stored width (from resizing or the text-size
 *  buttons) wins; otherwise a deterministic per-item jitter derived from the
 *  id so a wall of images isn't uniform and stays stable across reloads.
 *  Shared by the interactive canvas and the read-only (shared) view so both
 *  lay a board out identically. */
export function widthFor(item: MoodboardItem): number {
  if (item.width != null) return item.width;
  let h = 0;
  for (let i = 0; i < item.id.length; i++) h = (h * 31 + item.id.charCodeAt(i)) >>> 0;
  const jitter = h % 60; // 0..59
  switch (item.kind) {
    case 'image': return 180 + jitter;      // 180..239
    case 'link': return 224 + (jitter % 40); // 224..263
    case 'note': return 168 + (jitter % 44); // 168..211
    case 'text': return 240 + (jitter % 80); // 240..319
    case 'swatch': return 108 + (jitter % 36); // 108..143
    default: return 200;
  }
}
