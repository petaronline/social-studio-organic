'use client';

/**
 * PageHeader (Patch 4.39.0) — the one canonical page header for every
 * top-level page (paid + organic). Standardizes what had drifted apart
 * across Launch / Bulk launch / Sheets / Audit / Dashboard and the
 * organic pages.
 *
 * Layout (matches the old Bulk launch header, positioned like the
 * organic pages):
 *   [icon badge]  Title (text-3xl)            [right-side actions]
 *                 Description (text-sm muted)
 *
 * - `icon` is a Lucide icon component; it renders inside a rounded
 *   square tinted with `tint` (a per-product color).
 * - `actions` is an optional right-aligned slot (toggle, buttons).
 * - `activeOnly` / `onActiveOnlyChange`: when provided, renders the
 *   standardized "Active only" toggle on the right (pages that had the
 *   old "Show active only" / "Active only" toggle).
 */

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Toggle } from '@/components/Toggle';

export interface PageHeaderTint {
  /** Background of the icon badge (e.g. 'rgba(37,99,235,0.14)'). */
  bg: string;
  /** Icon foreground color (e.g. '#1D4ED8'). */
  fg: string;
}

export function PageHeader({
  icon: Icon,
  title,
  description,
  tint,
  badge,
  actions,
  activeOnly,
  onActiveOnlyChange,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  tint?: PageHeaderTint;
  /** Optional sticker beside the title — e.g. "week 30", "beta". Short. */
  badge?: string;
  actions?: ReactNode;
  activeOnly?: boolean;
  onActiveOnlyChange?: (v: boolean) => void;
}) {
  const t = tint ?? PAGE_TINTS.studio;
  const showToggle = typeof activeOnly === 'boolean' && !!onActiveOnlyChange;

  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ background: t.bg, color: t.fg }}
        >
          <Icon size={18} strokeWidth={2} />
        </div>
        <div>
          <h1 className="h-page">
            {title}
            {/* One sticker per screen, max — see the note in globals.css. */}
            {badge && <span className="sticker ml-2.5 align-[6px]">{badge}</span>}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-sm text-ink-muted">{description}</p>
          )}
        </div>
      </div>

      {(actions || showToggle) && (
        <div className="mt-1 flex shrink-0 items-center gap-2">
          {actions}
          {showToggle && (
            <>
              <span className="select-none text-xs font-medium text-ink-muted">Active only</span>
              <Toggle
                checked={activeOnly!}
                onChange={onActiveOnlyChange!}
                size="sm"
                label="Active only"
              />
            </>
          )}
        </div>
      )}
    </header>
  );
}

/**
 * Icon-badge tints, drawn from the platform palette in tailwind.config.js.
 *
 * These are NOT accent colours — the badge is a quiet wayfinding mark, so
 * every tint is a pale platform wash with its matching ink. Cherry is
 * deliberately absent: it belongs to the primary action, the active nav
 * item and the brand mark, and putting it here would dilute all three.
 */
export const PAGE_TINTS = {
  studio:     { bg: '#FFE1EC', fg: '#B4245C' },  // blush
  pipeline:   { bg: '#E2E3FF', fg: '#3A3BA8' },  // periwinkle
  drafts:     { bg: '#EFEDF6', fg: '#413B52' },  // neutral
  ideas:      { bg: '#ECE2FF', fg: '#5B2FB0' },  // lilac
  analytics:  { bg: '#D3F3E9', fg: '#0B6B52' },  // mint
  scheduled:  { bg: '#DDE8FF', fg: '#2547A8' },  // sky
  accounts:   { bg: '#FFE1EC', fg: '#B4245C' },
  team:       { bg: '#E2E3FF', fg: '#3A3BA8' },
} as const satisfies Record<string, PageHeaderTint>;
