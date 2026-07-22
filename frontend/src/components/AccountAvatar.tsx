/**
 * Avatar for a connected social profile.
 *
 * Renders the profile picture when there is one. When there isn't — which is
 * often, since Meta withholds Page pictures for plenty of accounts — it falls
 * back to TWO letters on the platform's own tint, the same treatment the
 * approved design uses in the profile rail.
 *
 * Two letters, not one: with a dozen Facebook Pages in a workspace, single
 * initials collide constantly ("T" for Teen Star, Tracara and The Berlin).
 * The tint comes from the platform rather than a hash of the name, so an
 * avatar always agrees with the colour that post chips, stripes and the rail
 * use for the same network — a hashed palette looked arbitrary next to them.
 *
 * Falls back at runtime too: a broken image URL flips to initials on error.
 */
'use client';

import { useState } from 'react';
import { platformVisual } from '@/lib/platform-visuals';
import { isPlaceholderPictureUrl } from '@/lib/api';

export { isPlaceholderPictureUrl as isPlaceholderPicture };

interface Props {
  name: string;
  pictureUrl: string | null;
  /** Platform key — drives the fallback tint. Omit for a neutral fallback. */
  platform?: string | null;
  size?: number;
  /** `rounded` matches the rail's squircle; `circle` suits inline rows. */
  shape?: 'circle' | 'rounded';
  className?: string;
}

/** Up to two letters: initials of the first two words, else the first two
 *  characters. Digits are kept — plenty of handles start with them. */
export function avatarInitials(name: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '??';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function AccountAvatar({
  name,
  pictureUrl,
  platform,
  size = 24,
  shape = 'circle',
  className,
}: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  // Two ways to end up on initials: the image 404s (expired signed URL), or
  // it loads perfectly and happens to be Meta's own grey placeholder.
  const showImage = pictureUrl && !imgFailed && !isPlaceholderPictureUrl(pictureUrl);
  const radius = shape === 'circle' ? '9999px' : `${Math.max(6, size * 0.3)}px`;

  if (showImage) {
    return (
      <img
        src={pictureUrl}
        alt={name}
        width={size}
        height={size}
        onError={() => setImgFailed(true)}
        className={['shrink-0 object-cover', className].filter(Boolean).join(' ')}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  const pv = platformVisual(platform);
  // Two glyphs need more room than one, so this runs a touch smaller than a
  // single-initial avatar would.
  const fontSize = Math.max(9, Math.floor(size * 0.36));

  return (
    <span
      aria-hidden
      className={['inline-flex shrink-0 items-center justify-center font-mono font-bold', className]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: pv.bg,
        color: pv.ink,
        fontSize,
        lineHeight: 1,
        letterSpacing: '-0.02em',
      }}
    >
      {avatarInitials(name)}
    </span>
  );
}
