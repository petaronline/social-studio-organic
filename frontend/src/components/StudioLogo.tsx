/**
 * The Social Studio logo.
 *
 * Two-tone wordmark: "The Social" in muted weight, "Studio" in full weight,
 * so the eye lands on the word that matters at small sizes. The arrow accent
 * from the original Vass mark is kept — it reads as "publish / send out",
 * which is if anything more apt here than it was for ads.
 *
 * Variants:
 *   - "full":     the wordmark + accent arrow (sidebar, login)
 *   - "mark":     just the arrow in a rounded square (favicon, tight spaces)
 *   - "wordmark": text only, no arrow
 *
 * Sizes are all derived from `height` so the lockup scales as one unit.
 */
import React from 'react';

interface StudioLogoProps {
  variant?: 'full' | 'mark' | 'wordmark';
  className?: string;
  height?: number;
  color?: string;
  background?: string;
}

/** Muted tone for the leading "The Social", derived from the main colour. */
const MUTED_OPACITY = 0.55;

export function StudioLogo({
  variant = 'full',
  className = '',
  height = 28,
  color = 'currentColor',
  background = '#0F766E',
}: StudioLogoProps) {
  if (variant === 'mark') {
    // Arrow inside a rounded square — for favicon / tight spaces
    return (
      <div
        className={`inline-flex items-center justify-center rounded ${className}`}
        style={{ width: height, height, background }}
        aria-label="The Social Studio"
      >
        <svg
          viewBox="0 0 24 24"
          width={height * 0.6}
          height={height * 0.6}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M6 18 L18 6 M9 6 L18 6 L18 15"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  const wordmark = (
    <span
      style={{
        color,
        fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
        fontSize: `${height * 0.62}px`,
        letterSpacing: '-0.03em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontWeight: 400, opacity: MUTED_OPACITY }}>The Social </span>
      <span style={{ fontWeight: 700 }}>Studio</span>
    </span>
  );

  if (variant === 'wordmark') {
    return (
      <span className={className} aria-label="The Social Studio">
        {wordmark}
      </span>
    );
  }

  // Full: wordmark + small arrow accent
  return (
    <div
      className={`inline-flex items-baseline ${className}`}
      style={{ gap: height * 0.08 }}
      aria-label="The Social Studio"
    >
      {wordmark}
      <svg
        viewBox="0 0 24 24"
        width={height * 0.3}
        height={height * 0.3}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ marginBottom: height * 0.04 }}
      >
        <path
          d="M6 18 L18 6 M9 6 L18 6 L18 15"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
