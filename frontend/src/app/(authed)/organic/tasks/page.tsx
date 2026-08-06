'use client';

/**
 * Tasks — a per-brand to-do list (Reminders / Superlist style).
 *
 * Per brand: the list belongs to whichever brand is in scope. With "All
 * brands" there's no single list to show, so we prompt to pick one — the
 * cross-brand view lives in the Studio dashboard box instead.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ListChecks, Plus, CalendarClock, Tag } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { organicTasks, brands as brandsApi, type Task, type Brand, type TaskExtras } from '@/lib/api';
import { getActiveBrandId, VASS_ACTIVE_SCOPE_EVENT } from '@/components/BrandSelector';
import { TaskRow, EmptyTaskSquiggles } from '@/components/tasks/TaskRow';

export default function TasksPage() {
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
  const brand = useMemo(
    () => brandList.find((b) => b.id === activeBrandId) ?? null,
    [brandList, activeBrandId]
  );

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [draftDue, setDraftDue] = useState('');
  const [draftTag, setDraftTag] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!activeBrandId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    organicTasks
      .list(activeBrandId)
      .then((r) => setTasks(r.tasks))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [activeBrandId]);
  useEffect(() => load(), [load]);

  async function add() {
    const title = draft.trim();
    if (!title || !activeBrandId) return;
    setBusy(true);
    try {
      const { task } = await organicTasks.create(activeBrandId, title, {
        dueDate: draftDue || null,
        tag: draftTag.trim() || null,
      });
      setTasks((prev) => [...prev.filter((t) => !t.done), task, ...prev.filter((t) => t.done)]);
      setDraft('');
      setDraftDue('');
      setDraftTag('');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, next: boolean) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: next } : t)));
    try {
      await organicTasks.update(id, { done: next });
    } catch {
      load();
    }
  }

  async function edit(id: string, patch: TaskExtras) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    try {
      await organicTasks.update(id, patch);
    } catch {
      load();
    }
  }

  async function remove(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await organicTasks.delete(id);
    } catch {
      load();
    }
  }

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  if (!activeBrandId) {
    return (
      <div>
        <PageHeader icon={ListChecks} title="Tasks" description="A to-do list for each brand." />
        <div className="card px-6 py-16 text-center">
          <p className="text-sm font-semibold text-ink">Pick a brand to open its task list</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted">
            Tasks live per brand. Choose one in the picker on the left — the
            cross-brand overview is on your Studio dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        icon={ListChecks}
        title="Tasks"
        description={brand ? `${brand.name} · to-do list` : 'To-do list'}
      />

      {/* Add box */}
      <div className="card mb-4 p-2">
        <div className="flex items-center gap-2">
          <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 border-line-strong text-ink-subtle">
            <Plus size={12} strokeWidth={3} />
          </div>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Add a task…"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
          />
          {draft.trim() && (
            <button onClick={add} disabled={busy} className="btn-primary btn-sm">
              Add
            </button>
          )}
        </div>

        {/* Optional due date + tag — revealed once you start typing. */}
        {draft.trim() && (
          <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
            <label className="flex items-center gap-1.5 rounded-lg bg-surface-alt px-2 py-1 text-xs text-ink-muted">
              <CalendarClock size={13} className="text-ink-subtle" />
              <input
                type="date"
                value={draftDue}
                onChange={(e) => setDraftDue(e.target.value)}
                className="bg-transparent text-xs text-ink outline-none"
              />
            </label>
            <label className="flex items-center gap-1.5 rounded-lg bg-surface-alt px-2 py-1 text-xs text-ink-muted">
              <Tag size={13} className="text-ink-subtle" />
              <input
                value={draftTag}
                onChange={(e) => setDraftTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add()}
                placeholder="tag"
                maxLength={40}
                className="w-24 bg-transparent text-xs text-ink outline-none placeholder:text-ink-subtle"
              />
            </label>
          </div>
        )}
      </div>

      {loading ? (
        <div className="card px-6 py-12 text-center text-sm text-ink-subtle">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="card p-2">
          <EmptyTaskSquiggles />
          <p className="pb-2 pt-1 text-center text-xs text-ink-subtle">Add your first task above.</p>
        </div>
      ) : (
        <div className="card p-2">
          <ul className="flex flex-col">
            {open.map((t) => (
              <TaskRow
                key={t.id}
                title={t.title}
                done={t.done}
                dueDate={t.dueDate}
                tag={t.tag}
                onToggle={(n) => toggle(t.id, n)}
                onDelete={() => remove(t.id)}
                onSetDue={(d) => edit(t.id, { dueDate: d })}
                onSetTag={(tg) => edit(t.id, { tag: tg })}
              />
            ))}
          </ul>

          {done.length > 0 && (
            <>
              <div className="lab px-2 pb-1 pt-3">Done · {done.length}</div>
              <ul className="flex flex-col">
                {done.map((t) => (
                  <TaskRow
                    key={t.id}
                    title={t.title}
                    done={t.done}
                    dueDate={t.dueDate}
                    tag={t.tag}
                    onToggle={(n) => toggle(t.id, n)}
                    onDelete={() => remove(t.id)}
                    onSetDue={(d) => edit(t.id, { dueDate: d })}
                    onSetTag={(tg) => edit(t.id, { tag: tg })}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
