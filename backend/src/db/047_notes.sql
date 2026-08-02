-- =====================================================================
-- Notes & meeting notes — per user, per brand (Superlist-style).
--
-- Two kinds, discriminated by `type`:
--   note     — a free rich-text note
--   meeting  — same body, plus a meeting time + attendees header
--
-- Body is the editor's HTML (headings, lists, checklists, formatting). Kept
-- per brand like tasks/moodboard; each brand has its own notebook.
-- =====================================================================

CREATE TABLE organic_notes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,

    type        TEXT NOT NULL DEFAULT 'note' CHECK (type IN ('note', 'meeting')),
    title       TEXT NOT NULL DEFAULT '',
    -- Editor HTML. Sanitised on write (see services/notes.ts).
    body        TEXT NOT NULL DEFAULT '',

    -- Meeting-only header fields (NULL for plain notes).
    meeting_at  TIMESTAMPTZ,
    attendees   TEXT,

    pinned      BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notes_brand ON organic_notes (brand_id, pinned DESC, updated_at DESC);
CREATE INDEX idx_notes_user_recent ON organic_notes (user_id, updated_at DESC);

CREATE TRIGGER organic_notes_updated_at
    BEFORE UPDATE ON organic_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
