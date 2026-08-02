'use client';

/**
 * Top-right actions on the owner's board: Share and Export.
 *
 * Share manages the brand's public token — create (publish), copy the link,
 * or revoke (the link dies). Export snapshots the current board to PNG or PDF
 * via the shared boardRef.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Share2,
  Copy,
  Check,
  Download,
  Image as ImageIcon,
  FileText,
  Loader2,
  Link2,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { organicMoodboard } from '@/lib/api';
import { exportBoardPng, exportBoardPdf } from './exportBoard';

export function MoodboardTopActions({
  brandId,
  brandName,
  boardRef,
}: {
  brandId: string;
  brandName: string;
  boardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Load current share status for this brand.
  useEffect(() => {
    setToken(null);
    organicMoodboard.getShare(brandId).then((r) => setToken(r.token)).catch(() => {});
  }, [brandId]);

  // Close popovers on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setShareOpen(false);
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const shareUrl = token ? `${window.location.origin}/share/${token}` : '';

  async function createLink() {
    setBusy(true);
    try {
      const r = await organicMoodboard.createShare(brandId);
      setToken(r.token);
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await organicMoodboard.revokeShare(brandId);
      setToken(null);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — user can select the field manually */
    }
  }

  async function runExport(fmt: 'png' | 'pdf') {
    setExportOpen(false);
    if (!boardRef.current) return;
    setExporting(true);
    try {
      const name = `${brandName}-moodboard`;
      if (fmt === 'png') await exportBoardPng(boardRef.current, name);
      else await exportBoardPdf(boardRef.current, name);
    } catch {
      alert('Export failed — an external image on this board blocked it. Try again or remove that image.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div ref={rootRef} className="absolute right-6 top-6 z-40 flex items-center gap-2">
      {/* Export */}
      <div className="relative">
        <button
          onClick={() => { setExportOpen((v) => !v); setShareOpen(false); }}
          disabled={exporting}
          className="flex items-center gap-2 rounded-full bg-surface/95 py-2 pl-3 pr-3.5 text-sm font-medium text-ink shadow-lift ring-1 ring-line backdrop-blur transition-colors hover:bg-surface-alt"
        >
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} className="text-ink-subtle" />}
          Export
        </button>
        {exportOpen && (
          <div className="absolute right-0 top-full z-20 mt-1.5 w-40 overflow-hidden rounded-xl bg-white p-1 shadow-lift ring-1 ring-line">
            <MenuRow icon={ImageIcon} label="PNG image" onClick={() => runExport('png')} />
            <MenuRow icon={FileText} label="PDF document" onClick={() => runExport('pdf')} />
          </div>
        )}
      </div>

      {/* Share */}
      <div className="relative">
        <button
          onClick={() => { setShareOpen((v) => !v); setExportOpen(false); }}
          className={[
            'flex items-center gap-2 rounded-full py-2 pl-3 pr-3.5 text-sm font-semibold shadow-lift ring-1 transition-colors',
            token
              ? 'bg-cherry text-white ring-transparent hover:bg-cherry-hover'
              : 'bg-surface/95 text-ink ring-line backdrop-blur hover:bg-surface-alt',
          ].join(' ')}
        >
          <Share2 size={15} className={token ? 'text-white' : 'text-ink-subtle'} />
          {token ? 'Shared' : 'Share'}
        </button>

        {shareOpen && (
          <div className="absolute right-0 top-full z-20 mt-1.5 w-80 rounded-2xl bg-white p-4 shadow-lift ring-1 ring-line">
            <div className="flex items-center gap-2">
              <Link2 size={16} className="text-ink-subtle" />
              <h3 className="text-sm font-bold text-ink">Share this board</h3>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Anyone with the link can view this board — read-only, no sign-in.
            </p>

            {token ? (
              <>
                <div className="mt-3 flex items-center gap-1.5">
                  <input
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-lg bg-surface-alt px-2.5 py-2 font-mono text-xs text-ink outline-none"
                  />
                  <button onClick={copy} className="btn-primary btn-sm shrink-0">
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <button
                  onClick={revoke}
                  disabled={busy}
                  className="mt-3 flex items-center gap-1.5 text-xs font-medium text-danger transition-opacity hover:opacity-80 disabled:opacity-50"
                >
                  <Trash2 size={13} /> Revoke link
                </button>
              </>
            ) : (
              <button onClick={createLink} disabled={busy} className="btn-primary btn-sm mt-3 w-full justify-center">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                Create share link
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MenuRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-alt"
    >
      <Icon size={15} className="text-ink-subtle" />
      {label}
    </button>
  );
}
