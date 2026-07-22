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
import {
  getActiveScope,
  setActiveScope,
  VASS_ACTIVE_SCOPE_EVENT,
  type ActiveScope,
} from '@/components/BrandSelector';

/** Two-letter fallback when an account has no picture. */
function initials(a: OrganicAccount): string {
  const name = a.meta?.name || a.meta?.username || a.externalId || '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

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

  if (!visible || accounts.length === 0) return null;

  return (
    <aside
      className="hidden w-[68px] shrink-0 flex-col items-center gap-2.5 overflow-y-auto
                 border-r border-line bg-surface-alt py-5 lg:flex"
      aria-label="Connected profiles"
    >
      {accounts.map((a) => {
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
            {pic ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pic} alt="" className="h-full w-full rounded-[0.4rem] object-cover" />
            ) : (
              <span className="font-mono text-2xs font-bold">{initials(a)}</span>
            )}

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
