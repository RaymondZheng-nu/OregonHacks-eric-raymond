-- Re-syncs the live spot_density_grid function with schema.sql's merged
-- state: a teammate's out-of-band "restrict to green-space categories"
-- change was applied directly against a stale (pre-70-degree-fix) copy of
-- this function, which clobbered the earlier bounds-cap fix and brought
-- back the whole-US "bounds span too large: max 20 degrees per axis" 400.
-- This migration re-applies both changes together so the live function
-- matches schema.sql exactly.
create or replace function spot_density_grid(
  min_lat double precision,
  max_lat double precision,
  min_lng double precision,
  max_lng double precision,
  grid_size double precision default 0.05,
  categories text[] default null
)
returns table (lat double precision, lng double precision, count bigint)
language plpgsql
stable
as $$
begin
  if (max_lat - min_lat) > 70 or (max_lng - min_lng) > 70 then
    raise exception 'bounds span too large: max 70 degrees per axis';
  end if;

  return query
    select
      round(spots.lat / greatest(grid_size, 0.005)) * greatest(grid_size, 0.005) as lat,
      round(spots.lng / greatest(grid_size, 0.005)) * greatest(grid_size, 0.005) as lng,
      count(*) as count
    from spots
    where status = 'verified'
      and spots.lat between min_lat and max_lat
      and spots.lng between min_lng and max_lng
      and (categories is null or spots.category = any(categories))
    group by 1, 2
    limit 20000;
end;
$$;
