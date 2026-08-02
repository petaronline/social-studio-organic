-- =====================================================================
-- Moodboard public sharing.
--
-- A brand's board can be published behind an unguessable token. One active
-- token per brand (brand_id is the PK), so re-sharing replaces it and the
-- old link dies. Deleting the row revokes the share. CASCADE on brand delete.
-- =====================================================================

CREATE TABLE organic_moodboard_shares (
    brand_id    UUID PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_moodboard_shares_token ON organic_moodboard_shares (token);
