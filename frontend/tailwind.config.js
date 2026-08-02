/** @type {import('tailwindcss').Config} */

/* ============================================================
   The Social Studio — design tokens
   ============================================================
   Direction, approved 2026-07-22:

   ONE loud colour. `cherry` appears on the primary action, the active
   nav item and the brand mark — nowhere else. That restraint is what
   makes it read as deliberate rather than decorative. If you find
   yourself reaching for cherry to make something stand out, the fix is
   almost always to quiet everything around it instead.

   Content is coloured by PLATFORM, not by status. A week of posts reads
   by colour before you read a word: blush = Instagram, sky = Facebook,
   mint = TikTok, periwinkle = LinkedIn, lilac = Threads. Status is
   carried by form — a dashed outline for drafts, a stripe for failures.

   Semantic red (`danger`) is deliberately ORANGE-leaning while cherry is
   PINK-leaning, so a destructive button never reads as a brand button.
   Do not collapse the two.

   Neutrals carry a slight violet bias so they belong to the same family
   as the lavender canvas — a pure grey here looks unconsidered.
   ============================================================ */

module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // ---- The one accent ----
        cherry: {
          DEFAULT: '#FF2D55',
          ink: '#B00A32',      // cherry as text on light, and the 2px "print" shadow under buttons
          wash: '#FFEDF1',     // faint tint for selected rows / subtle backgrounds
        },
        // Alias so existing `accent` usages keep working through the migration.
        // New code should say `cherry`.
        accent: {
          DEFAULT: '#FF2D55',
          hover: '#B00A32',
          subtle: '#FFEDF1',
          ring: '#FFA9BC',
        },

        // ---- Neutrals (violet-biased, chosen not inherited) ----
        ink: {
          DEFAULT: '#16131F',  // near-black with a violet lean
          muted: '#413B52',    // secondary text
          subtle: '#8A85A0',   // tertiary text, micro-labels ("haze" in the mockup)
        },
        canvas: {
          DEFAULT: '#E7E5F0',  // the lavender ground the app panel floats on
          deep: '#DCD9E9',
        },
        surface: {
          DEFAULT: '#FFFFFF',  // the app panel itself
          alt: '#F7F6FB',      // rails, inset panels, stat tiles
          hover: '#EFEDF6',    // hover on neutral elements, segmented-control track
        },
        line: {
          DEFAULT: '#E4E1EE',
          strong: '#D3CFE2',
        },

        // ---- Platform tints: content colour, never accent ----
        platform: {
          'ig': '#FFE1EC',      'ig-ink': '#B4245C',
          'fb': '#DDE8FF',      'fb-ink': '#2547A8',
          'tt': '#D3F3E9',      'tt-ink': '#0B6B52',
          'li': '#E2E3FF',      'li-ink': '#3A3BA8',
          'th': '#ECE2FF',      'th-ink': '#5B2FB0',
        },

        // ---- Semantic (separate from the accent) ----
        success: '#0F9D63',
        warning: '#E8A317',
        danger: '#D2352C',      // orange-leaning on purpose — see the note above
      },

      backgroundImage: {
        // Halftone dot field that bleeds off the canvas corner — the one
        // pop-culture flourish. See components/AppBackdrop.tsx.
        'halftone': 'radial-gradient(#FF2D55 1.5px, transparent 1.6px)',
      },
      backgroundSize: {
        // Distinct key from the backgroundImage above — Tailwind derives the
        // class name from the key, so reusing `halftone` here would emit two
        // different rules both called `bg-halftone` and one would win at random.
        'halftone-grid': '14px 14px',
      },

      fontFamily: {
        display: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        // Mono does real work here: micro-labels, timestamps, counters and
        // every figure in a stat tile. It is what stops this looking like
        // every other SaaS dashboard.
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
        // Handwriting, for moodboard notes + marker scrawl. No web font
        // (CSP blocks them) — a cursive system stack that resolves to
        // something handwritten on every OS.
        hand: ['"Bradley Hand"', '"Segoe Print"', '"Comic Sans MS"', 'ui-rounded', 'cursive'],
      },

      fontSize: {
        '2xs': ['0.625rem',  { lineHeight: '0.875rem' }],  // 10px — mono micro-labels
        'xs':  ['0.75rem',   { lineHeight: '1.125rem' }],
        'sm':  ['0.8125rem', { lineHeight: '1.25rem' }],   // 13px
        'base':['0.9375rem', { lineHeight: '1.5rem' }],    // 15px
        'lg':  ['1.0625rem', { lineHeight: '1.5rem' }],
        'xl':  ['1.25rem',   { lineHeight: '1.625rem', letterSpacing: '-0.02em' }],
        '2xl': ['1.5rem',    { lineHeight: '1.875rem', letterSpacing: '-0.025em' }],
        '3xl': ['1.875rem',  { lineHeight: '1.15',     letterSpacing: '-0.035em' }],
        '4xl': ['2.375rem',  { lineHeight: '1.05',     letterSpacing: '-0.04em' }],
        '5xl': ['3.25rem',   { lineHeight: '1',        letterSpacing: '-0.045em' }],
      },

      borderRadius: {
        // Rounder than before — the direction is friendly, not severe.
        'sm': '0.5rem',         // 8px  — small chips
        'DEFAULT': '0.6875rem', // 11px — buttons, nav items
        'md': '0.75rem',        // 12px — post chips
        'lg': '0.9375rem',      // 15px — stat tiles, inset panels
        'xl': '1.375rem',       // 22px — cards
        '2xl': '1.625rem',      // 26px — the app panel itself
      },

      boxShadow: {
        'subtle': '0 1px 2px rgba(22,19,31,.04)',
        'card':   '0 1px 2px rgba(22,19,31,.04), 0 12px 32px -12px rgba(22,19,31,.14)',
        'lift':   '0 2px 6px rgba(22,19,31,.06), 0 24px 60px -20px rgba(22,19,31,.24)',
        // The "print" shadow under cherry buttons — hard 2px offset, no blur.
        // Reads as a sticker/screenprint rather than a soft UI drop shadow.
        'print':  '0 2px 0 #B00A32',
        'focus':  '0 0 0 3px rgba(255,45,85,.22)',

        // Compatibility aliases. The previous design was a "liquid glass"
        // look and `shadow-glass` / `shadow-glass-lift` are still on ~11
        // components. Rather than sweep every file mid-redesign (a large
        // diff with nothing to show for it), the names now resolve to the
        // new flatter shadows. Retire them as each component is touched.
        'glass':      '0 1px 2px rgba(22,19,31,.04), 0 12px 32px -12px rgba(22,19,31,.14)',
        'glass-lift': '0 2px 6px rgba(22,19,31,.06), 0 24px 60px -20px rgba(22,19,31,.24)',
      },

      backdropBlur: {
        // Same story as the shadow aliases above — `backdrop-blur-card` is
        // still in use. The new shell is mostly opaque, so this now does
        // very little, which is the intended end state.
        'card': '10px',
      },

      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'shimmer': 'shimmer 2.4s linear infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
