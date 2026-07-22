/**
 * Authenticated layout — wraps every page that requires a logged-in user.
 *
 * Server-side: validate the session cookie against the backend. If invalid,
 * redirect to /login. If valid, render the sidebar + top bar + page content.
 *
 * This is a Next.js layout, so it applies to every child route automatically.
 */
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Sidebar } from '@/components/Sidebar';
import { AppBackdrop } from '@/components/AppBackdrop';
import { ProfileRail } from '@/components/ProfileRail';
import { CurrentUser } from '@/lib/api';

async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('vass_organic_session');
  if (!sessionCookie) return null;

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://backend:4000';
    const res = await fetch(`${apiUrl}/auth/me`, {
      headers: { Cookie: `vass_organic_session=${sessionCookie.value}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    /*
     * The authed shell. The app is a white panel FLOATING on the lavender
     * canvas rather than filling the viewport — that inset is most of what
     * makes the redesign read as designed, so resist the urge to reclaim
     * the margin for content.
     *
     * The panel scrolls internally (min-h-0 + overflow on <main>) so the
     * sidebar and top bar stay put and the panel's rounded corners are
     * always visible. Without min-h-0 the flex child refuses to shrink and
     * the whole page scrolls instead, which loses the bottom corners.
     */
    <div className="relative min-h-screen bg-canvas p-3 sm:p-5">
      <AppBackdrop />
      {/*
       * FIXED height, not min-height. With min-height the panel grew past the
       * viewport whenever a page was tall, so you got two scrollbars — the
       * window's and the panel's — and the panel's bottom corners were cut
       * off below the fold. Pinning it to the viewport makes <main> the only
       * scroller and keeps all four corners visible.
       */}
      <div
        className="relative z-10 flex h-[calc(100vh-1.5rem)] sm:h-[calc(100vh-2.5rem)]
                   overflow-hidden rounded-2xl bg-surface shadow-lift"
      >
        <Sidebar user={user} />
        <ProfileRail />
        {/* No top bar. The approved direction has the nav rail carry identity
            and scope, and each page's own header carry its actions — so the
            work surface is entirely content. */}
        <main className="min-h-0 flex-1 overflow-y-auto px-7 py-7">{children}</main>
      </div>
    </div>
  );
}
