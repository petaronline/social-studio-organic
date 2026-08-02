'use client';

/**
 * Moodboard state for one brand: load, optimistic mutations, and the
 * paste/upload plumbing that turns clipboard contents into items.
 *
 * Positions (x, y) are stored as fractions 0..1 of the stage so a board
 * arranged on a wide screen still reads on a narrow one. Rotation is in
 * degrees. New items land near the centre with a small random tilt and a
 * cascade offset so they don't stack exactly on top of each other.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  organicMoodboard,
  uploads,
  type MoodboardItem,
  type MoodboardKind,
  type CreateMoodboardItemInput,
} from '@/lib/api';

export const NOTE_COLORS = ['#FFF3B0', '#FFD6E0', '#CDEFff', '#D7F5D0', '#E7D8FF'];

function looksLikeImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i.test(url);
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\/\S+$/i.test(s.trim());
}

/** Pull the first <img src> out of a clipboard text/html payload — this is
 *  what "Copy image" on a web page actually puts on the clipboard. */
function firstImgSrc(html: string): string | null {
  const m = html.match(/<img[^>]+\bsrc=["']([^"']+)["']/i);
  if (!m) return null;
  return m[1]
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Turn a base64 data: image URL into a File so it can be uploaded. Returns
 *  null for anything that isn't a base64 image data URL. */
function dataUrlToFile(dataUrl: string): File | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(dataUrl);
  if (!m) return null;
  try {
    const mime = m[1];
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = (mime.split('/')[1] || 'png').replace('+xml', '');
    return new File([bytes], `pasted.${ext}`, { type: mime });
  } catch {
    return null;
  }
}

export interface UseMoodboard {
  items: MoodboardItem[];
  limit: number;
  loading: boolean;
  error: string | null;
  full: boolean;
  busy: boolean;
  /** transient toast-ish message (e.g. "Board is full"). */
  notice: string | null;
  clearNotice: () => void;
  reload: () => void;
  addImageFromFile: (file: File) => Promise<void>;
  addImageFromUrl: (url: string) => Promise<void>;
  addSwatch: (color: string) => Promise<void>;
  addNote: (text: string, color?: string) => Promise<void>;
  addText: (text: string, color?: string) => Promise<void>;
  addLink: (url: string) => Promise<void>;
  handlePaste: (e: ClipboardEvent) => void;
  updateNoteText: (id: string, text: string) => Promise<void>;
  moveItem: (id: string, x: number, y: number, rotation?: number) => void;
  commitMove: (id: string, x: number, y: number, rotation?: number) => Promise<void>;
  bringToFront: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useMoodboard(brandId: string | null): UseMoodboard {
  const [items, setItems] = useState<MoodboardItem[]>([]);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Cascade counter so successive adds fan out instead of stacking.
  const cascade = useRef(0);

  const reload = useCallback(() => {
    if (!brandId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    organicMoodboard
      .list(brandId)
      .then((r) => {
        setItems(r.items);
        setLimit(r.limit);
      })
      .catch((e) => setError(e?.message ?? 'Failed to load moodboard'))
      .finally(() => setLoading(false));
  }, [brandId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const full = items.length >= limit;

  const nextPlacement = useCallback(() => {
    const step = cascade.current++;
    // A loose spiral around the centre, kept inside the safe 0.15..0.85 band.
    const angle = step * 2.399; // golden angle, radians
    const radius = 0.06 + step * 0.012;
    const x = Math.min(0.82, Math.max(0.16, 0.44 + Math.cos(angle) * radius));
    const y = Math.min(0.82, Math.max(0.16, 0.42 + Math.sin(angle) * radius));
    const rotation = (Math.random() - 0.5) * 12; // -6..6 deg
    return { x, y, rotation };
  }, []);

  const create = useCallback(
    async (
      kind: MoodboardKind,
      content: CreateMoodboardItemInput['content']
    ): Promise<void> => {
      if (!brandId) return;
      if (items.length >= limit) {
        setNotice(`Board is full — up to ${limit} items per brand.`);
        return;
      }
      const place = nextPlacement();
      setBusy(true);
      try {
        const { item } = await organicMoodboard.create({
          brandId,
          kind,
          content,
          x: place.x,
          y: place.y,
          rotation: place.rotation,
        });
        setItems((prev) => [...prev, item]);
      } catch (e) {
        const msg = (e as Error)?.message ?? 'Could not add that';
        setNotice(msg);
      } finally {
        setBusy(false);
      }
    },
    [brandId, items.length, limit, nextPlacement]
  );

  const addImageFromFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setNotice('That file is not an image.');
        return;
      }
      setBusy(true);
      try {
        const { upload } = await uploads.upload(file);
        await create('image', {
          uploadId: upload.id,
          naturalWidth: upload.widthPx ?? undefined,
          naturalHeight: upload.heightPx ?? undefined,
        });
      } catch (e) {
        setNotice((e as Error)?.message ?? 'Upload failed');
      } finally {
        setBusy(false);
      }
    },
    [create]
  );

  const addImageFromUrl = useCallback(
    async (url: string) => {
      // Pull the bytes server-side first so the image displays even when the
      // source blocks hotlinking (the common case for images copied off a web
      // page). Fall back to referencing the URL directly if the fetch fails.
      setBusy(true);
      try {
        const { upload } = await organicMoodboard.fetchImage(url);
        await create('image', {
          uploadId: upload.id,
          naturalWidth: upload.widthPx ?? undefined,
          naturalHeight: upload.heightPx ?? undefined,
        });
      } catch {
        await create('image', { url });
      } finally {
        setBusy(false);
      }
    },
    [create]
  );

  const addSwatch = useCallback(
    (color: string) => create('swatch', { color }),
    [create]
  );

  const addNote = useCallback(
    (text: string, color?: string) => create('note', { text, color }),
    [create]
  );

  const addText = useCallback(
    (text: string, color?: string) => create('text', { text, color }),
    [create]
  );

  const addLink = useCallback(
    async (url: string) => {
      if (!brandId || items.length >= limit) {
        if (items.length >= limit) setNotice(`Board is full — up to ${limit} items per brand.`);
        return;
      }
      setBusy(true);
      try {
        const { meta } = await organicMoodboard.unfurl(url);
        await create('link', {
          url: meta.url,
          title: meta.title,
          description: meta.description,
          imageUrl: meta.imageUrl,
          siteName: meta.siteName,
        });
      } catch (e) {
        setNotice((e as Error)?.message ?? 'Could not fetch that link');
      } finally {
        setBusy(false);
      }
    },
    [brandId, create, items.length, limit]
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const dt = e.clipboardData;
      if (!dt) return;

      // 1) Real image blobs (screenshots, or a "Copy image" that yields the
      //    actual bitmap). Read both files and items — browsers disagree on
      //    which one carries the blob.
      const imageFiles: File[] = [];
      for (const f of Array.from(dt.files ?? [])) {
        if (f.type.startsWith('image/')) imageFiles.push(f);
      }
      if (!imageFiles.length) {
        for (const item of Array.from(dt.items ?? [])) {
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const f = item.getAsFile();
            if (f) imageFiles.push(f);
          }
        }
      }
      if (imageFiles.length) {
        e.preventDefault();
        imageFiles.forEach((f) => void addImageFromFile(f));
        return;
      }

      // 2) HTML payload — "Copy image" on a web page lands here as an <img>,
      //    with no file blob and no plain-text URL. Extract the source: a
      //    data: bitmap gets uploaded, an http(s) src becomes an image card.
      const html = dt.getData('text/html');
      if (html) {
        const src = firstImgSrc(html);
        if (src) {
          if (src.startsWith('data:image/')) {
            const file = dataUrlToFile(src);
            if (file) {
              e.preventDefault();
              void addImageFromFile(file);
              return;
            }
          } else if (isHttpUrl(src)) {
            e.preventDefault();
            void addImageFromUrl(src);
            return;
          }
        }
      }

      // 3) A URL in plain text → direct image, or a link to unfurl.
      const text = dt.getData('text/plain')?.trim();
      if (text && isHttpUrl(text)) {
        e.preventDefault();
        if (looksLikeImageUrl(text)) void addImageFromUrl(text);
        else void addLink(text);
      }
      // Plain non-URL text is ignored — notes are added deliberately, not by
      // accidental paste.
    },
    [addImageFromFile, addImageFromUrl, addLink]
  );

  const updateNoteText = useCallback(
    async (id: string, text: string) => {
      const current = items.find((i) => i.id === id);
      if (!current || (current.kind !== 'note' && current.kind !== 'text')) return;
      const content = { ...(current.content as { color?: string }), text };
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, content: content as MoodboardItem['content'] } : i))
      );
      try {
        await organicMoodboard.update(id, { content });
      } catch {
        /* keep optimistic value; a reload will reconcile */
      }
    },
    [items]
  );

  // Local-only move (during drag) — no network.
  const moveItem = useCallback((id: string, x: number, y: number, rotation?: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, x, y, rotation: rotation ?? i.rotation } : i
      )
    );
  }, []);

  // Persist a move (on drop).
  const commitMove = useCallback(
    async (id: string, x: number, y: number, rotation?: number) => {
      try {
        await organicMoodboard.update(id, { x, y, rotation });
      } catch {
        /* non-fatal; position will reconcile on next load */
      }
    },
    []
  );

  const bringToFront = useCallback(
    async (id: string) => {
      const maxZ = items.reduce((m, i) => Math.max(m, i.zIndex), 0);
      const target = items.find((i) => i.id === id);
      if (!target || target.zIndex === maxZ) return;
      const nextZ = maxZ + 1;
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, zIndex: nextZ } : i)));
      try {
        await organicMoodboard.update(id, { zIndex: nextZ });
      } catch {
        /* ignore */
      }
    },
    [items]
  );

  const remove = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await organicMoodboard.delete(id);
    } catch {
      /* if it fails, a reload restores it */
    }
  }, []);

  return {
    items,
    limit,
    loading,
    error,
    full,
    busy,
    notice,
    clearNotice: () => setNotice(null),
    reload,
    addImageFromFile,
    addImageFromUrl,
    addSwatch,
    addNote,
    addText,
    addLink,
    handlePaste,
    updateNoteText,
    moveItem,
    commitMove,
    bringToFront,
    remove,
  };
}
