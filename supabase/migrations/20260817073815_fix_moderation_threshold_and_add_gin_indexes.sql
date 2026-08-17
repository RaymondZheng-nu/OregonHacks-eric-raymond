-- Two more from CodeRabbit's PR #6 review:
--
-- confirm_spot/flag_spot took a caller-controlled `threshold` param with no
-- grant restriction, so any anon caller could hit the RPC directly with
-- threshold=0 and instantly verify or reject any pending spot, bypassing the
-- whole point of a vote threshold. Drop the old signatures and recreate with
-- the threshold fixed at 2 inline, matching schema.sql.
--
-- The two GIN indexes (amenities, activity_fit) were already in schema.sql
-- but no prior migration ever created them on the live DB -- Advanced Filter
-- queries touching either column have been doing full sequential scans.

drop function if exists public.confirm_spot(uuid, integer);
drop function if exists public.flag_spot(uuid, integer);

create or replace function confirm_spot(spot_id uuid)
returns void as $$
  update spots
  set confirm_count = confirm_count + 1,
      status = case
        when status = 'pending' and confirm_count + 1 >= 2 then 'verified'
        else status
      end
  where id = spot_id;
$$ language sql security definer set search_path = public;

create or replace function flag_spot(spot_id uuid)
returns void as $$
  update spots
  set flag_count = flag_count + 1,
      status = case when status = 'pending' and flag_count + 1 >= 2 then 'rejected' else status end
  where id = spot_id;
$$ language sql security definer set search_path = public;

create index if not exists spots_amenities_gin_idx on spots using gin (amenities);
create index if not exists spots_activity_fit_gin_idx on spots using gin (activity_fit);
