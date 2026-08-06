'use client';

/**
 * Notes — per-brand notes & meeting notes (Superlist-style).
 *
 * Master–detail: a list of notes on the left, the rich editor on the right.
 * Edits autosave (debounced). Two kinds: a plain note, and a meeting note
 * which adds a date + attendees header and opens on a light agenda template.
 *
 * Per brand, brand-gated like Tasks/Moodboard.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NotebookPen, Plus, CalendarClock, Trash2, Pin, Users, Check, Loader2 } from 'lucide-react';
import {
  organicNotes,
  brands as brandsApi,
  type Note,
  type NoteType,
  type UpdateNoteInput,
  type Brand,
} from '@/lib/api';
import { getActiveBrandId, VASS_ACTIVE_SCOPE_EVENT } from '@/components/BrandSelector';
import { NoteEditor, noteSnippet } from '@/components/notes/NoteEditor';
import { Squiggles } from '@/components/Squiggles';

const MEETING_TEMPLATE =
  '<h2>Agenda</h2><p></p><h2>Discussion</h2><p></p><h2>Action items</h2>' +
  '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p></p></div></li></ul>';

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const s = Math.max(0, (Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** ISO → value for <input type="datetime-local"> in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export default function NotesPage() {
  const [brandId, setBrandId] = useState<string | 'all'>('all');
  useEffect(() => {
    setBrandId(getActiveBrandId());
    const onChange = () => setBrandId(getActiveBrandId());
    window.addEventListener(VASS_ACTIVE_SCOPE_EVENT, onChange);
    return () => window.removeEventListener(VASS_ACTIVE_SCOPE_EVENT, onChange);
  }, []);
  const activeBrandId = brandId === 'all' ? null : brandId;

  const [brandList, setBrandList] = useState<Brand[]>([]);
  useEffect(() => {
    brandsApi.list().then((r) => setBrandList(r.brands)).catch(() => {});
  }, []);
  const brand = useMemo(() => brandList.find((b) => b.id === activeBrandId) ?? null, [brandList, activeBrandId]);

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const load = useCallback(() => {
    if (!activeBrandId) { setNotes([]); setLoading(false); return; }
    setLoading(true);
    organicNotes
      .list(activeBrandId)
      .then((r) => {
        setNotes(r.notes);
        setSelectedId((cur) => cur ?? r.notes[0]?.id ?? null);
      })
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, [activeBrandId]);
  useEffect(() => { setSelectedId(null); load(); }, [load]);

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  // ── Autosave ────────────────────────────────────────────────────
  const pending = useRef<Record<string, UpdateNoteInput>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const batch = pending.current;
    pending.current = {};
    const ids = Object.keys(batch);
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => organicNotes.update(id, batch[id])));
      setStatus('saved');
      setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 1500);
    } catch {
      setStatus('idle');
    }
  }, []);

  const patch = useCallback((id: string, part: UpdateNoteInput) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...part } as Note : n)));
    pending.current[id] = { ...pending.current[id], ...part };
    setStatus('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  }, [flush]);

  async function create(type: NoteType) {
    if (!activeBrandId) return;
    const input = {
      brandId: activeBrandId,
      type,
      title: '',
      body: type === 'meeting' ? MEETING_TEMPLATE : '',
      meetingAt: type === 'meeting' ? new Date().toISOString() : null,
    };
    const { note } = await organicNotes.create(input);
    setNotes((prev) => [note, ...prev]);
    setSelectedId(note.id);
  }

  async function remove(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) setSelectedId(null);
    delete pending.current[id];
    try { await organicNotes.delete(id); } catch { load(); }
  }

  const shell =
    '-m-7 flex h-[calc(100vh-5rem)] overflow-hidden sm:h-[calc(100vh-6rem)]';

  if (!activeBrandId) {
    return (
      <div className={`${shell} items-center justify-center bg-surface`}>
        <div className="max-w-sm rounded-2xl bg-surface px-8 py-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-platform-fb text-platform-fb-ink">
            <NotebookPen size={22} />
          </div>
          <h2 className="font-display text-lg font-extrabold text-ink">Pick a brand to open its notes</h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            Notes and meeting notes live per brand. Choose one in the picker on the left.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      {/* List pane */}
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-extrabold text-ink">Notes</h1>
            <p className="truncate text-xs text-ink-subtle">{brand?.name}</p>
          </div>
        </div>
        <div className="flex gap-1.5 px-4 pb-3">
          <button onClick={() => create('note')} className="btn-primary btn-sm flex-1 justify-center">
            <Plus size={14} /> Note
          </button>
          <button onClick={() => create('meeting')} className="btn-secondary btn-sm flex-1 justify-center">
            <CalendarClock size={14} /> Meeting
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {loading ? (
            <p className="px-2 py-6 text-center text-sm text-ink-subtle">Loading…</p>
          ) : notes.length === 0 ? (
            <div className="px-1 py-4">
              <Squiggles rows={3} className="opacity-80" onRowClick={() => create('note')} />
              <p className="mt-1 text-center text-xs text-ink-subtle">Click a line to start a note.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {notes.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => setSelectedId(n.id)}
                    className={[
                      'w-full rounded-lg px-3 py-2.5 text-left transition-colors',
                      n.id === selectedId ? 'bg-surface-alt' : 'hover:bg-surface-alt/60',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-1.5">
                      {n.type === 'meeting' && <CalendarClock size={12} className="shrink-0 text-ink-subtle" />}
                      {n.pinned && <Pin size={11} className="shrink-0 text-cherry" />}
                      <span className="truncate text-sm font-semibold text-ink">{n.title || 'Untitled'}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-ink-muted">{noteSnippet(n.body, 60) || 'Empty note'}</div>
                    <div className="mt-1 font-mono text-2xs uppercase tracking-wide text-ink-subtle">{timeAgo(n.updatedAt)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Editor pane */}
      <section className="min-w-0 flex-1 overflow-y-auto bg-surface">
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-ink-subtle">
            <Squiggles rows={4} className="opacity-70" onRowClick={() => create('note')} />
            Select a note, or create one.
          </div>
        ) : (
          <div className="mx-auto max-w-2xl px-8 py-6">
            {/* Header row */}
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="lab">{selected.type === 'meeting' ? 'Meeting note' : 'Note'}</span>
                <span className="flex items-center gap-1 text-2xs text-ink-subtle">
                  {status === 'saving' ? (<><Loader2 size={11} className="animate-spin" /> Saving…</>) : status === 'saved' ? (<><Check size={11} /> Saved</>) : null}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => patch(selected.id, { pinned: !selected.pinned })}
                  title={selected.pinned ? 'Unpin' : 'Pin'}
                  className={['rounded-lg p-1.5 transition-colors hover:bg-surface-alt', selected.pinned ? 'text-cherry' : 'text-ink-subtle'].join(' ')}
                >
                  <Pin size={15} />
                </button>
                <button onClick={() => remove(selected.id)} title="Delete note" className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-surface-alt hover:text-danger">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {/* Title */}
            <input
              value={selected.title}
              onChange={(e) => patch(selected.id, { title: e.target.value })}
              placeholder={selected.type === 'meeting' ? 'Meeting title' : 'Untitled'}
              className="w-full bg-transparent font-display text-3xl font-extrabold tracking-tight text-ink outline-none placeholder:text-ink-subtle"
            />

            {/* Meeting header */}
            {selected.type === 'meeting' && (
              <div className="mt-3 flex flex-wrap items-center gap-4 border-b border-line pb-4 text-sm">
                <label className="flex items-center gap-2 text-ink-muted">
                  <CalendarClock size={15} className="text-ink-subtle" />
                  <input
                    type="datetime-local"
                    value={toLocalInput(selected.meetingAt)}
                    onChange={(e) => patch(selected.id, { meetingAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    className="bg-transparent text-ink outline-none"
                  />
                </label>
                <label className="flex min-w-0 flex-1 items-center gap-2 text-ink-muted">
                  <Users size={15} className="shrink-0 text-ink-subtle" />
                  <input
                    value={selected.attendees ?? ''}
                    onChange={(e) => patch(selected.id, { attendees: e.target.value })}
                    placeholder="Attendees"
                    className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-subtle"
                  />
                </label>
              </div>
            )}

            {/* Body */}
            <div className="mt-4">
              <NoteEditor
                key={selected.id}
                value={selected.body}
                placeholder={selected.type === 'meeting' ? 'Agenda, discussion, action items…' : 'Start writing…'}
                onChange={(html) => patch(selected.id, { body: html })}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
