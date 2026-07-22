/**
 * Sanity-checking stored OAuth redirect overrides.
 *
 * Threads, TikTok and LinkedIn each let an admin override their callback URL
 * in Settings, stored in `app_settings`. The override exists for unusual
 * hosting setups where the callback can't simply be derived from
 * FRONTEND_URL.
 *
 * After the split from the ads app, every one of those rows arrived in this
 * database still pointing at the ads app's domain — they came across in the
 * data migration along with everything else. The failure that produces is
 * genuinely baffling from the outside:
 *
 *   1. You click Connect here, so the OAuth state row is written to THIS
 *      database.
 *   2. The provider redirects to the OTHER app's domain, because that's what
 *      the override says.
 *   3. That app looks the state up in ITS database, doesn't find it, and
 *      answers "Invalid state".
 *
 * Nothing in the message points at a stale settings row, and the override
 * looks perfectly valid on the Settings screen.
 *
 * An override pointing at a different origin than the app serving the page
 * can never be correct — the provider has to come back to the app that
 * started the flow. So we ignore those and fall back to the derived URL,
 * loudly, rather than sending users into a dead end.
 *
 * A DIFFERENT PATH on the same origin is left alone: that's a legitimate
 * reverse-proxy arrangement and none of our business.
 */
import { env } from './env';

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Returns the override when it's usable, or null to fall back to the derived
 * callback. `label` only appears in the warning log.
 */
export function sanitizeRedirectOverride(
  override: string | null | undefined,
  label: string
): string | null {
  const trimmed = override?.trim();
  if (!trimmed) return null;

  const overrideOrigin = originOf(trimmed);
  const appOrigin = originOf(env.FRONTEND_URL);

  if (!overrideOrigin) {
    console.warn(
      `[${label}] stored redirect override is not a valid URL (${trimmed}); using the derived callback instead`
    );
    return null;
  }

  if (appOrigin && overrideOrigin !== appOrigin) {
    console.warn(
      `[${label}] stored redirect override points at ${overrideOrigin}, but this app is served from ${appOrigin}. ` +
        `OAuth would come back to the wrong app and fail with "Invalid state" — ignoring the override. ` +
        `Clear or correct it in Settings to silence this.`
    );
    return null;
  }

  return trimmed;
}
