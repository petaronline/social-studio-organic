/**
 * Meta Graph OAuth wrapper.
 *
 * This is the slice of the ads app's `services/meta.ts` that Organic actually
 * uses — the Facebook Login handshake and nothing else:
 *   - Generate OAuth URL (Facebook Login)
 *   - Exchange code for short-lived token
 *   - Exchange short-lived token for long-lived (~60 day) token
 *   - Fetch authenticated user info
 *
 * Everything else in that file (campaigns, ad sets, creatives, image/video
 * upload, comment moderation) belongs to the ads app and was left there.
 *
 * Per-platform publishing calls live in their own services:
 * `organic-publisher`, `threads-publisher`, `tiktok-publisher`,
 * `linkedin-publisher`. Post/insight reads live in `meta-sync` and
 * `organic-insights`.
 */

const GRAPH_API_VERSION = 'v25.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const OAUTH_BASE = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;

/**
 * Base permissions requested during OAuth. `organic-connection` appends the
 * platform-specific publishing scopes on top of these (see
 * ORGANIC_SCOPES_FB_PAGE / ORGANIC_SCOPES_INSTAGRAM there).
 *
 * NOTE: the three ads scopes are inherited from the ads app. Organic itself
 * does not call any ads endpoint, so they could be dropped — but every token
 * currently in `organic_connected_accounts` was granted WITH them, and
 * narrowing the list would force every user to re-consent. Left as-is
 * deliberately; revisit only alongside a planned reconnect.
 */
export const REQUIRED_SCOPES = [
  'ads_management',
  'ads_read',
  'business_management',
];

export interface MetaUser {
  id: string;
  name: string;
  email?: string;
}

export class MetaApiError extends Error {
  status: number;
  code?: number;
  type?: string;
  fbtraceId?: string;
  errorSubcode?: number;
  errorUserTitle?: string;
  errorUserMsg?: string;

  constructor(message: string, status: number, raw?: any) {
    // Build a more informative message: pull error_user_msg if available
    // (Meta's human-readable explanation), else fall back to the bare message.
    const userMsg = raw?.error_user_msg;
    const subcode = raw?.error_subcode;
    let fullMessage = message;
    if (userMsg && userMsg !== message) {
      fullMessage = `${message} — ${userMsg}`;
    }
    if (subcode) {
      fullMessage += ` [subcode=${subcode}]`;
    }
    super(fullMessage);
    this.name = 'MetaApiError';
    this.status = status;
    this.code = raw?.code;
    this.type = raw?.type;
    this.fbtraceId = raw?.fbtrace_id;
    this.errorSubcode = raw?.error_subcode;
    this.errorUserTitle = raw?.error_user_title;
    this.errorUserMsg = raw?.error_user_msg;
  }
}

async function metaFetch<T>(
  url: string,
  params?: Record<string, string>
): Promise<T> {
  const u = new URL(url);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      u.searchParams.set(k, v);
    }
  }
  const res = await fetch(u.toString());
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new MetaApiError(`Non-JSON response from Meta (${res.status}): ${text.slice(0, 200)}`, res.status);
  }
  if (!res.ok || data?.error) {
    const err = data?.error ?? {};
    throw new MetaApiError(
      err.message ?? `Meta API error (${res.status})`,
      res.status,
      err
    );
  }
  return data as T;
}

/**
 * Build the URL that takes the user to Facebook for OAuth.
 */
export function buildOAuthUrl(opts: {
  appId: string;
  redirectUri: string;
  state: string;
  scopes?: string[];
  /**
   * When true, sends `auth_type=reauthorize` which forces Facebook to
   * re-show the permissions dialog (Page picker, granular permissions)
   * even if the user has previously granted access. Use this for "Add
   * more Pages" flows where the user already connected but wants to
   * grant access to additional Pages.
   */
  reauthorize?: boolean;
}): string {
  const url = new URL(OAUTH_BASE);
  url.searchParams.set('client_id', opts.appId);
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('state', opts.state);
  url.searchParams.set('scope', (opts.scopes ?? REQUIRED_SCOPES).join(','));
  url.searchParams.set('response_type', 'code');
  if (opts.reauthorize) {
    url.searchParams.set('auth_type', 'reauthorize');
  }
  return url.toString();
}

/**
 * Exchange an OAuth authorization code for a short-lived access token.
 * Short-lived tokens last about 1-2 hours.
 */
export async function exchangeCodeForToken(opts: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const data = await metaFetch<{ access_token: string; token_type: string; expires_in: number }>(
    `${GRAPH_BASE}/oauth/access_token`,
    {
      client_id: opts.appId,
      client_secret: opts.appSecret,
      redirect_uri: opts.redirectUri,
      code: opts.code,
    }
  );
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 3600,
  };
}

/**
 * Exchange a short-lived token for a long-lived (~60 day) token.
 * Always do this immediately after OAuth so we don't have a 1-hour token in storage.
 */
export async function exchangeForLongLivedToken(opts: {
  appId: string;
  appSecret: string;
  shortLivedToken: string;
}): Promise<{ accessToken: string; expiresIn: number }> {
  const data = await metaFetch<{ access_token: string; token_type: string; expires_in: number }>(
    `${GRAPH_BASE}/oauth/access_token`,
    {
      grant_type: 'fb_exchange_token',
      client_id: opts.appId,
      client_secret: opts.appSecret,
      fb_exchange_token: opts.shortLivedToken,
    }
  );
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 5_184_000, // 60 days default
  };
}

/**
 * Fetch the authenticated user's profile (id, name).
 */
export async function fetchMe(accessToken: string): Promise<MetaUser> {
  return metaFetch<MetaUser>(`${GRAPH_BASE}/me`, {
    access_token: accessToken,
    fields: 'id,name,email',
  });
}
