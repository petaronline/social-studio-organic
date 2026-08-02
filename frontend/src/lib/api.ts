/**
 * Frontend API client.
 *
 * All requests go through /api/* (proxied to the backend by next.config.js).
 * Cookies are sent automatically thanks to `credentials: 'include'`.
 */

export class ApiError extends Error {
  status: number;
  /** Raw `detail` payload from the backend, if any (e.g. Zod flatten output). */
  detail?: unknown;
  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
    this.name = 'ApiError';
  }
}

/**
 * Turn a backend error body into a specific, human-readable message. When the
 * body carries a Zod `flatten()` `detail`, append the first field-level reason
 * so the user sees "Invalid launch spec — copy.linkUrl: linkUrl must start
 * with https://" instead of the bare "Invalid launch spec".
 */
function composeErrorMessage(parsed: any, status: number): string {
  const base = parsed?.error ?? `Request failed with status ${status}`;
  const detail = parsed?.detail;
  const fieldErrors = detail?.fieldErrors as
    | Record<string, string[]>
    | undefined;
  const formErrors = detail?.formErrors as string[] | undefined;
  const parts: string[] = [];
  if (fieldErrors) {
    for (const [field, msgs] of Object.entries(fieldErrors)) {
      if (msgs && msgs.length) parts.push(`${field}: ${msgs[0]}`);
    }
  }
  if (formErrors && formErrors.length) parts.push(...formErrors);
  return parts.length ? `${base} — ${parts.join('; ')}` : base;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    credentials: 'include',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  // Read body, even on errors, so we can surface useful messages
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON — leave parsed as null
  }

  if (!res.ok) {
    throw new ApiError(composeErrorMessage(parsed, res.status), res.status, parsed?.detail);
  }

  return parsed as T;
}

export const api = {
  get: <T = unknown>(path: string, signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', signal }),
  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body }),
  put: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body }),
  patch: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body }),
  delete: <T = unknown>(path: string) => request<T>(path, { method: 'DELETE' }),
  /**
   * Multipart upload. `file` is appended as field name "file" to match the
   * backend multer config. Returns the parsed JSON body.
   *
   * Uses XMLHttpRequest under the hood so we can expose upload progress.
   * The optional `onProgress` callback fires with a 0–1 fraction.
   */
  upload: async <T = unknown>(
    path: string,
    file: File,
    onProgress?: (fraction: number) => void
  ): Promise<T> => {
    const form = new FormData();
    form.append('file', file);
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api${path}`);
      xhr.withCredentials = true;

      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress(e.loaded / e.total);
          }
        });
      }

      xhr.addEventListener('load', () => {
        let parsed: any = null;
        try {
          parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          /* swallow */
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(parsed as T);
        } else {
          reject(
            new ApiError(parsed?.error ?? `Upload failed (${xhr.status})`, xhr.status)
          );
        }
      });
      xhr.addEventListener('error', () => {
        reject(new ApiError('Network error during upload', 0));
      });
      xhr.addEventListener('abort', () => {
        reject(new ApiError('Upload aborted', 0));
      });

      xhr.send(form);
    });
  },
};

// ---- Typed API surface ----
export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member' | 'viewer';
  avatarUrl: string | null;
  /**
   * Optional Spotify track / playlist URL the user set as their "launch jam".
   * Rendered on the dashboard via Spotify's public embed iframe.
   * `null` when not set.
   */
  spotifyTrackUrl: string | null;
}

/** Editable subset of the current user. PATCH /auth/me. */
export interface UpdateMeInput {
  spotifyTrackUrl?: string | null;
}

export const auth = {
  login: (email: string, password: string) =>
    api.post<{ user: CurrentUser }>('/auth/login', { email, password }),
  logout: () => api.post<{ ok: true }>('/auth/logout'),
  me: () => api.get<{ user: CurrentUser }>('/auth/me'),
  updateMe: (input: UpdateMeInput) =>
    api.patch<{ ok: true }>('/auth/me', input),
};

// ---- Meta settings ----
export interface MetaSettings {
  hasCredentials: boolean;
  appId: string | null;
  connected: boolean;
  connectedUserName: string | null;
  connectedUserId: string | null;
  connectedAt: string | null;
  tokenExpiresAt: string | null;
  tokenExpired: boolean;
}

export const metaSettings = {
  get: () => api.get<MetaSettings>('/settings/meta'),
  saveCredentials: (appId: string, appSecret: string) =>
    api.post<{ ok: true }>('/settings/meta/credentials', { appId, appSecret }),
  getOAuthUrl: () => api.get<{ url: string }>('/settings/meta/oauth-url'),
  disconnect: () => api.post<{ ok: true }>('/settings/meta/disconnect'),
};

// ---- Ad accounts ----
export interface AdAccount {
  id: string;
  metaAccountId: string;
  name: string;
  currency: string | null;
  timezoneName: string | null;
  businessId: string | null;
  status: string;
  isEnabled: boolean;
  lastSyncedAt: string | null;
  pageId: string | null;
  pictureUrl: string | null;
  instagramUserId: string | null;
  brandId: string | null;
}

// ---- Uploads ----
export type AspectBucket = '1_1' | '4_5' | '9_16' | 'other';

export interface Upload {
  id: string;
  filename: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  kind: 'image' | 'video' | 'document';
  metaImageHash: string | null;
  metaVideoId: string | null;
  metaUploadedAt: string | null;
  /** Pixel width (3.2+, null for old uploads or unreadable files). */
  widthPx: number | null;
  /** Pixel height. */
  heightPx: number | null;
  /** Coarse aspect classification used for placement-aware grouping. */
  aspectBucket: AspectBucket | null;
  createdAt: string;
}

export const uploads = {
  upload: (file: File, onProgress?: (fraction: number) => void) =>
    api.upload<{ upload: Upload }>('/uploads', file, onProgress),
  list: () => api.get<{ uploads: Upload[] }>('/uploads'),
  get: (id: string) => api.get<{ upload: Upload }>(`/uploads/${id}`),
  delete: (id: string) => api.delete<{ ok: true }>(`/uploads/${id}`),
  /** URL to <img src=...> for previews; backend streams the bytes through. */
  fileUrl: (id: string) => `/api/uploads/${id}/file`,
};

// =====================================================================
// Branding — workspace logo upload (admin only)
// =====================================================================

export interface BrandingResp {
  /** A `data:image/png;base64,...` or `data:image/svg+xml;base64,...`
      string ready to drop into an <img src="...">. Null = no override,
      use the built-in <VassLogo /> mark. */
  logoDataUrl: string | null;
}

export const branding = {
  /** Public — works without auth (login page needs it). */
  get: () => api.get<BrandingResp>('/branding'),

  /** Admin only. Send the full data URL. */
  putLogo: (dataUrl: string) =>
    api.put<{ ok: true; sizeBytes: number }>('/branding/logo', { dataUrl }),

  /** Admin only. Reset to the default Vass mark. */
  deleteLogo: () => api.delete<{ ok: true }>('/branding/logo'),
};

// =====================================================================
// Team management — admin only
// =====================================================================

export interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member' | 'viewer';
  avatarUrl: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CreateTeamUserInput {
  email: string;
  name: string;
  role: 'admin' | 'member' | 'viewer';
  password: string;
}

export const team = {
  list: () => api.get<{ users: TeamUser[] }>('/team'),
  create: (input: CreateTeamUserInput) => api.post<{ user: TeamUser }>('/team', input),
  setRole: (id: string, role: 'admin' | 'member' | 'viewer') =>
    api.patch<{ user: TeamUser }>(`/team/${id}/role`, { role }),
  remove: (id: string) => api.delete<{ ok: true }>(`/team/${id}`),
};

// =====================================================================
// Organic publishing — connected accounts (Patch 4.22)
// =====================================================================

export type OrganicPlatform = 'facebook_page' | 'instagram' | 'threads' | 'tiktok' | 'linkedin';

export interface OrganicAccount {
  id: string;
  userId: string;
  platform: OrganicPlatform;
  externalId: string;
  brandId: string | null;
  tokenExpiresAt: string | null;
  scopes: string[];
  /** Platform-specific display data. */
  meta: {
    name?: string;
    username?: string;
    picture_url?: string | null;
    category?: string | null;
    followers_count?: number | null;
    linked_page_name?: string | null;
  };
  createdAt: string;
  updatedAt: string;
}


/* ============================================================
   Placeholder profile pictures
   ============================================================
   Meta serves a REAL image for profiles that have no picture — a grey
   silhouette or question mark from their static asset host. It loads fine,
   so no <img onError> ever fires, and every component that renders a
   picture happily shows their placeholder instead of our initials.

   Guarding each render site does not work: there are a dozen of them and
   any new one starts out wrong. So the URL is stripped HERE, at the single
   point where account data enters the app. Downstream code sees
   `picture_url: null` and takes its own initials path, whichever component
   it is.

   Matching on path, not filename — Meta rotates the asset ids.
   ============================================================ */
const PLACEHOLDER_PICTURE_PATTERNS = [
  '/t1.30497-1/',    // Meta CDN "no profile photo" directory
  'rsrc.php',        // sprite host (the grey .gif)
  '/static/images/', // occasional default-avatar path
];

/**
 * Host allowlist, which is the rule that actually holds.
 *
 * Real profile photos are always served from a `scontent*` CDN host —
 * scontent.xx.fbcdn.net, scontent-lhr8-1.cdninstagram.com, and so on. The
 * `static.*` hosts only ever serve application chrome: sprites, icons and
 * the default-avatar assets. So rather than chase individual placeholder
 * filenames (which Meta rotates), anything from a static host is treated as
 * a placeholder outright.
 *
 * Belt and braces with the patterns above: a placeholder served from a
 * scontent host still gets caught by path, and a real photo could never
 * come from a static host.
 */
const STATIC_ASSET_HOSTS = [
  'static.xx.fbcdn.net',
  'static.cdninstagram.com',
  'static.fbcdn.net',
];

export function isPlaceholderPictureUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (STATIC_ASSET_HOSTS.some((h) => url.includes(h))) return true;
  if (PLACEHOLDER_PICTURE_PATTERNS.some((p) => url.includes(p))) return true;
  // Profile photos are jpg/png/webp. A gif from any Meta CDN is chrome.
  if (url.includes('fbcdn.net') && url.split('?')[0].endsWith('.gif')) return true;
  return false;
}

/** Null out placeholder pictures on a single account. */
function scrubAccount<T extends { meta?: { picture_url?: string | null } | null }>(a: T): T {
  if (a?.meta && isPlaceholderPictureUrl(a.meta.picture_url)) {
    return { ...a, meta: { ...a.meta, picture_url: null } };
  }
  return a;
}

/** Null out placeholder pictures across a list response. */
function scrubAccounts<T extends { meta?: { picture_url?: string | null } | null }>(
  list: T[]
): T[] {
  return list.map(scrubAccount);
}

export const organicAccounts = {
  list: () =>
    api
      .get<{ accounts: OrganicAccount[] }>('/organic/accounts')
      .then((r) => ({ ...r, accounts: scrubAccounts(r.accounts) })),
  getOAuthUrl: (platform: OrganicPlatform) =>
    api.get<{ url: string }>(`/organic/accounts/oauth-url?platform=${platform}`),
  disconnect: (id: string) =>
    api.delete<{ ok: true }>(`/organic/accounts/${id}`),
  /** Threads uses its own OAuth endpoint (separate Meta App). */
  getThreadsOAuthUrl: () =>
    api.get<{ url: string }>(`/organic/threads/oauth-url`),
  /** TikTok uses its own OAuth endpoint (TikTok Login Kit). */
  getTikTokOAuthUrl: () =>
    api.get<{ url: string }>(`/organic/tiktok/oauth-url`),
  /** TikTok creator info — name/avatar + allowed privacy levels. Used
   *  by the composer to satisfy TikTok's mandatory pre-post UX. */
  getTikTokCreatorInfo: (accountId: string) =>
    api.get<{
      creatorUsername: string | null;
      creatorNickname: string | null;
      creatorAvatarUrl: string | null;
      privacyOptions: string[];
      commentDisabled: boolean;
      duetDisabled: boolean;
      stitchDisabled: boolean;
      maxVideoSeconds: number | null;
    }>(`/organic/tiktok/creator-info/${accountId}`),
  /** Quick-check whether an IG account is linked to a Threads profile. */
  threadsAutoLinkCheck: (igAccountId: string) =>
    api.get<{ threadsUserId: string | null; hasLinkedThreads: boolean }>(
      `/organic/threads/auto-link/${igAccountId}`
    ),
  /** LinkedIn uses its own OAuth endpoint. One authorization can connect
   *  the member's profile plus any company pages they administer. */
  getLinkedInOAuthUrl: () =>
    api.get<{ url: string }>(`/organic/linkedin/oauth-url`),
  /** LinkedIn company pages — separate Community Management app. */
  getLinkedInOrgOAuthUrl: () =>
    api.get<{ url: string }>(`/organic/linkedin-org/oauth-url`),
};

// =====================================================================
// Workspace Threads App credentials (Patch 4.34)
// =====================================================================

export interface ThreadsAppStatus {
  appId: string | null;
  hasSecret: boolean;
  redirectUri: string;
  hasCredentials: boolean;
}

export interface ThreadsAppInput {
  appId?: string;
  appSecret?: string;
  redirectUri?: string;
}

export const threadsApp = {
  get: () => api.get<ThreadsAppStatus>('/settings/threads-app'),
  save: (input: ThreadsAppInput) =>
    api.post<{ ok: true }>('/settings/threads-app', input),
};

export interface TikTokAppStatus {
  clientKey: string | null;
  hasSecret: boolean;
  redirectUri: string;
  hasCredentials: boolean;
}
export interface TikTokAppInput {
  clientKey?: string;
  clientSecret?: string;
  redirectUri?: string;
}
export const tiktokApp = {
  get: () => api.get<TikTokAppStatus>('/settings/tiktok-app'),
  save: (input: TikTokAppInput) =>
    api.post<{ ok: true }>('/settings/tiktok-app', input),
};

// =====================================================================
// Workspace LinkedIn App credentials (Patch 4.45.0)
// =====================================================================

export interface LinkedInAppStatus {
  clientId: string | null;
  hasSecret: boolean;
  redirectUri: string;
  hasCredentials: boolean;
}
export interface LinkedInAppInput {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}
export const linkedinApp = {
  get: () => api.get<LinkedInAppStatus>('/settings/linkedin-app'),
  save: (input: LinkedInAppInput) =>
    api.post<{ ok: true }>('/settings/linkedin-app', input),
};
/** Second LinkedIn app — Community Management API (company pages). Must be
 *  a separate developer app from the profile app per LinkedIn's rules. */
export const linkedinOrgApp = {
  get: () => api.get<LinkedInAppStatus>('/settings/linkedin-org-app'),
  save: (input: LinkedInAppInput) =>
    api.post<{ ok: true }>('/settings/linkedin-org-app', input),
};

// =====================================================================
// Brands — per-user groupings for organic social accounts (Patch 4.23)
// =====================================================================

export interface Brand {
  id: string;
  userId: string;
  name: string;
  color: string;
  sortOrder: number;
  /** First connected profile's picture URL for sidebar thumbnails.
      Null when the brand has no profiles. */
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBrandInput {
  name: string;
  color?: string;
}

export interface UpdateBrandInput {
  name?: string;
  color?: string;
  sortOrder?: number;
}

export const brands = {
  list: () =>
    api.get<{ brands: Brand[] }>('/brands').then((r) => ({
      ...r,
      // Brand thumbnails are derived from a profile picture, so they can
      // carry the same placeholder. Backend filters them too; this is the
      // belt to that pair of braces.
      brands: r.brands.map((b) =>
        isPlaceholderPictureUrl((b as { thumbnailUrl?: string | null }).thumbnailUrl)
          ? { ...b, thumbnailUrl: null }
          : b
      ),
    })),
  create: (input: CreateBrandInput) =>
    api.post<{ brand: Brand }>('/brands', input),
  update: (id: string, input: UpdateBrandInput) =>
    api.patch<{ brand: Brand }>(`/brands/${id}`, input),
  delete: (id: string) => api.delete<{ ok: true }>(`/brands/${id}`),
  assignAccount: (accountId: string, brandId: string | null) =>
    api.post<{ ok: true }>('/brands/assign-account', { accountId, brandId }),
};

// =====================================================================
// Organic posts — Publisher (Patch 4.25, extended in 4.29 for scheduling)
// =====================================================================

export type OrganicPostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'partial' | 'failed' | 'cancelled';
export type OrganicTargetStatus = 'pending' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'skipped';

export interface OrganicPostTargetInput {
  accountId: string;
  bodyOverride?: string | null;
  /** Per-network media override. When set, replaces the shared media for
   *  this target only. */
  mediaItems?: OrganicPostMediaItem[];
  /** Per-target LinkedIn document title (when this target's media is a PDF). */
  documentTitle?: string | null;
}

export interface OrganicPostMediaItem {
  uploadId: string;
  kind: 'image' | 'video' | 'document';
}

export interface PublishPostInput {
  body: string;
  /** @deprecated use mediaItems instead. Single legacy image upload id. */
  uploadId?: string | null;
  /** Ordered media. All-image (1-10) OR single video. Empty = text-only. */
  mediaItems?: OrganicPostMediaItem[];
  brandId?: string | null;
  /** ISO 8601 datetime. When set + future, post is scheduled. */
  scheduledFor?: string | null;
  /** Optional first comment, posted after the main post succeeds. */
  firstComment?: string | null;
  /** IG collaborators — up to 3 usernames. Silently dropped for FB
   *  targets since Meta doesn't expose collab invites for Pages. */
  collaborators?: string[] | null;
  /** Optional cover image for video posts (Reels). Upload ID of an
   *  image. IG applies via cover_url at container creation; FB applies
   *  post-publish (best-effort, swallowed on failure). */
  coverUploadId?: string | null;
  /** Threads-only: topic tag on the head post. Max 50 chars, no
   *  periods/ampersands/whitespace. Silently dropped by FB/IG. */
  topicTag?: string | null;
  /** LinkedIn-only: title for a PDF document post (max 100 chars).
   *  Required when a document is attached. */
  documentTitle?: string | null;
  /** Threads-only: up to 4 reply posts. Each entry has its own body
   *  (max 500 chars) and (optional) media. FB/IG drop the chain
   *  silently. */
  replyChain?: { body: string; mediaItems?: OrganicPostMediaItem[] }[];
  targets: OrganicPostTargetInput[];
  /** Patch 4.37.0: when true, the server saves with status='draft',
   *  skips schedule/publish, allows empty targets and empty body. */
  asDraft?: boolean;
}

export interface PublishPostResult {
  postId: string;
  status: OrganicPostStatus;
  /** Present on publish-now path. */
  succeeded?: number;
  failed?: number;
  /** Present on scheduled path. */
  scheduledFor?: string;
}

export interface OrganicPostSummary {
  id: string;
  brandId: string | null;
  body: string;
  uploadId: string | null;
  status: OrganicPostStatus;
  scheduledFor: string | null;
  publishedAt: string | null;
  createdAt: string;
  targetsTotal: number;
  targetsPublished: number;
  targetsFailed: number;
  platforms: OrganicPlatform[];
  /** Threads only — surfaces on the Pipeline card. */
  topicTag: string | null;
  /** Threads only — 0 = no reply chain; head + N replies = N. */
  replyChainLength: number;
}

export interface OrganicPostTarget {
  id: string;
  accountId: string;
  platform: OrganicPlatform;
  bodyOverride: string | null;
  status: OrganicTargetStatus;
  externalPostId: string | null;
  externalPostUrl: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  publishedAt: string | null;
  account: {
    name: string | null;
    username: string | null;
    pictureUrl: string | null;
  };
}

export interface OrganicPostMediaRow {
  id: string;
  uploadId: string;
  kind: 'image' | 'video' | 'document';
  sortOrder: number;
  replyIndex: number;
  contentType: string | null;
  widthPx: number | null;
  heightPx: number | null;
}

export interface OrganicPostDetail {
  post: {
    id: string;
    brandId: string | null;
    body: string;
    uploadId: string | null;
    status: OrganicPostStatus;
    scheduledFor: string | null;
    publishedAt: string | null;
    createdAt: string;
    firstComment: string | null;
    collaborators: string[];
    coverUploadId: string | null;
    topicTag: string | null;
    documentTitle: string | null;
    replyChain: { body: string }[];
  };
  media: OrganicPostMediaRow[];
  targets: OrganicPostTarget[];
}

export const organicPosts = {
  publish: (input: PublishPostInput) =>
    api.post<PublishPostResult>('/organic/posts', input),
  /** Patch 4.37.0: update an existing draft in place. Patch 4.41.0:
   *  also edits a SCHEDULED post in place (asDraft=false + scheduledFor),
   *  re-queuing its publish job. Returns the resulting status and, for
   *  scheduled edits, the (re-queued) scheduledFor. */
  update: (id: string, input: PublishPostInput) =>
    api.patch<{ postId: string; status: 'draft' | 'scheduled'; scheduledFor?: string | null }>(
      `/organic/posts/${id}`,
      input
    ),
  /** Patch 4.37.0: delete a draft. Server enforces status='draft'. */
  delete: (id: string) =>
    api.delete<{ ok: true }>(`/organic/posts/${id}`),
  list: () => api.get<{ posts: OrganicPostSummary[] }>('/organic/posts'),
  get: (id: string) => api.get<OrganicPostDetail>(`/organic/posts/${id}`),
  cancelSchedule: (id: string) =>
    api.delete<{ ok: true }>(`/organic/posts/${id}/schedule`),
  reschedule: (id: string, scheduledFor: string) =>
    api.patch<{ ok: true; scheduledFor: string }>(`/organic/posts/${id}/schedule`, { scheduledFor }),
};

// =====================================================================
// Drafts (Patch 4.37.0)
// =====================================================================

export interface OrganicDraft {
  id: string;
  brandId: string | null;
  body: string;
  topicTag: string | null;
  documentTitle: string | null;
  mediaUploadId: string | null;
  mediaKind: 'image' | 'video' | 'document' | null;
  platforms: OrganicPlatform[];
  /** Patch 4.37.0.1: account IDs this draft targets. Empty when the
   *  user saved without selecting any targets. */
  accountIds: string[];
  targetCount: number;
  createdAt: string;
  updatedAt: string;
}

export const organicDrafts = {
  /** Brand-scoped list of drafts. Pass brandId=null/undefined to list
   *  all of the user's drafts regardless of brand. Optionally filter
   *  to drafts that target at least one of the provided accountIds. */
  list: (brandId?: string | null, accountIds?: string[]) => {
    const qs = new URLSearchParams();
    if (brandId) qs.set('brandId', brandId);
    if (accountIds && accountIds.length > 0) {
      qs.set('accountIds', accountIds.join(','));
    }
    const suffix = qs.toString();
    return api.get<{ drafts: OrganicDraft[] }>(
      `/organic/drafts${suffix ? `?${suffix}` : ''}`
    );
  },
};

// =====================================================================
// Organic analytics (Patch 4.57)
// =====================================================================

export interface InsightMetricSet {
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number | null;
  saves: number | null;
  video_views: number | null;
  engagement: number | null;
  extra: Record<string, unknown>;
}

export interface AnalyticsPost {
  targetId: string;
  postId: string;
  accountId: string;
  platform: OrganicPlatform;
  publishedAt: string | null;
  body: string;
  metrics: InsightMetricSet;
}

export interface AnalyticsTotals {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  saves: number;
  videoViews: number;
  engagement: number;
}

export interface AnalyticsResponse {
  from: string;
  to: string;
  platform: string;
  postCount: number;
  totals: AnalyticsTotals;
  posts: AnalyticsPost[];
  /** Per-platform availability — false means a scope add or approval is needed. */
  availability: Record<string, { available: boolean; reason?: string }>;
}

export const organicAnalytics = {
  /** Aggregate analytics across a brand + account filter for a date range.
   *  Pass from/to as ISO date strings (default: last 7 days). Optional
   *  platform filter ('facebook_page'|'instagram'|'threads'|...). refresh=true
   *  forces a re-pull of even older posts. */
  get: (opts?: {
    brandId?: string | null;
    accountIds?: string[];
    from?: string;
    to?: string;
    platform?: string | null;
    refresh?: boolean;
  }) => {
    const qs = new URLSearchParams();
    if (opts?.brandId) qs.set('brandId', opts.brandId);
    if (opts?.accountIds && opts.accountIds.length > 0) {
      qs.set('accountIds', opts.accountIds.join(','));
    }
    if (opts?.from) qs.set('from', opts.from);
    if (opts?.to) qs.set('to', opts.to);
    if (opts?.platform && opts.platform !== 'all') qs.set('platform', opts.platform);
    if (opts?.refresh) qs.set('refresh', '1');
    const suffix = qs.toString();
    return api.get<AnalyticsResponse>(
      `/organic/analytics${suffix ? `?${suffix}` : ''}`
    );
  },
};

// =====================================================================
// Unified calendar (Patch 4.35)
//
// Returns Vass-tracked posts + posts pulled from Meta/Threads APIs by
// the hourly sync, merged and deduplicated. Used by the Pipeline view.
// =====================================================================

export type CalendarPostStatus =
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'partial'
  | 'failed'
  | 'cancelled';

export interface CalendarPost {
  /** Stable id within (source) — different ID spaces between 'vass'
   *  and 'synced'. The combination (source, id) is globally unique. */
  id: string;
  source: 'vass' | 'synced';
  status: CalendarPostStatus;
  brandId: string | null;
  body: string | null;
  /** ISO timestamp — scheduled_for for future Vass posts, published_at
   *  or posted_at for past. Calendar groups/sorts by this. */
  timestamp: string;
  /** For thumbnails. Either a Meta CDN URL ('https://...') OR
   *  'vass-upload:<uploadId>' which the client renders via uploads.fileUrl. */
  mediaUrl: string | null;
  mediaType: string | null;
  platforms: OrganicPlatform[];
  accountIds: string[];
  /** Click-through. Only present for 'published' posts. */
  permalink: string | null;
  topicTag: string | null;
  replyChainLength: number;
}

export interface LoadOlderInput {
  accountIds: string[];
  untilDate: string; // ISO
}

export const organicCalendar = {
  /** Get the merged + deduped calendar for a date range. */
  get: (params: {
    from: string;
    to: string;
    brandId?: string | null;
    accountIds?: string[];
    /** Which status buckets to include. Defaults to both on the server. */
    statuses?: Array<'scheduled' | 'published'>;
  }) => {
    const qs = new URLSearchParams({ from: params.from, to: params.to });
    if (params.brandId) qs.set('brandId', params.brandId);
    if (params.accountIds && params.accountIds.length > 0) {
      qs.set('accountIds', params.accountIds.join(','));
    }
    if (params.statuses && params.statuses.length > 0) {
      qs.set('statuses', params.statuses.join(','));
    }
    return api.get<{ posts: CalendarPost[] }>(`/organic/calendar?${qs.toString()}`);
  },
  /** Enqueue an on-demand backfill of older history (beyond the rolling
   *  90-day cron window). Returns once jobs are queued; the client should
   *  re-fetch the calendar after a few seconds. */
  loadOlder: (input: LoadOlderInput) =>
    api.post<{ ok: true; queued: number }>('/organic/calendar/load-older', input),
  /** Force a synchronous sync for a single account. Returns when complete.
   *  Used by the Pipeline's manual refresh button — gated to one account
   *  at a time because a sync can take 5–30 seconds against Meta. */
  refresh: (input: { accountId: string }) =>
    api.post<{ ok: boolean; fetched: number; upserted: number; pagesWalked: number; error: string | null }>(
      '/organic/calendar/refresh',
      input
    ),
};

// (Place search client removed in 4.32.5 — /pages/search now requires
//  Page Public Metadata Access app-review feature, which we don't have.)

// =====================================================================
// Brand hashtags (Patch 4.29)
// =====================================================================

export interface BrandHashtag {
  id: string;
  brandId: string;
  tag: string;
  sortOrder: number;
  createdAt: string;
}

export const brandHashtags = {
  list: (brandId: string) =>
    api.get<{ hashtags: BrandHashtag[] }>(`/brands/${brandId}/hashtags`),
  replace: (brandId: string, tags: string[]) =>
    api.put<{ hashtags: BrandHashtag[] }>(`/brands/${brandId}/hashtags`, { tags }),
};

// =====================================================================
// Ideas + folders (Patch 4.37.1)
// =====================================================================

export interface OrganicIdeaFolder {
  id: string;
  brandId: string;
  name: string;
  color: string | null;
  emoji: string | null;
  ideaCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrganicIdea {
  id: string;
  brandId: string | null;
  accountId: string | null;
  folderId: string | null;
  title: string | null;
  body: string;
  uploadId: string | null;
  mediaKind: 'image' | 'video' | 'document' | null;
  linkUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaCreateInput {
  /** Either brandId or accountId (or both) is required. When accountId
   *  is provided without brandId, the server auto-fills brandId from
   *  the account's parent brand. */
  brandId?: string | null;
  accountId?: string | null;
  folderId?: string | null;
  title?: string | null;
  body?: string;
  uploadId?: string | null;
  mediaKind?: 'image' | 'video' | 'document' | null;
  linkUrl?: string | null;
}

/** All fields optional. Only keys that appear in the payload are
 *  applied; missing keys leave the existing value untouched. To clear
 *  a field, pass `null` explicitly. */
export type IdeaUpdateInput = Partial<IdeaCreateInput>;

export interface FolderCreateInput {
  brandId: string;
  name: string;
  color?: string | null;
  emoji?: string | null;
}
export interface FolderUpdateInput {
  name?: string;
  color?: string | null;
  emoji?: string | null;
}

export const organicIdeaFolders = {
  list: (brandId?: string | null) => {
    const qs = brandId ? `?brandId=${encodeURIComponent(brandId)}` : '';
    return api.get<{ folders: OrganicIdeaFolder[] }>(`/organic/idea-folders${qs}`);
  },
  create: (input: FolderCreateInput) =>
    api.post<{ folder: OrganicIdeaFolder }>('/organic/idea-folders', input),
  update: (id: string, input: FolderUpdateInput) =>
    api.patch<{ folder: OrganicIdeaFolder }>(`/organic/idea-folders/${id}`, input),
  delete: (id: string) =>
    api.delete<{ ok: true }>(`/organic/idea-folders/${id}`),
};

/** List filter accepts arrays of brandIds and/or accountIds. When both
 *  are provided, the API returns the UNION (ideas matching any). Brand
 *  scope includes profile-tied ideas whose account belongs to the brand. */
export interface IdeasListFilter {
  brandIds?: string[];
  accountIds?: string[];
  folderId?: string | null;
}

export const organicIdeas = {
  /** Pass folderId='__unfiled__' to list only ideas with no folder. */
  list: (filter: IdeasListFilter = {}) => {
    const qs = new URLSearchParams();
    if (filter.brandIds && filter.brandIds.length) {
      qs.set('brandIds', filter.brandIds.join(','));
    }
    if (filter.accountIds && filter.accountIds.length) {
      qs.set('accountIds', filter.accountIds.join(','));
    }
    if (filter.folderId) qs.set('folderId', filter.folderId);
    const suffix = qs.toString();
    return api.get<{ ideas: OrganicIdea[] }>(
      `/organic/ideas${suffix ? `?${suffix}` : ''}`
    );
  },
  create: (input: IdeaCreateInput) =>
    api.post<{ idea: OrganicIdea }>('/organic/ideas', input),
  update: (id: string, input: IdeaUpdateInput) =>
    api.patch<{ idea: OrganicIdea }>(`/organic/ideas/${id}`, input),
  delete: (id: string) =>
    api.delete<{ ok: true }>(`/organic/ideas/${id}`),
};

// ============================================================
// Moodboard — per-brand visual reference board
// ============================================================

export type MoodboardKind = 'image' | 'swatch' | 'note' | 'link' | 'text';

/** Per-kind payloads. Discriminated by the item's `kind`. */
export interface MoodboardImageContent {
  uploadId?: string;
  url?: string;
  naturalWidth?: number;
  naturalHeight?: number;
}
export interface MoodboardSwatchContent {
  color: string;
}
export interface MoodboardNoteContent {
  text: string;
  color?: string;
}
export interface MoodboardTextContent {
  text: string;
  color?: string;
}
export interface MoodboardLinkContent {
  url: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  siteName?: string | null;
}

export interface MoodboardItem {
  id: string;
  brandId: string;
  kind: MoodboardKind;
  content:
    | MoodboardImageContent
    | MoodboardSwatchContent
    | MoodboardNoteContent
    | MoodboardLinkContent
    | MoodboardTextContent;
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
  width: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface UnfurlResult {
  url: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

export interface CreateMoodboardItemInput {
  brandId: string;
  kind: MoodboardKind;
  content:
    | MoodboardImageContent
    | MoodboardSwatchContent
    | MoodboardNoteContent
    | MoodboardLinkContent
    | MoodboardTextContent;
  x?: number;
  y?: number;
  rotation?: number;
}

export interface UpdateMoodboardItemInput {
  content?: MoodboardItem['content'];
  x?: number;
  y?: number;
  rotation?: number;
  zIndex?: number;
  width?: number | null;
}

export const organicMoodboard = {
  list: (brandId: string) =>
    api.get<{ items: MoodboardItem[]; limit: number }>(
      `/organic/moodboard?brandId=${encodeURIComponent(brandId)}`
    ),
  create: (input: CreateMoodboardItemInput) =>
    api.post<{ item: MoodboardItem }>('/organic/moodboard', input),
  update: (id: string, input: UpdateMoodboardItemInput) =>
    api.patch<{ item: MoodboardItem }>(`/organic/moodboard/${id}`, input),
  delete: (id: string) =>
    api.delete<{ ok: true }>(`/organic/moodboard/${id}`),
  unfurl: (url: string) =>
    api.post<{ meta: UnfurlResult }>('/organic/moodboard/unfurl', { url }),
  /** Pull a remote image's bytes server-side and store them as an upload —
   *  so a pasted/copied web image displays even when the source blocks
   *  hotlinking. Returns the new upload's id + dimensions. */
  fetchImage: (url: string) =>
    api.post<{ upload: { id: string; widthPx: number | null; heightPx: number | null } }>(
      '/organic/moodboard/fetch-image',
      { url }
    ),
  // ── Public sharing ──
  getShare: (brandId: string) =>
    api.get<{ token: string | null }>(
      `/organic/moodboard/share?brandId=${encodeURIComponent(brandId)}`
    ),
  createShare: (brandId: string) =>
    api.post<{ token: string }>('/organic/moodboard/share', { brandId }),
  revokeShare: (brandId: string) =>
    api.delete<{ ok: true }>(
      `/organic/moodboard/share?brandId=${encodeURIComponent(brandId)}`
    ),
  /** Public board fetch — no auth needed; the token is the grant. */
  getSharedBoard: (token: string) =>
    api.get<{ board: SharedMoodboard }>(
      `/organic/moodboard/public/${encodeURIComponent(token)}`
    ),
  /** <img src> for a shared image item's bytes (public, token-scoped). */
  sharedMediaUrl: (token: string, itemId: string) =>
    `/api/organic/moodboard/public/${encodeURIComponent(token)}/media/${itemId}`,
  /** Same-origin proxy for an external image URL — so it displays despite
   *  hotlink blocks and can be read into a PNG/PDF export. */
  imgProxyUrl: (url: string) =>
    `/api/organic/moodboard/img-proxy?url=${encodeURIComponent(url)}`,
  /** Public (share-page) variant of the image proxy. */
  sharedImgProxyUrl: (token: string, url: string) =>
    `/api/organic/moodboard/public/${encodeURIComponent(token)}/img-proxy?url=${encodeURIComponent(url)}`,
};

export interface SharedMoodboard {
  brand: { name: string; color: string };
  items: MoodboardItem[];
}

// ============================================================
// Tasks — per-user, per-brand to-do lists
// ============================================================

export interface Task {
  id: string;
  brandId: string;
  title: string;
  done: boolean;
  completedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** A task plus its brand's mark — used by the cross-brand dashboard box. */
export interface TaskWithBrand extends Task {
  brandName: string;
  brandColor: string;
}

export const organicTasks = {
  list: (brandId: string) =>
    api.get<{ tasks: Task[] }>(`/organic/tasks?brandId=${encodeURIComponent(brandId)}`),
  /** Cross-brand top-N for the dashboard box. */
  recent: (limit = 5) =>
    api.get<{ tasks: TaskWithBrand[] }>(`/organic/tasks/recent?limit=${limit}`),
  create: (brandId: string, title: string) =>
    api.post<{ task: Task }>('/organic/tasks', { brandId, title }),
  update: (id: string, patch: { title?: string; done?: boolean }) =>
    api.patch<{ task: Task }>(`/organic/tasks/${id}`, patch),
  delete: (id: string) => api.delete<{ ok: true }>(`/organic/tasks/${id}`),
};

// ============================================================
// Notifications — top-bar bell
// ============================================================

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export interface AppNotification {
  id: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export const notifications = {
  list: () =>
    api.get<{ notifications: AppNotification[]; unreadCount: number }>('/notifications'),
  /** Mark specific ids read, or all when omitted. */
  markRead: (ids?: string[]) =>
    api.post<{ updated: number }>('/notifications/read', ids ? { ids } : {}),
  clearAll: () => api.delete<{ deleted: number }>('/notifications'),
};
