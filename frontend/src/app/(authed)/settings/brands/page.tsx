'use client';

/**
 * Settings → Brands (Patch 4.38.2 — rebuilt to match the Social
 * profiles shell).
 *
 * Left rail: brand groupings (Unassigned + brands), drag targets,
 *   first-member-avatar thumbnails. This is the canonical place to
 *   create / rename / recolor / delete brands.
 * Main panel: the social profiles in the selected grouping, each a
 *   draggable row you drop onto a brand.
 *
 * The Social profiles page shares the same rail; this page is the
 * brand-first view of the same assignments.
 */

import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  Search, CheckCircle2, AlertCircle,
  Facebook, Instagram, AtSign,
} from 'lucide-react';
import {
  brands as brandsApi,
  organicAccounts,
  ApiError,
  type Brand,
  type OrganicAccount,
  type OrganicPlatform,
} from '@/lib/api';
import {
  BrandGroupingRail,
  UNASSIGNED_ID,
} from '@/components/settings/BrandGroupingRail';
import { BrandHashtagsSection } from '@/components/settings/BrandHashtagsSection';
import { AccountAvatar } from '@/components/AccountAvatar';

interface Toast { id: number; type: 'success' | 'error'; message: string; }
let toastCounter = 0;

/** A profile that can be dropped into a brand. The ads app also grouped ad
 *  accounts here; `kind` is kept so the drag payload format is unchanged. */
type UnifiedAccount = {
  kind: 'organic';
  id: string;
  name: string;
  sub: string;
  pictureUrl: string | null;
  brandId: string | null;
  platform: OrganicPlatform;
};

export default function BrandsPage() {
  const [brandList, setBrandList] = useState<Brand[]>([]);
  const [organic, setOrganic] = useState<OrganicAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>(UNASSIGNED_ID);
  const [search, setSearch] = useState('');
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [brandsRes, organicRes] = await Promise.all([
        brandsApi.list(),
        organicAccounts.list(),
      ]);
      setBrandList(brandsRes.brands);
      setOrganic(organicRes.accounts);
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  // ─── Accounts groupable under a brand ────────────────────────────
  // In the ads app this unified organic profiles with ad accounts. Here
  // only organic profiles exist, but the UnifiedAccount shape is kept so
  // the rail and drag-drop code below are untouched.
  const allAccounts: UnifiedAccount[] = useMemo(() => {
    const o: UnifiedAccount[] = organic.map((a) => ({
      kind: 'organic',
      id: a.id,
      name: a.meta?.name || a.meta?.username || a.externalId,
      sub:
        a.platform === 'facebook_page' ? 'Facebook page'
        : a.platform === 'instagram' ? 'Instagram'
        : a.platform === 'threads' ? 'Threads'
        : a.platform,
      pictureUrl: a.meta?.picture_url ?? null,
      brandId: a.brandId,
      platform: a.platform,
    }));
    return o;
  }, [organic]);

  // ─── Assignment ──────────────────────────────────────────────────
  const assign = async (acct: UnifiedAccount, targetBrandId: string | null) => {
    if (acct.brandId === targetBrandId) return;
    const apply = (bid: string | null) => {
      setOrganic((prev) => prev.map((x) => (x.id === acct.id ? { ...x, brandId: bid } : x)));
    };
    apply(targetBrandId);
    try {
      await brandsApi.assignAccount(acct.id, targetBrandId);
    } catch (err) {
      apply(acct.brandId);
      addToast('error', err instanceof ApiError ? err.message : 'Failed to move account');
    }
  };

  // ─── Brand CRUD ──────────────────────────────────────────────────
  const createBrand = async (name: string, color: string) => {
    try {
      const r = await brandsApi.create({ name, color });
      setBrandList((prev) => [...prev, r.brand]);
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to create brand');
    }
  };
  const renameBrand = async (id: string, name: string) => {
    try {
      const r = await brandsApi.update(id, { name });
      setBrandList((prev) => prev.map((b) => (b.id === id ? r.brand : b)));
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to rename brand');
    }
  };
  const recolorBrand = async (id: string, color: string) => {
    setBrandList((prev) => prev.map((b) => (b.id === id ? { ...b, color } : b)));
    try {
      await brandsApi.update(id, { color });
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to recolor brand');
    }
  };
  const deleteBrand = async (id: string) => {
    const b = brandList.find((x) => x.id === id);
    if (!b) return;
    if (!confirm(`Delete brand "${b.name}"? Its accounts become unassigned.`)) return;
    try {
      await brandsApi.delete(id);
      setBrandList((prev) => prev.filter((x) => x.id !== id));
      setOrganic((prev) => prev.map((a) => (a.brandId === id ? { ...a, brandId: null } : a)));
      if (selectedId === id) setSelectedId(UNASSIGNED_ID);
    } catch (err) {
      addToast('error', err instanceof ApiError ? err.message : 'Failed to delete brand');
    }
  };

  // ─── Drag ────────────────────────────────────────────────────────
  const handleDragStart = (e: DragEvent, acct: UnifiedAccount) => {
    e.dataTransfer.setData('text/vass-unified', `${acct.kind}:${acct.id}`);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOverBrand = (e: DragEvent<HTMLLIElement>, brandId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(brandId);
  };
  const handleDropOnBrand = (e: DragEvent<HTMLLIElement>, targetBrandId: string) => {
    e.preventDefault();
    setDragOverId(null);
    const payload = e.dataTransfer.getData('text/vass-unified');
    if (!payload) return;
    const [kind, id] = payload.split(':');
    const acct = allAccounts.find((a) => a.id === id && a.kind === kind);
    if (!acct) return;
    assign(acct, targetBrandId === UNASSIGNED_ID ? null : targetBrandId);
  };

  // ─── Derived ─────────────────────────────────────────────────────
  const unassignedCount = useMemo(() => allAccounts.filter((a) => !a.brandId).length, [allAccounts]);
  const countForBrand = useCallback(
    (brandId: string) => allAccounts.filter((a) => a.brandId === brandId).length,
    [allAccounts]
  );
  const thumbnailForBrand = useCallback(
    (brandId: string) => allAccounts.find((a) => a.brandId === brandId && a.pictureUrl)?.pictureUrl ?? null,
    [allAccounts]
  );

  const visibleAccounts = useMemo(() => {
    let list = allAccounts.filter((a) =>
      selectedId === UNASSIGNED_ID ? !a.brandId : a.brandId === selectedId
    );
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((a) => a.name.toLowerCase().includes(q));
    return list;
  }, [allAccounts, selectedId, search]);

  const selectedBrand = brandList.find((b) => b.id === selectedId);
  const groupLabel = selectedId === UNASSIGNED_ID ? 'Unassigned' : selectedBrand?.name ?? '';

  return (
    <div className="relative">
      {/* Toasts */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 w-80">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              'flex items-start gap-3 px-4 py-3 rounded-lg shadow-lift border text-sm animate-slide-up',
              t.type === 'success' ? 'bg-white border-success/30 text-ink' : 'bg-white border-danger/30 text-ink',
            ].join(' ')}
          >
            {t.type === 'success' ? (
              <CheckCircle2 size={16} className="text-success shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={16} className="text-danger shrink-0 mt-0.5" />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="mb-6">
        <h2 className="h-section text-ink">Brands</h2>
        <p className="text-sm text-ink-muted mt-0.5 max-w-2xl">
          Group your social profiles into brands. Drag any profile into a brand to assign
          it. A brand represents one client, and scopes what you see across Studio,
          Pipeline and Analytics.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Left rail */}
        <BrandGroupingRail
          brands={brandList}
          selectedId={selectedId}
          onSelect={setSelectedId}
          unassignedCount={unassignedCount}
          countForBrand={countForBrand}
          thumbnailForBrand={thumbnailForBrand}
          dragOverId={dragOverId}
          onDragOverBrand={handleDragOverBrand}
          onDragLeaveBrand={() => setDragOverId(null)}
          onDropOnBrand={handleDropOnBrand}
          onCreateBrand={createBrand}
          onRenameBrand={renameBrand}
          onRecolorBrand={recolorBrand}
          onDeleteBrand={deleteBrand}
        />

        {/* Main panel */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedBrand?.color ?? '#9CA3AF' }} />
              <h3 className="h-sub text-ink">{groupLabel}</h3>
              <span className="text-xs text-ink-subtle">({visibleAccounts.length})</span>
            </div>
            {/* The ads app had an All / Profiles / Ad accounts filter here.
                Everything groupable is a social profile now, so the control
                only ever had one meaningful state — removed. */}
          </div>

          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts…"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-line bg-white text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent"
            />
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center text-sm text-ink-subtle">Loading…</div>
          ) : visibleAccounts.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-ink-subtle border border-dashed border-line rounded-lg">
              {search ? 'No matches.' : selectedId === UNASSIGNED_ID
                ? 'Nothing unassigned in this view.'
                : 'No accounts in this brand yet. Drag accounts from Unassigned.'}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleAccounts.map((a) => (
                <UnifiedAccountCard key={`${a.kind}:${a.id}`} acct={a} onDragStart={handleDragStart} />
              ))}
            </div>
          )}

          {/* Brand hashtags — only for a real brand (not Unassigned).
              Surfaced as quick-insert chips in the composer toolbar. */}
          {selectedId !== UNASSIGNED_ID && selectedBrand && (
            <BrandHashtagsSection
              key={selectedBrand.id}
              brandId={selectedBrand.id}
              onError={(m) => addToast('error', m)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Unified account row ─────────────────────────────────────────────

function UnifiedAccountCard({
  acct,
  onDragStart,
}: {
  acct: UnifiedAccount;
  onDragStart: (e: DragEvent, a: UnifiedAccount) => void;
}) {
  const Icon =
    acct.platform === 'facebook_page' ? Facebook
    : acct.platform === 'instagram' ? Instagram
    : AtSign;
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, acct)}
      className="flex items-center gap-3 bg-surface border border-line rounded-lg shadow-subtle px-4 py-3 cursor-grab active:cursor-grabbing"
    >
      {/* AccountAvatar handles both "no picture" and "Meta's placeholder
          picture", so a pictureless Page shows letters rather than a grey
          question mark. */}
      <AccountAvatar
        name={acct.name}
        pictureUrl={acct.pictureUrl}
        platform={acct.kind === 'organic' ? acct.platform : null}
        size={36}
        shape="rounded"
      />

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink truncate">{acct.name}</div>
        <div className="text-xs text-ink-subtle">{acct.sub}</div>
      </div>
      <span className="text-2xs px-2 py-0.5 rounded-full shrink-0 bg-surface-hover text-ink-subtle">
        Profile
      </span>
    </div>
  );
}
