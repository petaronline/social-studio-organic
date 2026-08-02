-- =====================================================================
-- Moodboard — a per-brand visual reference board.
--
-- Each brand gets one implicit board (no separate board row): the board
-- IS the set of items sharing a brand_id. Items are freeform — every one
-- carries its own position, rotation and stacking order so the "messy"
-- collage view can persist exactly how the user arranged it. The
-- "pinterest" view ignores position and lays the same items out in a
-- masonry grid ordered by z_index.
--
-- Four kinds, discriminated by `kind`, payload in `content` JSONB:
--   image   { uploadId }              — an uploaded file (content-addressed)
--           { url }                    — a pasted external image URL
--   swatch  { color: '#RRGGBB' }       — a colour block
--   note    { text, color? }           — a post-it, handwritten font
--   link    { url, title, description?, — an iMessage-style link card,
--             imageUrl?, siteName? }     unfurled server-side on add
--
-- The 20-items-per-brand cap the product calls for is enforced in the
-- service (a COUNT before INSERT), not here — a CHECK can't count rows.
-- =====================================================================

CREATE TABLE organic_moodboard_items (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    -- The board this item lives on. CASCADE: deleting a brand clears its
    -- board, matching how brands own everything else beneath them.
    brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,

    kind        TEXT NOT NULL CHECK (kind IN ('image', 'swatch', 'note', 'link')),
    content     JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Messy-view placement. Pixel offsets from the board's top-left, at the
    -- reference canvas width; the client scales them. Rotation in degrees.
    x           REAL NOT NULL DEFAULT 0,
    y           REAL NOT NULL DEFAULT 0,
    rotation    REAL NOT NULL DEFAULT 0,
    -- Stacking order in messy view AND sort order in pinterest view. Higher
    -- sits on top / comes first. Bumped to (max+1) when an item is touched.
    z_index     INTEGER NOT NULL DEFAULT 0,
    -- Optional pinned width in px (images the user resized). NULL = natural.
    width       REAL,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_moodboard_brand ON organic_moodboard_items (brand_id, z_index);
CREATE INDEX idx_moodboard_user  ON organic_moodboard_items (user_id);

CREATE TRIGGER organic_moodboard_items_updated_at
    BEFORE UPDATE ON organic_moodboard_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE organic_moodboard_items IS
    'Per-brand moodboard: freeform image/swatch/note/link cards. One board per brand (= shared brand_id). 20-item cap enforced in the service.';
