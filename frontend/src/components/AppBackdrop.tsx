'use client';

/**
 * AppBackdrop — what sits behind the floating app panel.
 *
 * The previous design painted a four-corner watercolour gradient plus a
 * per-route hue, then floated translucent "glass" surfaces on top. The
 * approved direction replaces all of that with a single flat lavender
 * canvas (`bg-canvas`, set on <body>) and exactly one flourish: a
 * halftone dot field in cherry, bleeding off the top-right corner and
 * faded out with a radial mask.
 *
 * That's the whole backdrop. The restraint is deliberate — the app panel
 * is white and busy, so anything more behind it competes.
 *
 * Ignores pointer events; sits below the panel at z-0.
 */

export function AppBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed -top-32 -right-32 z-0 h-[560px] w-[560px]
 bg-halftone bg-halftone-grid opacity-[0.18]"
      style={{
        // Fade the dot field out toward its edges so it reads as printed
        // ink bleeding off the page rather than a tiled texture with a
        // hard boundary.
        WebkitMaskImage:
          'radial-gradient(circle at 70% 30%, #000 0%, transparent 68%)',
        maskImage:
          'radial-gradient(circle at 70% 30%, #000 0%, transparent 68%)',
      }}
    />
  );
}
