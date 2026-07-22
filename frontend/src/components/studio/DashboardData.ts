/**
 * Studio dashboard — data derivation.
 *
 * Everything here comes from the calendar, drafts, ideas and account token
 * expiry. Nothing touches analytics: post insights are unreliable at the
 * moment, and a dashboard that confidently reports wrong engagement numbers
 * is worse than one that doesn't mention them. When insights are trustworthy
 * again, the reach/top-post tiles can be added alongside this without
 * changing any of it.
 *
 * Always brand-scoped: the caller passes the account ids currently in scope,
 * so every figure answers "for the brand I'm looking at", never "across
 * everything you happen to have connected".
 */
import type { CalendarPost, OrganicAccount } from '@/lib/api';

/** Monday of the week containing `d`, local time. */
export function mondayOf(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}

export interface DayCell {
  date: Date;
  scheduled: number;
  published: number;
  isToday: boolean;
  isPast: boolean;
}

export interface AttentionItem {
  kind: 'post' | 'token';
  label: string;
  detail: string;
  href: string;
}

export interface DashboardModel {
  queuedThisWeek: number;
  publishedThisWeek: number;
  draftCount: number;
  ideaCount: number;
  /** Next scheduled posts, soonest first. */
  nextUp: CalendarPost[];
  attention: AttentionItem[];
  week: DayCell[];
  /** Days left in the week with nothing scheduled — the nudge. */
  emptyDaysAhead: number;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * How soon, in words. Deliberately coarse: "in 3 days" is more useful at a
 * glance than "in 71 hours", and past-due reads as "overdue" rather than a
 * negative number, because a scheduled post in the past means the worker
 * hasn't picked it up and that's worth noticing.
 */
export function relativeWhen(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const mins = Math.round((then.getTime() - now.getTime()) / 60000);
  if (mins < -1) return 'overdue';
  if (mins < 1) return 'now';
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

export function buildDashboard(args: {
  posts: CalendarPost[];
  accounts: OrganicAccount[];
  draftCount: number;
  ideaCount: number;
  now?: Date;
}): DashboardModel {
  const now = args.now ?? new Date();
  const weekStart = mondayOf(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const inThisWeek = (p: CalendarPost) => {
    const t = new Date(p.timestamp);
    return t >= weekStart && t < weekEnd;
  };

  const queuedThisWeek = args.posts.filter(
    (p) => inThisWeek(p) && (p.status === 'scheduled' || p.status === 'publishing')
  ).length;

  const publishedThisWeek = args.posts.filter(
    (p) => inThisWeek(p) && p.status === 'published'
  ).length;

  const nextUp = args.posts
    .filter((p) => p.status === 'scheduled' || p.status === 'publishing')
    .filter((p) => new Date(p.timestamp).getTime() >= now.getTime() - 60_000)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(0, 3);

  // ── Needs attention ────────────────────────────────────────────────
  const attention: AttentionItem[] = [];

  // 'partial' first: it looks published in every list until you open it,
  // so it's the failure most likely to go unnoticed.
  const partial = args.posts.filter((p) => p.status === 'partial');
  if (partial.length > 0) {
    attention.push({
      kind: 'post',
      label: `${partial.length} post${partial.length === 1 ? '' : 's'} only partly published`,
      detail: 'Some targets went out, some did not.',
      href: '/organic/pipeline',
    });
  }

  const failed = args.posts.filter((p) => p.status === 'failed');
  if (failed.length > 0) {
    attention.push({
      kind: 'post',
      label: `${failed.length} post${failed.length === 1 ? '' : 's'} failed`,
      detail: 'Nothing was published for these.',
      href: '/organic/pipeline',
    });
  }

  // A scheduled post whose time has passed means the worker didn't run.
  const overdue = args.posts.filter(
    (p) =>
      (p.status === 'scheduled' || p.status === 'publishing') &&
      new Date(p.timestamp).getTime() < now.getTime() - 15 * 60_000
  );
  if (overdue.length > 0) {
    attention.push({
      kind: 'post',
      label: `${overdue.length} scheduled post${overdue.length === 1 ? '' : 's'} overdue`,
      detail: 'Past their time and still not published.',
      href: '/organic/pipeline',
    });
  }

  // Tokens inside 30 days. Expired ones are called out separately — those
  // are already breaking things rather than about to.
  const in30 = new Date(now.getTime() + 30 * 86400_000);
  const expired = args.accounts.filter(
    (a) => a.tokenExpiresAt && new Date(a.tokenExpiresAt) < now
  );
  const expiring = args.accounts.filter(
    (a) =>
      a.tokenExpiresAt &&
      new Date(a.tokenExpiresAt) >= now &&
      new Date(a.tokenExpiresAt) < in30
  );
  if (expired.length > 0) {
    attention.push({
      kind: 'token',
      label: `${expired.length} connection${expired.length === 1 ? '' : 's'} expired`,
      detail: 'Publishing to these will fail until reconnected.',
      href: '/settings/social-profiles',
    });
  }
  if (expiring.length > 0) {
    attention.push({
      kind: 'token',
      label: `${expiring.length} connection${expiring.length === 1 ? '' : 's'} expiring soon`,
      detail: 'Reconnect before they lapse.',
      href: '/settings/social-profiles',
    });
  }

  // ── Week cadence ───────────────────────────────────────────────────
  const week: DayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    const dayPosts = args.posts.filter((p) => sameDay(new Date(p.timestamp), date));
    week.push({
      date,
      scheduled: dayPosts.filter((p) => p.status === 'scheduled' || p.status === 'publishing').length,
      published: dayPosts.filter((p) => p.status === 'published' || p.status === 'partial').length,
      isToday: sameDay(date, now),
      isPast: date < new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    });
  }

  // Only days still ahead count as "empty" — a quiet Monday you can no
  // longer do anything about isn't a nudge, it's a nag.
  const emptyDaysAhead = week.filter(
    (d) => !d.isPast && d.scheduled === 0 && d.published === 0
  ).length;

  return {
    queuedThisWeek,
    publishedThisWeek,
    draftCount: args.draftCount,
    ideaCount: args.ideaCount,
    nextUp,
    attention,
    week,
    emptyDaysAhead,
  };
}
