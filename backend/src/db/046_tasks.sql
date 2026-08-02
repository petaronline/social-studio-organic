-- =====================================================================
-- Task lists — per user, per brand. A lightweight to-do list (Reminders /
-- Superlist style): each task is a line with a checkbox. Checking it marks
-- it done (strikethrough in the UI); done or not, it can be deleted.
--
-- Scoped per brand so each brand keeps its own list, but the dashboard box
-- pulls a cross-brand top-5, which is why every row also carries brand_id.
-- =====================================================================

CREATE TABLE organic_tasks (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    brand_id     UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    done         BOOLEAN NOT NULL DEFAULT false,
    -- Set when done flips true, cleared when it flips back. Lets the list
    -- sort done items by when they were finished if we ever want that.
    completed_at TIMESTAMPTZ,
    -- Manual ordering within a brand's list. Lower = higher up.
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT task_title_not_empty CHECK (length(trim(title)) > 0)
);

CREATE INDEX idx_tasks_brand ON organic_tasks (brand_id, done, sort_order, created_at);
CREATE INDEX idx_tasks_user_recent ON organic_tasks (user_id, done, created_at DESC);

CREATE TRIGGER organic_tasks_updated_at
    BEFORE UPDATE ON organic_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
