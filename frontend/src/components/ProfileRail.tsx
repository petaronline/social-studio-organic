'use client';

/**
 * ProfileRail — the narrow column of connected profiles between the nav and
 * the work surface.
 *
 * Lifted from the approved direction. It does two jobs at once: it tells you
 * at a glance which accounts this workspace publishes to, and it's the
 * fastest way to scope the app to one of them — click an avatar and every
 * view (Studio, Pipeline, Analytics) filters to that profile.
 *
 * It writes the SAME scope object the BrandSelector in the top bar uses, so
 * the two controls can never disagree; each listens for the other's change
 * event. Clicking the already-selected profile clears back to "all", which
 * is what people expect from a filter rail and saves a trip to the dropdown.
 *
 * Only renders inside /organic — Settings and Team aren't profile-scoped, and
 * a rail that does nothing on half the app is worse than no rail.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { organicAccounts, ApiError, type OrganicAccount } from '@/lib/api';
import { platformVisual } from '@/lib/platform-visuals';
import { AccountAvatar } from '@/components/AccountAvatar';
import {
  getActiveScope,
  setActiveScope,
  getActiveAccountIds,
  VASS_ACTIVE_SCOPE_EVENT,
  type ActiveScope,
} from '@/components/BrandSelector';

export function ProfileRail() {
  const pathname = usePathname();
  const visible = pathname.startsWith('/organic');

  const [accounts, setAccounts] = useState<OrganicAccount[]>([]);
  const [scope, setScope] = useState<ActiveScope>({ type: 'all' });

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    organicAccounts
      .list()
      .then((r) => { if (!cancelled) setAccounts(r.accounts); })
      .catch((err) => { if (!(err instanceof ApiError)) console.error(err); });
    return () => { cancelled = true; };
  }, [visible]);

  // Mirror the top-bar selector both ways.
  useEffect(() => {
    setScope(getActiveScope());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail === 'object' && 'type' in detail) {
        setScope(detail as ActiveScope);
      }
    };
    window.addEventListener(VASS_ACTIVE_SCOPE_EVENT, onChange);
    return () => window.removeEventListener(VASS_ACTIVE_SCOPE_EVENT, onChange);
  }, []);

  const isPicked = useCallback(
    (id: string) =>
      scope.type === 'multi' &&
      scope.items.some((i) => i.type === 'profile' && i.id === id),
    [scope]
  );

  const toggle = useCallback(
    (id: string) => {
      // Clicking the current selection clears it — a filter you can't undo
      // from where you set it is a trap.
      if (isPicked(id) && scope.type === 'multi' && scope.items.length === 1) {
        setActiveScope({ type: 'all' });
        return;
      }
      setActiveScope({ type: 'multi', items: [{ type: 'profile', id }] });
    },
    [isPicked, scope]
  );

  /**
   * Only the profiles belonging to the brand currently in scope.
   *
   * The rail showed every connected account regardless of the brand picked
   * in the selector, which on a workspace with a dozen profiles turned it
   * into an unreadable column of near-identical avatars — and contradicted
   * the brand filter sitting right above it. `getActiveAccountIds` returns
   * null for "all brands", which is the one case where showing everything
   * is correct.
   */
  const visibleAccounts = (() => {
    const ids = getActiveAccountIds(accounts);
    if (ids === null) return accounts;
    const set = new Set(ids);
    return accounts.filter((a) => set.has(a.id));
  })();

  if (!visible || visibleAccounts.length === 0) return null;

  return (
    <aside
      className="hidden w-[68px] shrink-0 flex-col items-center gap-2.5 overflow-y-auto
                 border-r border-line bg-surface-alt py-5 lg:flex"
      aria-label="Connected profiles"
    >
      {visibleAccounts.map((a) => {
        const pv = platformVisual(a.platform);
        const picked = isPicked(a.id);
        const name = a.meta?.name || a.meta?.username || a.externalId;
        const pic = a.meta?.picture_url;

        return (
          <button
            key={a.id}
            onClick={() => toggle(a.id)}
            title={`${name} · ${pv.label}${picked ? ' (click to clear)' : ''}`}
            aria-pressed={picked}
            className={[
              'relative flex h-[38px] w-[38px] shrink-0 items-center justify-center',
              'rounded-md border-2 transition-transform hover:-translate-y-px',
              picked ? 'border-cherry' : 'border-transparent',
            ].join(' ')}
            style={{ backgroundColor: pv.bg, color: pv.ink }}
          >
            <AccountAvatar
              name={name}
              pictureUrl={pic ?? null}
              platform={a.platform}
              size={34}
              shape="rounded"
            />

            {/* Platform tag, so two profiles of the same brand on different
                networks stay distinguishable at 38px. */}
            <span
              className="absolute -bottom-1 -right-1 rounded-full bg-surface px-1 font-mono
                         text-[8px] font-bold leading-[13px] shadow-subtle"
              style={{ color: pv.ink }}
            >
              {pv.tag}
            </span>
          </button>
        );
      })}

      <Link
        href="/settings/social-profiles"
        title="Connect a profile"
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-md
                   border-2 border-dashed border-line text-ink-subtle
                   hover:border-cherry hover:text-cherry"
      >
        <Plus size={17} />
      </Link>
    </aside>
  );
}
