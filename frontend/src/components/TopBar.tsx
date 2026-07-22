'use client';

/**
 * Top bar — search, notifications, user menu with logout.
 */
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ChevronDown, LogOut } from 'lucide-react';
import { auth, CurrentUser } from '@/lib/api';
import { BrandSelector } from './BrandSelector';
import { NotificationsBell } from './NotificationsBell';

export function TopBar({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function handleLogout() {
    try {
      await auth.logout();
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-line bg-surface px-7">
      {/* Search. Sits on surface-alt rather than white so it reads as an
          inset field on the panel instead of a floating pill. */}
      <div className="relative max-w-sm flex-1">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
        />
        <input
          type="search"
          placeholder="Search posts, drafts, ideas…"
          className="w-full rounded bg-surface-alt py-2.5 pl-10 pr-3 text-sm text-ink
                     placeholder:text-ink-subtle transition-colors
                     focus:bg-surface focus:outline-none focus:ring-2 focus:ring-cherry/25"
        />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 ml-6">
        {/* Active brand selector — only renders on /organic/* */}
        <BrandSelector />

        <NotificationsBell />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded py-1.5 pl-2 pr-3 transition-colors hover:bg-surface-alt"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cherry text-xs font-bold text-white">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <ChevronDown size={14} className="text-ink-subtle" />
          </button>

          {menuOpen && (
            <div className="animate-fade-in absolute right-0 mt-2 w-56 rounded-xl border border-line bg-surface py-1.5 shadow-lift">
              <div className="border-b border-line px-3 py-2">
                <div className="truncate text-sm font-semibold text-ink">{user.name}</div>
                <div className="truncate text-xs text-ink-subtle">{user.email}</div>
                <div className="lab mt-1.5">{user.role}</div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-ink hover:bg-surface-hover transition-colors"
              >
                <LogOut size={14} className="text-ink-muted" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
