import { redirect } from 'next/navigation';

/**
 * Accounts folded into Settings → Social profiles.
 *
 * This page could list connected profiles, start a Facebook/Instagram
 * connect, and disconnect. Settings → Social profiles does all of that AND
 * Threads, TikTok, LinkedIn, LinkedIn organizations, and brand grouping —
 * so this was a strictly weaker copy of a page that already existed, and
 * two places to do the same job means one of them is always the stale one.
 *
 * Kept as a redirect so existing links and bookmarks still land somewhere
 * sensible.
 */
export default function AccountsRedirectPage() {
  redirect('/settings/social-profiles');
}
