-- ============================================================================
-- WDOS Migration 143 — State Secretary role (Phase 189)
-- RUN THIS FILE FIRST, ON ITS OWN. Postgres does not allow a new enum value
-- to be used in the same transaction that creates it, and the SQL Editor
-- runs each paste as one transaction. So: run 143, then run 144.
-- ============================================================================
alter type public.role_code add value if not exists 'state_secretary';
