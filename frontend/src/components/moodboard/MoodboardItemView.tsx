'use client';

/**
 * One moodboard item's visual, sized to a given width. Position, rotation,
 * drag handles and the delete affordance are the canvas's job — this only
 * decides what a card of each kind looks like.
 *
 *   image   → a photo with a thin white "print" frame and a soft shadow
 *   swatch  → a solid colour block with its hex in mono underneath
 *   note    → a post-it in a handwritten hand
 *   link    → an iMessage-style preview card (thumb + title + host)
 */

import {
  uploads,
  type MoodboardItem,
  type MoodboardImageContent,
  type MoodboardSwatchContent,
  type MoodboardNoteContent,
  type MoodboardLinkContent,
  type MoodboardTextContent,
} from '@/lib/api';

/** Where an image item's bytes come from: an upload, or a pasted URL. */
export function imageSrc(content: MoodboardImageContent): string | null {
  if (content.uploadId) return uploads.fileUrl(content.uploadId);
  if (content.url) return content.url;
  return null;
}

/** A readable ink colour (near-black or near-white) for text on a swatch. */
function contrastInk(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#1A1A2E';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Perceived luminance.
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.6 ? '#1A1A2E' : '#FFFFFF';
}

export function MoodboardItemView({
  item,
  width,
}: {
  item: MoodboardItem;
  /** Rendered width in px. Height follows the content. */
  width: number;
}) {
  switch (item.kind) {
    case 'image': {
      const content = item.content as MoodboardImageContent;
      const src = imageSrc(content);
      const ratio =
        content.naturalWidth && content.naturalHeight
          ? content.naturalHeight / content.naturalWidth
          : undefined;
      return (
        <div
          className="overflow-hidden rounded-lg bg-white p-1.5 shadow-[0_10px_30px_-8px_rgba(20,20,50,0.35)] ring-1 ring-black/[0.04]"
          style={{ width }}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt=""
              draggable={false}
              className="block w-full rounded-[3px] object-cover"
              style={ratio ? { aspectRatio: `1 / ${ratio}` } : undefined}
            />
          ) : (
            <div className="flex h-32 w-full items-center justify-center rounded-[3px] bg-surface-alt text-2xs text-ink-subtle">
              image unavailable
            </div>
          )}
        </div>
      );
    }

    case 'swatch': {
      const { color } = item.content as MoodboardSwatchContent;
      const ink = contrastInk(color);
      return (
        <div
          className="flex flex-col justify-end overflow-hidden rounded-xl shadow-[0_8px_22px_-8px_rgba(20,20,50,0.4)] ring-1 ring-black/[0.04]"
          style={{ width, height: Math.round(width * 0.9), backgroundColor: color }}
        >
          <div
            className="px-2.5 pb-2 font-mono text-2xs font-bold uppercase tracking-wide"
            style={{ color: ink }}
          >
            {color}
          </div>
        </div>
      );
    }

    case 'note': {
      const { text, color } = item.content as MoodboardNoteContent;
      const paper = color || '#FFF3B0';
      const ink = contrastInk(paper) === '#FFFFFF' ? '#FFFFFF' : '#2A2A3C';
      return (
        <div
          className="rounded-[3px] px-4 py-3.5 shadow-[0_10px_26px_-8px_rgba(20,20,50,0.38)]"
          style={{ width, backgroundColor: paper }}
        >
          <p
            className="whitespace-pre-wrap break-words font-hand text-[1.05rem] leading-snug"
            style={{ color: ink }}
          >
            {text || '…'}
          </p>
        </div>
      );
    }

    case 'text': {
      const { text, color } = item.content as MoodboardTextContent;
      // A title laid straight on the canvas — no card, no background. Size
      // scales with the item width so a wide title reads big.
      return (
        <div style={{ width }}>
          <h2
            className="break-words font-display font-extrabold uppercase leading-[0.95] tracking-tight"
            style={{ color: color || '#151529', fontSize: Math.round(width * 0.16) }}
          >
            {text || 'Title'}
          </h2>
        </div>
      );
    }

    case 'link': {
      const c = item.content as MoodboardLinkContent;
      let host = c.siteName || '';
      try {
        host = c.siteName || new URL(c.url).hostname.replace(/^www\./, '');
      } catch {
        /* keep siteName */
      }
      return (
        <a
          href={c.url}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
          className="block overflow-hidden rounded-2xl bg-white shadow-[0_10px_28px_-8px_rgba(20,20,50,0.35)] ring-1 ring-black/[0.06] transition-transform hover:-translate-y-0.5"
          style={{ width }}
        >
          {c.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.imageUrl}
              alt=""
              draggable={false}
              className="block h-32 w-full object-cover"
            />
          )}
          <div className="px-3.5 py-2.5">
            <div className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
              {c.title}
            </div>
            {c.description && (
              <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-ink-muted">
                {c.description}
              </div>
            )}
            <div className="mt-1.5 truncate font-mono text-2xs uppercase tracking-wide text-ink-subtle">
              {host}
            </div>
          </div>
        </a>
      );
    }

    default:
      return null;
  }
}
