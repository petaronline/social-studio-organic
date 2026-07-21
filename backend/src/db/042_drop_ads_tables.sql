-- 042_drop_ads_tables.sql
-- Vass Organic — remove the ads-side schema.
--
-- WHY THIS EXISTS INSTEAD OF A SQUASHED o001_initial:
--
-- Migrations 001–041 are carried over from the ads app BYTE-FOR-BYTE on
-- purpose. Hand-transcribing 41 files of accumulated CREATEs and ALTERs into
-- one "clean" initial migration is a silent-corruption risk: a single missed
-- ALTER, DEFAULT, or CHECK constraint produces a schema that looks right and
-- diverges from the live one — which then breaks the pg_dump/restore of real
-- organic rows out of the production database.
--
-- So we replay the exact same history the live database already has (which
-- guarantees the restore target matches column-for-column) and then drop what
-- Organic doesn't own, in one auditable step. Squash later, once the
-- standalone app has been running on real data for a while.
--
-- Dropped here (10 tables, all ads-domain):
--   ad_accounts, account_launch_defaults, copy_templates,
--   launch_batches, ad_launches, audit_runs, audit_findings,
--   comment_guards, comment_guard_targets, comment_guard_actions
--
-- Comment Guard stays in the ads app. It is ads-scoped (campaigns, ad sets,
-- ads) and only borrowed Organic's Page tokens; the ads app now requests its
-- own page_* scopes rather than reading organic_connected_accounts.
--
-- Deliberately NOT using CASCADE. Every foreign key into these tables comes
-- from another table in this same list, so ordered drops succeed on their own.
-- If a future migration adds an FK from a table Organic keeps, this migration
-- will fail loudly instead of silently dropping that table's data.

-- Comment Guard (children first: actions → targets → guards)
DROP TABLE IF EXISTS comment_guard_actions;
DROP TABLE IF EXISTS comment_guard_targets;
DROP TABLE IF EXISTS comment_guards;

-- Audit (findings → runs). Note: audit_log is a DIFFERENT table — it is the
-- generic activity log written by services/audit.ts, and Organic keeps it.
DROP TABLE IF EXISTS audit_findings;
DROP TABLE IF EXISTS audit_runs;

-- Launch pipeline (ads → batches)
DROP TABLE IF EXISTS ad_launches;
DROP TABLE IF EXISTS launch_batches;

-- Per-ad-account launch defaults
DROP TABLE IF EXISTS account_launch_defaults;

-- Ad copy templates
DROP TABLE IF EXISTS copy_templates;

-- Ad accounts last — everything above referenced it.
DROP TABLE IF EXISTS ad_accounts;
