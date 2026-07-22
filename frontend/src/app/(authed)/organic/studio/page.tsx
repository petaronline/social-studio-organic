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
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Lightbulb, CheckCircle2, Clock, RefreshCw, Sprout } from 'lucide-react';
import { PageHeader, PAGE_TINTS } from '@/components/PageHeader';
import {
  auth,
  organicCalendar,
  type CalendarPost,
  type CurrentUser,
} from '@/lib/api';
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

  // ─── Today's publishing stats ───────────────────────────────────
  const [statsLoading, setStatsLoading] = useState(true);
  const [todayPosts, setTodayPosts] = useState<CalendarPost[]>([]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);
      // Derive scope filter params. accountIds is most-specific; when
      // it's present the calendar endpoint ignores brandId. For mixed
      // brand+profile scopes we expand brands to all their accounts
      // and union the result, so the count is honest.
      const ids = getActiveAccountIds();
      const r = await organicCalendar.get({
        from: startOfDay.toISOString(),
        to: endOfDay.toISOString(),
        brandId: null,
        accountIds: ids ?? undefined,
        statuses: ['scheduled', 'published'],
      });
      setTodayPosts(r.posts);
    } catch (err) {
      console.error('[studio] stats load failed:', err);
      setTodayPosts([]);
    } finally {
      setStatsLoading(false);
    }
    // Re-fetch whenever the scope changes
  }, [scope]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const stats = useMemo(() => {
    // Only Vass-tracked posts. Synced rows aren't ours to count.
    const vassOnly = todayPosts.filter((p) => p.source === 'vass');
    return {
      published: vassOnly.filter(
        (p) => p.status === 'published' || p.status === 'partial'
      ).length,
      scheduled: vassOnly.filter(
        (p) => p.status === 'scheduled' || p.status === 'publishing'
      ).length,
    };
  }, [todayPosts]);

  // ─── Composer & Idea editor wiring ──────────────────────────────
  const [composerOpen, setComposerOpen] = useState(false);
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

      {/* Three cards row */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr,1fr,1fr] gap-4 mb-8">
        <TodaysPublishingCard
          loading={statsLoading}
          published={stats.published}
          scheduled={stats.scheduled}
          onRefresh={loadStats}
        />
        <ActionCard
          title="Create a post"
          description="Compose & publish to your profiles."
          Icon={Plus}
          onClick={() => setComposerOpen(true)}
        />
        <ActionCard
          title="Drop an idea"
          description="Capture a quick thought for later."
          Icon={Lightbulb}
          onClick={() => setIdeaEditorOpen(true)}
          disabled={scope.type === 'all'}
          disabledHint="Pick a brand or profile to drop ideas under."
        />
      </div>

      {/* Modals */}
      <ComposerModal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onPublished={() => loadStats()}
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

// ─── Today's Publishing card ─────────────────────────────────────────

function TodaysPublishingCard({
  loading,
  published,
  scheduled,
  onRefresh,
}: {
  loading: boolean;
  published: number;
  scheduled: number;
  onRefresh: () => void;
}) {
  return (
    <div className="card flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="lab">Today&apos;s publishing</h2>
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Refresh stats"
          className="btn-ghost btn-icon"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {/* `scheduled` gets the inverted hero treatment: on this screen the
          number you act on is what's still coming, not what already went
          out. One hero per screen — see globals.css. */}
      <div className="grid grid-cols-2 gap-3">
        <StatBlock loading={loading} value={scheduled} label="scheduled" hero />
        <StatBlock loading={loading} value={published} label="published" />
      </div>
    </div>
  );
}

function StatBlock({
  loading,
  value,
  label,
  hero = false,
}: {
  loading: boolean;
  value: number;
  label: string;
  hero?: boolean;
}) {
  return (
    <div className={['stat', hero ? 'stat-hero' : ''].join(' ')}>
      <div className="stat-value">{loading ? '—' : value}</div>
      <div className="lab mt-1.5">{label}</div>
    </div>
  );
}

// ─── Action card (Create a post / Drop an idea) ──────────────────────

function ActionCard({
  title,
  description,
  Icon,
  onClick,
  disabled = false,
  disabledHint,
}: {
  title: string;
  description: string;
  Icon: typeof Plus;
  onClick: () => void;
  disabled?: boolean;
  disabledHint?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
      className={[
        'card group flex flex-col items-start gap-3 p-5 text-left transition-all',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:-translate-y-px hover:border-cherry/40 hover:shadow-card',
      ].join(' ')}
    >
      {/* The icon fills with cherry on hover — the affordance that says
          "this whole card is the button", without a second CTA. */}
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cherry-wash text-cherry-ink transition-colors group-hover:bg-cherry group-hover:text-white">
        <Icon size={20} />
      </div>
      <div>
        <h3 className="h-sub text-ink">{title}</h3>
        <p className="mt-1 text-xs text-ink-muted">{description}</p>
        {disabled && disabledHint && (
          <p className="mt-1 text-xs italic text-ink-subtle">{disabledHint}</p>
        )}
      </div>
    </button>
  );
}
