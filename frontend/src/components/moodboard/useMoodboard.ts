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
    (url: string) => create('image', { url }),
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

      // 1) Image blobs (screenshots, copied images) → upload each.
      const imageFiles: File[] = [];
      for (const item of Array.from(dt.items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) imageFiles.push(f);
        }
      }
      if (imageFiles.length) {
        e.preventDefault();
        imageFiles.forEach((f) => void addImageFromFile(f));
        return;
      }

      // 2) A URL in the clipboard → direct image, or a link to unfurl.
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
      if (!current || current.kind !== 'note') return;
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
    addLink,
    handlePaste,
    updateNoteText,
    moveItem,
    commitMove,
    bringToFront,
    remove,
  };
}
