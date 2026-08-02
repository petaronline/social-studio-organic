'use client';

/**
 * Public moodboard — a shared board, read-only, for anyone with the link.
 *
 * Deliberately outside the (authed) layout: no sidebar, no brand picker, no
 * add controls. Just the board, a view toggle, and export. The share token in
 * the URL is the grant; the board fetch and image bytes are served through the
 * public, token-scoped endpoints (no auth cookie required).
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { LayoutGrid, Shuffle, Download, ImageIcon, FileText, Loader2 } from 'lucide-react';
import { organicMoodboard, type SharedMoodboard } from '@/lib/api';
import { ReadOnlyBoard } from '@/components/moodboard/ReadOnlyBoard';
import type { MoodboardView } from '@/components/moodboard/MoodboardCanvas';
import { exportBoardPng, exportBoardPdf } from '@/components/moodboard/exportBoard';

export default function SharePage() {
  const params = useParams();
  const token = String((params?.token as string) ?? '');

  const [board, setBoard] = useState<SharedMoodboard | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [view, setView] = useState<MoodboardView>('messy');
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const boardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token) return;
    organicMoodboard
      .getSharedBoard(token)
      .then((r) => {
        setBoard(r.board);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [token]);

  async function runExport(fmt: 'png' | 'pdf') {
    setExportOpen(false);
    if (!boardRef.current || !board) return;
    setExporting(true);
    try {
      const name = `${board.brand.name}-moodboard`;
      if (fmt === 'png') await exportBoardPng(boardRef.current, name);
      else await exportBoardPdf(boardRef.current, name);
    } catch {
      alert('Export failed — an external image on this board blocked it. Try again or remove that image.');
    } finally {
      setExporting(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FBFBFD] text-sm text-ink-subtle">
        <Loader2 size={18} className="mr-2 animate-spin" /> Loading board…
      </div>
    );
  }

  if (status === 'error' || !board) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FBFBFD] p-6">
        <div className="max-w-sm rounded-2xl bg-white px-8 py-10 text-center shadow-lift ring-1 ring-line">
          <h1 className="font-display text-lg font-extrabold text-ink">Board not available</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            This moodboard isn&apos;t shared, or the link has been revoked.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#FBFBFD]">
      <header className="flex shrink-0 items-center justify-between border-b border-line bg-white px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-2xs font-bold text-white"
            style={{ backgroundColor: board.brand.color }}
          >
            {board.brand.name.charAt(0).toUpperCase()}
          </span>
          <span className="truncate font-display text-base font-extrabold text-ink">
            {board.brand.name}
          </span>
          <span className="hidden text-xs text-ink-subtle sm:inline">· Moodboard</span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setView((v) => (v === 'messy' ? 'pinterest' : 'messy'))}
            title={view === 'messy' ? 'Tidy view' : 'Messy view'}
            aria-label={view === 'messy' ? 'Tidy view' : 'Messy view'}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted ring-1 ring-line transition-colors hover:bg-surface-alt hover:text-ink"
          >
            {view === 'messy' ? <LayoutGrid size={17} /> : <Shuffle size={17} />}
          </button>

          <div className="relative">
            <button
              onClick={() => setExportOpen((v) => !v)}
              disabled={exporting}
              className="btn-primary btn-sm"
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Export
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-20 mt-1.5 w-40 overflow-hidden rounded-xl bg-white p-1 shadow-lift ring-1 ring-line">
                <button
                  onClick={() => runExport('png')}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-alt"
                >
                  <ImageIcon size={15} className="text-ink-subtle" /> PNG image
                </button>
                <button
                  onClick={() => runExport('pdf')}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-alt"
                >
                  <FileText size={15} className="text-ink-subtle" /> PDF document
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mb-checker min-h-0 flex-1" onClick={() => exportOpen && setExportOpen(false)}>
        {board.items.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="font-hand text-2xl text-ink-subtle">an empty wall</p>
          </div>
        ) : (
          <ReadOnlyBoard ref={boardRef} items={board.items} view={view} shareToken={token} />
        )}
      </main>

      <footer className="shrink-0 border-t border-line bg-white px-5 py-2 text-center">
        <span className="font-mono text-2xs uppercase tracking-wide text-ink-subtle">
          Made with The Social Studio
        </span>
      </footer>
    </div>
  );
}
