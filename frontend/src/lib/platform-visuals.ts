/**
 * Platform visuals — the single source of truth for "what colour is this post?".
 *
 * The approved design tints content by PLATFORM, not by status. A week of
 * posts should read by colour before you read a word: blush is Instagram,
 * sky is Facebook, mint is TikTok, periwinkle is LinkedIn, lilac is Threads.
 *
 * Status is carried by FORM instead — a dashed border for drafts, a left
 * stripe for anything that needs attention. That split is deliberate: hue
 * answers "where is this going", form answers "is it OK". Encoding both in
 * hue is what made the old calendar unreadable once a week held more than a
 * handful of posts.
 *
 * Values mirror `platform.*` in tailwind.config.js. They're duplicated here
 * as hex because several consumers need inline styles (absolutely-positioned
 * calendar cards computing their own background), and a Tailwind class can't
 * be handed to a style attribute. If you change one, change both.
 */

export type PlatformKey =
  | 'facebook_page'
  | 'instagram'
  | 'threads'
  | 'tiktok'
  | 'linkedin';

export interface PlatformVisual {
  /** Tailwind chip class — pairs background + ink. Use where a class works. */
  chip: string;
  /** Pale background, for inline styles. */
  bg: string;
  /** Readable foreground on `bg`. Also the stripe/dot colour. */
  ink: string;
  /** Two-letter tag for dense rows where an icon is too much. */
  tag: string;
  label: string;
}

const FALLBACK: PlatformVisual = {
  chip: 'chip-draft',
  bg: '#F7F6FB',
  ink: '#413B52',
  tag: '··',
  label: 'Unknown',
};

export const PLATFORM_VISUALS: Record<PlatformKey, PlatformVisual> = {
  instagram:     { chip: 'chip-ig', bg: '#FFE1EC', ink: '#B4245C', tag: 'IG', label: 'Instagram' },
  facebook_page: { chip: 'chip-fb', bg: '#DDE8FF', ink: '#2547A8', tag: 'FB', label: 'Facebook' },
  tiktok:        { chip: 'chip-tt', bg: '#D3F3E9', ink: '#0B6B52', tag: 'TT', label: 'TikTok' },
  linkedin:      { chip: 'chip-li', bg: '#E2E3FF', ink: '#3A3BA8', tag: 'LI', label: 'LinkedIn' },
  threads:       { chip: 'chip-th', bg: '#ECE2FF', ink: '#5B2FB0', tag: 'TH', label: 'Threads' },
};

/** Visuals for a platform, tolerant of unknown/empty values from the API. */
export function platformVisual(platform: string | null | undefined): PlatformVisual {
  if (!platform) return FALLBACK;
  return PLATFORM_VISUALS[platform as PlatformKey] ?? FALLBACK;
}

/**
 * Visuals for a post that may target several platforms at once.
 *
 * A cross-posted item has no single true colour, so rather than pick one
 * arbitrarily (or blend into mud) it falls back to the neutral chip. The
 * per-target platform dots on the card carry the detail.
 */
export function multiPlatformVisual(platforms: readonly string[]): PlatformVisual {
  const unique = Array.from(new Set(platforms.filter(Boolean)));
  if (unique.length === 1) return platformVisual(unique[0]);
  return FALLBACK;
}
