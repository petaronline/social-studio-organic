/**
 * Root layout — wraps every page.
 *
 * Fonts: Geist Sans (display + body) + Geist Mono (code-ish bits).
 * Imported as `next/font` packages from `geist` — these inject CSS
 * variables (`--font-geist-sans`, `--font-geist-mono`) which the rest
 * of the app references via Tailwind's `font-sans`, `font-display`,
 * and `font-mono` utilities (see tailwind.config.js).
 *
 * We attach the variable classes on <html> so EVERY descendant —
 * including portal'd elements outside <body> — picks them up.
 */
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import localFont from 'next/font/local';
import '@/styles/globals.css';

// Casual Human — the handwritten face for moodboard notes. Self-hosted (CSP
// blocks external font hosts); exposed as --font-casual-human, wired to
// Tailwind's `font-hand`.
const casualHuman = localFont({
  src: [
    { path: '../fonts/CasualHuman.otf', weight: '400', style: 'normal' },
    { path: '../fonts/CasualHuman-Bold.otf', weight: '700', style: 'normal' },
  ],
  variable: '--font-casual-human',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'The Social Studio',
  description: 'Plan, write and schedule social. An internal tool by Hyper Studio.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${casualHuman.variable}`}>
      <body>{children}</body>
    </html>
  );
}
