'use client';

/**
 * Studio dashboard box: the five most relevant tasks across ALL brands
 * (open first, newest first), each with its brand mark at the row end. Ticking
 * and deleting work right here; the full per-brand lists live on /organic/tasks.
 *
 * Self-contained (fetches its own data) so it doesn't couple to the studio
 * page's brand-scoped dashboard load — this box is deliberately cross-brand.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { organicTasks, type TaskWithBrand } from '@/lib/api';
import { TaskRow, BrandMark } from './TaskRow';

export function TasksPanel() {
  const [tasks, setTasks] = useState<TaskWithBrand[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    organicTasks
      .recent(5)
      .then((r) => setTasks(r.tasks))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  async function toggle(id: string, next: boolean) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: next } : t)));
    try {
      await organicTasks.update(id, { done: next });
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

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="lab">Tasks</h2>
        <Link href="/organic/tasks" className="lab hover:text-ink">
          All tasks →
        </Link>
      </div>

      {loading ? (
        <p className="py-2 text-sm text-ink-subtle">Loading…</p>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-alt text-ink-subtle">
            <ListChecks size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">No tasks yet</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Add to-dos per brand — the most pressing five show here.
            </p>
          </div>
          <Link href="/organic/tasks" className="btn-secondary btn-sm">
            Open Tasks
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              title={t.title}
              done={t.done}
              onToggle={(n) => toggle(t.id, n)}
              onDelete={() => remove(t.id)}
              brandMark={<BrandMark name={t.brandName} color={t.brandColor} />}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
