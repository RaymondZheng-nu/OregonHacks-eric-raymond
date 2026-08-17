-- Two fixes flagged by CodeRabbit on PR #6, both critical:
--
-- 1. The initial remote_schema.sql migration granted `anon` DELETE/INSERT/
--    SELECT/UPDATE on `spots` (and, via ALTER DEFAULT PRIVILEGES, on any
--    future table) plus GRANT ALL. schema.sql has claimed a narrower revoke
--    since it was written, but no migration ever actually ran it against
--    the live DB -- so prod has been sitting with anon able to delete or
--    overwrite any row via PostgREST. This runs that revoke for real.
--
-- 2. 20260817063412 added a 6-arg spot_density_grid (with `categories`)
--    via `create or replace function`. Postgres treats differing arg lists
--    as distinct overloads, so the original 5-arg version from
--    remote_schema.sql never got replaced -- it's still sitting there. Since
--    `categories` defaults to null, a plain 5-arg call is ambiguous between
--    the two and errors with "function is not unique". Drop the stale one.

drop function if exists public.spot_density_grid(
  double precision, double precision, double precision, double precision, double precision
);

revoke update, delete on spots from anon;
