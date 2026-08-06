-- =====================================================================
-- Tasks get an end date and a tag.
--
-- due_date is a calendar day (no time) — a task is "due Aug 12", not
-- "due 14:30". tag is a single freeform label (e.g. "content", "urgent").
-- =====================================================================

ALTER TABLE organic_tasks
    ADD COLUMN due_date DATE,
    ADD COLUMN tag      TEXT;
