import { redirect } from 'next/navigation';

/**
 * Team moved under Settings — it's workspace administration (who can sign
 * in, and with what role), not day-to-day work, so it belongs beside the
 * other configuration rather than in the main product nav.
 *
 * This stub keeps old links and bookmarks working.
 */
export default function TeamRedirectPage() {
  redirect('/settings/team');
}
