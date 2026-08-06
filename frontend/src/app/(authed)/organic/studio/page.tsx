'use client';

/**
 * Organic / Studio — landing page (Patch 4.37.3 rebuild).
 *
 * Greeting at the top, then three cards: Today's Publishing stat card +
 * Create a post action + Drop an idea action. Recent posts section was
 * removed for this iteration (will return elsewhere later).
 *
 * Stats: a single hit to /organic/calendar with a today-only window,
 * scoped to the active brand (or all if "All brands" is selected).
 * Counts only Vass-tracked posts (source='vass'), since synced-from-Meta
 * rows aren't ours to claim credit for.
 *
 * "Drop an idea" opens the IdeaEditorModal directly so the user can
 * brain-dump without leaving the page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Lightbulb, Sprout } from 'lucide-react';
import { PageHeader, PAGE_TINTS } from '@/components/PageHeader';
import {
  auth,
  organicAccounts,
  organicCalendar,
  organicDrafts,
  organicIdeas,
  type CalendarPost,
  type CurrentUser,
  type OrganicAccount,
} from '@/lib/api';
import { buildDashboard, mondayOf, type DashboardModel } from '@/components/studio/DashboardData';
import {
  AttentionPanel,
  CadencePanel,
  NextUpPanel,
} from '@/components/studio/DashboardPanels';
import { NotableDatesPanel } from '@/components/studio/NotableDates';
import { TasksPanel } from '@/components/tasks/TasksPanel';
import { NewsPanel } from '@/components/studio/NewsPanel';
import {
  getActiveBrandId,
  getActiveScope,
  getActiveAccountIds,
  VASS_ACTIVE_SCOPE_EVENT,
  type ActiveScope,
} from '@/components/BrandSelector';
import { ComposerModal } from '@/components/studio/ComposerModal';
import { IdeaEditorModal } from '@/components/studio/IdeaEditorModal';

export default function StudioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ─── User ────────────────────────────────────────────────────────
  const [user, setUser] = useState<CurrentUser | null>(null);
  useEffect(() => {
    auth.me().then((r) => setUser(r.user)).catch(() => { /* silent */ });
  }, []);

  // ─── Active scope sync (Patch 4.37.5: multi-scope) ──────────────
  const [scope, setScope] = useState<ActiveScope>({ type: 'all' });
  const [activeBrandId, setActiveBrandId] = useState<string>('all');
  useEffect(() => {
    setScope(getActiveScope());
    setActiveBrandId(getActiveBrandId());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail === 'object' && 'type' in detail) {
        setScope(detail as ActiveScope);
        setActiveBrandId(getActiveBrandId());
      }
    };
    window.addEventListener(VASS_ACTIVE_SCOPE_EVENT, onChange);
    return () => window.removeEventListener(VASS_ACTIVE_SCOPE_EVENT, onChange);
  }, []);

  // ─── Dashboard data ─────────────────────────────────────────────
  // One window covers everything on this page: last 7 days for failures and
  // this week's published count, next 14 for what's coming. Always scoped to
  // the accounts currently in scope, so every figure answers "for this
  // brand" — never "across everything you happen to have connected".
  //
  // Nothing here reads analytics. Insights are unreliable at the moment and
  // a dashboard stating wrong engagement numbers confidently is worse than
  // one that stays quiet about them.
  const [loading, setLoading] = useState(true);
  const [dash, setDash] = useState<DashboardModel | null>(null);
  const [accounts, setAccounts] = useState<OrganicAccount[]>([]);

  const accountNames = useMemo(() => {
    const out: Record<string, string> = {};
    for (const a of accounts) {
      out[a.id] = a.meta?.name || a.meta?.username || a.externalId;
    }
    return out;
  }, [accounts]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - 7);
      const to = new Date(now);
      to.setDate(to.getDate() + 14);

      const ids = getActiveAccountIds();

      const [calendar, accountsRes, draftsRes, ideasRes] = await Promise.all([
        organicCalendar.get({
          from: from.toISOString(),
          to: to.toISOString(),
          brandId: null,
          accountIds: ids ?? undefined,
          statuses: ['scheduled', 'published'],
        }),
        organicAccounts.list(),
        organicDrafts.list(null, ids ?? undefined).catch(() => ({ posts: [] as unknown[] })),
        organicIdeas.list(ids ? { accountIds: ids } : {}).catch(() => ({ ideas: [] as unknown[] })),
      ]);

      // Token warnings should only cover profiles in scope, or a quiet
      // brand inherits another brand's expiring connection.
      const scoped = ids
        ? accountsRes.accounts.filter((a) => ids.includes(a.id))
        : accountsRes.accounts;
      setAccounts(scoped);

      setDash(
        buildDashboard({
          posts: calendar.posts,
          accounts: scoped,
          draftCount: (draftsRes as { posts?: unknown[] }).posts?.length ?? 0,
          ideaCount: (ideasRes as { ideas?: unknown[] }).ideas?.length ?? 0,
          now,
        })
      );
    } catch (err) {
      console.error('[studio] dashboard load failed:', err);
      setDash(null);
    } finally {
      setLoading(false);
    }
    // Re-fetch whenever the scope changes
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  // ─── Composer & Idea editor wiring ──────────────────────────────
  const [composerOpen, setComposerOpen] = useState(false);
  // Set by the notable-dates overlay so the composer opens with that day
  // already scheduled. Cleared when the composer closes.
  const [composerPreset, setComposerPreset] = useState<string | null>(null);
  const [ideaEditorOpen, setIdeaEditorOpen] = useState(false);

  // Deep-link: /organic/studio?compose=1 still opens the composer
  useEffect(() => {
    if (searchParams.get('compose') === '1') {
      setComposerOpen(true);
      router.replace('/organic/studio', { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstName = useMemo(() => {
    if (!user?.name) return null;
    const trimmed = user.name.trim();
    const first = trimmed.split(/\s+/)[0];
    return first || null;
  }, [user]);


  return (
    <div>
      {/* Greeting header. The old title ran to a full sentence, which at the
          new display weight wrapped to three lines and buried the actions.
          Short title, sentence moved to the description. */}
      <div className="mb-8">
        <PageHeader
          icon={Sprout}
          title={firstName ? `Hi ${firstName}` : 'Studio'}
          description="Compose, preview and publish across every connected profile."
          tint={PAGE_TINTS.studio}
        />
      </div>

      {/* Stat row. Volume only — deliberately no reach or engagement while
          insights are unreliable. `queued` takes the inverted hero treatment
          because on this screen the number you act on is what's still to
          come, not what already went out. */}
      <div className="mb-6 flex flex-wrap items-stretch gap-2.5">
        <div className="stat stat-hero">
          <div className="stat-value">{loading ? '—' : dash?.queuedThisWeek ?? 0}</div>
          <div className="lab mt-1.5">Queued this week</div>
        </div>
        <div className="stat">
          <div className="stat-value">{loading ? '—' : dash?.publishedThisWeek ?? 0}</div>
          <div className="lab mt-1.5">Published this week</div>
        </div>
        <Link href="/organic/drafts" className="stat transition-colors hover:bg-surface-hover">
          <div className="stat-value">{loading ? '—' : dash?.draftCount ?? 0}</div>
          <div className="lab mt-1.5">Drafts waiting</div>
        </Link>
        <Link href="/organic/ideas" className="stat transition-colors hover:bg-surface-hover">
          <div className="stat-value">{loading ? '—' : dash?.ideaCount ?? 0}</div>
          <div className="lab mt-1.5">Ideas parked</div>
        </Link>
        {!loading && (dash?.attention.length ?? 0) > 0 && (
          <Link href="/organic/pipeline" className="stat transition-colors hover:bg-surface-hover">
            <div className="stat-value text-danger">{dash?.attention.length}</div>
            <div className="lab mt-1.5">Need attention</div>
          </Link>
        )}

        {/* Actions share the stats row — pushed to the right, vertically
            centred against the tiles. They're shortcuts, not the point. */}
        <div className="ml-auto flex items-center gap-2 self-center">
          <button onClick={() => setComposerOpen(true)} className="btn-primary">
            <Plus size={15} /> New post
          </button>
          <button
            onClick={() => setIdeaEditorOpen(true)}
            disabled={scope.type === 'all'}
            title={scope.type === 'all' ? 'Pick a brand or profile to drop ideas under.' : undefined}
            className="btn-secondary"
          >
            <Lightbulb size={15} /> Drop an idea
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card px-6 py-16 text-center text-sm text-ink-subtle">Loading…</div>
      ) : dash ? (
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Column 1 — Pipeline, plus what needs attention. */}
          <div className="flex flex-col gap-4">
            <NextUpPanel
              posts={dash.nextUp}
              accountNames={accountNames}
              onOpenComposer={() => setComposerOpen(true)}
            />
            <AttentionPanel items={dash.attention} />
          </div>

          {/* Column 2 — Tasks + social-media news. */}
          <div className="flex flex-col gap-4">
            <TasksPanel />
            <NewsPanel />
          </div>

          {/* Column 3 — Notable dates, plus this week's cadence. */}
          <div className="flex flex-col gap-4">
            <NotableDatesPanel
              onCreateForDate={(iso) => {
                setComposerPreset(iso);
                setComposerOpen(true);
              }}
            />
            <CadencePanel week={dash.week} emptyDaysAhead={dash.emptyDaysAhead} />
          </div>
        </div>
      ) : (
        <div className="card px-6 py-16 text-center">
          <p className="text-sm text-ink-muted">Couldn&apos;t load this week.</p>
          <button onClick={load} className="btn-secondary btn-sm mt-3">Try again</button>
        </div>
      )}

      {/* Modals */}
      <ComposerModal
        open={composerOpen}
        onClose={() => { setComposerOpen(false); setComposerPreset(null); }}
        onPublished={() => load()}
        initialScheduledFor={composerPreset}
      />
      <IdeaEditorModal
        open={ideaEditorOpen}
        onClose={() => setIdeaEditorOpen(false)}
        brandId={scopeIdeaBrandId(scope)}
        accountId={scopeIdeaAccountId(scope)}
        idea={null}
        folders={[]}
        defaultFolderId={null}
        onSaved={() => { /* nothing on Studio — Ideas page reloads from server */ }}
      />
    </div>
  );
}

/** Pick the brandId to attach a new idea to, given the active scope.
 *  - 'all' → null (Studio disables the button in this case)
 *  - first brand item → that brand
 *  - first profile item → null (server derives from the account) */
function scopeIdeaBrandId(scope: ActiveScope): string | null {
  if (scope.type === 'all') return null;
  const firstBrand = scope.items.find((x) => x.type === 'brand');
  return firstBrand ? firstBrand.id : null;
}

/** Pick the accountId to attach a new idea to. Used only when no
 *  brand is explicitly in scope. */
function scopeIdeaAccountId(scope: ActiveScope): string | null {
  if (scope.type === 'all') return null;
  // If there's a brand picked, attach to the brand (not a specific profile)
  if (scope.items.some((x) => x.type === 'brand')) return null;
  const firstProfile = scope.items.find((x) => x.type === 'profile');
  return firstProfile ? firstProfile.id : null;
}
