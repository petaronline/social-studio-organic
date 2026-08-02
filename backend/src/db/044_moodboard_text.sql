-- =====================================================================
-- Moodboard: allow a fifth item kind, 'text' — a large title/heading laid
-- straight on the canvas (distinct from 'note', which is a post-it).
--
-- The kind CHECK was defined inline in 043, so Postgres named it
-- organic_moodboard_items_kind_check. Drop and re-add it with 'text'
-- included. IF EXISTS keeps this idempotent across environments.
-- =====================================================================

ALTER TABLE organic_moodboard_items
    DROP CONSTRAINT IF EXISTS organic_moodboard_items_kind_check;

ALTER TABLE organic_moodboard_items
    ADD CONSTRAINT organic_moodboard_items_kind_check
    CHECK (kind IN ('image', 'swatch', 'note', 'link', 'text'));
