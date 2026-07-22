'use client';

/**
 * Sidebar — left navigation.
 *
 * Standalone Organic: what used to be the collapsible "Organic" group in the
 * ads app is now the whole primary nav, flattened one level up. The group
 * machinery below is kept intact — Analytics and Accounts will likely grow
 * children — but nothing uses it today.
 *
 * Layout (top → bottom):
 *   1. Logo (custom upload OR the built-in mark)
 *   2. Primary nav (Studio, Pipeline, Drafts, Ideas, Analytics)
 *   3. Secondary nav (Accounts, Team, Settings) — directly above the user
 *      card so they don't clutter the main product navigation
 *   4. User card
 *
 * Aesthetic: a thin translucent rail with backdrop-blur so the page tint
 * shows through. Active items use a soft hue pill matching the dashboard
 * product palette.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings,
  Users,
  LogOut,
  Sprout,
  ChevronDown,
  PenLine,
  Workflow,
  FileText,
  Lightbulb,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { StudioLogo } from './StudioLogo';
import { NotificationsBell } from './NotificationsBell';
import { BrandSelector } from './BrandSelector';
import { auth, branding, CurrentUser } from '@/lib/api';

// ─── Active style palette ────────────────────────────────────────────────────

interface ActiveStyle {
  bg: string;
  fg: string;
}

const ACTIVE_INDIGO: ActiveStyle = { bg: 'rgba(99, 102, 241, 0.16)',  fg: '#4338CA' };
const ACTIVE_AMBER:  ActiveStyle = { bg: 'rgba(251, 191, 36, 0.20)',  fg: '#B45309' };
const ACTIVE_ROSE:   ActiveStyle = { bg: 'rgba(244, 114, 182, 0.16)', fg: '#BE185D' };
const ACTIVE_MINT:   ActiveStyle = { bg: 'rgba(52, 211, 153, 0.16)',  fg: '#047857' };
const ACTIVE_LILAC:  ActiveStyle = { bg: 'rgba(167, 139, 250, 0.16)', fg: '#6D28D9' };
const ACTIVE_SKY:    ActiveStyle = { bg: 'rgba(125, 211, 252, 0.16)', fg: '#0369A1' };
const ACTIVE_SLATE:  ActiveStyle = { bg: 'rgba(100, 116, 139, 0.18)', fg: '#334155' };
const ACTIVE_TEAL:   ActiveStyle = { bg: 'rgba(20, 184, 166, 0.16)',  fg: '#0F766E' };

// ─── Nav item shapes ─────────────────────────────────────────────────────────

interface FlatNavItem {
  kind: 'flat';
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  active?: ActiveStyle;
}

interface GroupNavItem {
  kind: 'group';
  label: string;
  /** Used to detect "is anywhere inside this group active?" — also used
      as the default redirect target when the group label is clicked. */
  basePath: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  active?: ActiveStyle;
  children: Array<{ label: string; href: string; icon: LucideIcon }>;
}

type NavItem = FlatNavItem | GroupNavItem;

// ─── Nav data ────────────────────────────────────────────────────────────────

const PRIMARY_NAV: NavItem[] = [
  { kind: 'flat', label: 'Studio',    href: '/organic/studio',    icon: PenLine,   active: ACTIVE_TEAL },
  { kind: 'flat', label: 'Pipeline',  href: '/organic/pipeline',  icon: Workflow,  active: ACTIVE_INDIGO },
  { kind: 'flat', label: 'Drafts',    href: '/organic/drafts',    icon: FileText,  active: ACTIVE_AMBER },
  { kind: 'flat', label: 'Ideas',     href: '/organic/ideas',     icon: Lightbulb, active: ACTIVE_LILAC },
  { kind: 'flat', label: 'Analytics', href: '/organic/analytics', icon: BarChart3, active: ACTIVE_MINT },
];

/**
 * Workspace nav is one item now.
 *
 * "Accounts" was a weaker duplicate of Settings → Social profiles, and
 * "Team" is workspace administration rather than daily work — both now live
 * inside Settings. Two nav entries that lead to the same job is how one of
 * them ends up stale.
 */
const SECONDARY_NAV: NavItem[] = [
  { kind: 'flat', label: 'Settings', href: '/settings', icon: Settings, active: ACTIVE_SLATE },
];

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function Sidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try {
      await auth.logout();
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  const filterByRole = (items: NavItem[]) =>
    items.filter((item) => !item.adminOnly || user.role === 'admin');

  const primary   = filterByRole(PRIMARY_NAV);
  const secondary = filterByRole(SECONDARY_NAV);

  // Custom-uploaded workspace logo (fetched once + listens for updates).
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      branding
        .get()
        .then((r) => !cancelled && setLogoDataUrl(r.logoDataUrl))
        .catch(() => { /* fall back to default mark */ });
    load();
    const onUpdate = () => load();
    window.addEventListener('vass:branding-updated', onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('vass:branding-updated', onUpdate);
    };
  }, []);

  return (
    <aside className="hidden w-[230px] shrink-0 flex-col border-r border-line bg-surface md:flex">
      <div className="px-5 pb-7 pt-6">
        {logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoDataUrl}
            alt="Workspace logo"
            className="max-h-[28px] max-w-full object-contain"
          />
        ) : (
          <StudioLogo variant="full" height={26} />
        )}
      </div>

      {/* Brand scope. It belongs beside the nav, not in a top bar: it governs
          every view below it, and the profile rail to its right is the same
          filter one level finer. */}
      <div className="px-3 pb-4">
        <BrandSelector />
      </div>

      {/* The two groups are labelled: "Work" is what you do all day,
          "Workspace" is what you configure occasionally. Splitting them
          stops Settings competing with Studio for attention. */}
      <nav className="flex-1 overflow-y-auto px-3">
        <div className="lab px-3 pb-2">Work</div>
        <NavList items={primary} pathname={pathname} />
      </nav>

      <nav className="mt-4 px-3 pb-2">
        <div className="lab px-3 pb-2">Workspace</div>
        <NavList items={secondary} pathname={pathname} />
      </nav>

      {/* User card. The app has no top bar — the approved direction put the
          identity and its controls down here, and the page's own header owns
          the actions. Notifications and sign-out live on this row so the
          work surface stays entirely content. */}
      <div className="p-3">
        <div className="flex items-center gap-2 rounded-lg bg-surface-alt px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cherry text-xs font-bold text-white">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink">{user.name}</div>
            <div className="truncate text-xs text-ink-subtle">{user.email}</div>
          </div>
          <NotificationsBell />
          <button
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            className="shrink-0 rounded p-1.5 text-ink-subtle transition-colors hover:bg-surface hover:text-danger"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── NavList ─────────────────────────────────────────────────────────────────

function NavList({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) =>
        item.kind === 'flat' ? (
          <FlatRow key={item.href} item={item} pathname={pathname} />
        ) : (
          <GroupRow key={item.basePath} item={item} pathname={pathname} />
        )
      )}
    </ul>
  );
}

// ─── Flat row ────────────────────────────────────────────────────────────────

function FlatRow({ item, pathname }: { item: FlatNavItem; pathname: string }) {
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  // The active item is solid cherry — one of only three places that colour
  // is allowed to appear (here, the primary button, the brand mark). The
  // previous design gave every route its own pastel pill; with Organic as
  // the whole app that just read as noise.
  return (
    <li>
      <Link
        href={item.href}
        aria-current={isActive ? 'page' : undefined}
        className={[
          'flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-cherry font-semibold text-white'
            : 'font-medium text-ink-muted hover:bg-surface-alt hover:text-ink',
        ].join(' ')}
      >
        <Icon
          size={17}
          strokeWidth={2}
          className={isActive ? 'text-white' : 'text-ink-subtle'}
        />
        <span>{item.label}</span>
      </Link>
    </li>
  );
}

// ─── Group row (collapsible) ─────────────────────────────────────────────────

function GroupRow({ item, pathname }: { item: GroupNavItem; pathname: string }) {
  const isInside = pathname === item.basePath || pathname.startsWith(`${item.basePath}/`);

  // Persistent open/closed state. Auto-open whenever pathname is inside;
  // user can toggle when not active. Defaults to closed.
  const storageKey = `vass:nav:group:${item.basePath}`;
  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(storageKey);
    if (stored !== null) {
      setOpen(stored === '1');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the active path moves into this group, force-open.
  useEffect(() => {
    if (isInside && !open) {
      setOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInside]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, next ? '1' : '0');
      }
      return next;
    });
  };

  const Icon = item.icon;
  const active = item.active;
  const expanded = open || isInside;

  return (
    <li>
      {/* Group header — clickable to toggle, also navigates to first
          child when the user clicks the icon/label rather than the chevron.
          We split into two buttons so the chevron toggles without navigating. */}
      <div
        className={[
          'flex items-center gap-1 rounded-lg text-sm font-medium transition-colors',
          isInside ? '' : 'text-ink hover:bg-surface-alt',
        ].join(' ')}
        style={isInside && active ? { background: active.bg, color: active.fg } : undefined}
      >
        <Link
          href={item.children[0]?.href ?? item.basePath}
          className="flex-1 flex items-center gap-3 pl-3 py-2"
        >
          <Icon
            size={17}
            strokeWidth={2}
            style={isInside && active ? { color: active.fg } : undefined}
            className={isInside ? '' : 'text-ink-muted'}
          />
          <span>{item.label}</span>
        </Link>
        <button
          onClick={toggle}
          className="px-2 py-2 rounded-lg hover:bg-black/5 transition-colors"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <ChevronDown
            size={14}
            className={[
              'transition-transform',
              expanded ? 'rotate-0' : '-rotate-90',
              isInside ? '' : 'text-ink-subtle',
            ].join(' ')}
            style={isInside && active ? { color: active.fg } : undefined}
          />
        </button>
      </div>

      {expanded && (
        <ul className="mt-0.5 ml-3 pl-3 border-l border-line space-y-0.5">
          {item.children.map((child) => {
            const isActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
            const ChildIcon = child.icon;
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  className={[
                    'flex items-center gap-2.5 px-2.5 py-1.5 rounded text-sm transition-colors',
                    isActive ? 'font-semibold' : 'text-ink-muted hover:text-ink hover:bg-surface-alt',
                  ].join(' ')}
                  style={isActive && active ? { color: active.fg } : undefined}
                >
                  <ChildIcon size={13} strokeWidth={2} />
                  <span>{child.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
