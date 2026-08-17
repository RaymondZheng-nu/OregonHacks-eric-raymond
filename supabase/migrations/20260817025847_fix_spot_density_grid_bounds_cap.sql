-- Raises spot_density_grid's bounds-span cap from 20 to 70 degrees per axis.
--
-- The previous 20-degree cap was wrong for this app specifically: this is a
-- USA-wide product (see README), and CONUS alone spans ~58 degrees of
-- longitude (Pacific coast to Maine) — so zooming out to see the whole
-- country (a real, intended use, not abuse) always exceeded 20 and silently
-- broke the heatmap with a 400 the UI only logged to the console.
--
-- 70 degrees comfortably covers a full CONUS-width viewport with margin
-- while still rejecting anything approaching true global scale (180+
-- degrees) — the cost profile barely changes versus 20 in practice, since a
-- CONUS-wide query already scans essentially the same `verified` rows a
-- 20-degree regional query over the densest part of the country would. The
-- row-count `limit 20000` and the `grid_size` floor (both already in place)
-- keep the response payload bounded regardless of how wide the input box
-- is, so this only relaxes the scan-cost guard, not the payload-abuse one.
create or replace function spot_density_grid(
  min_lat double precision,
  max_lat double precision,
  min_lng double precision,
  max_lng double precision,
  grid_size double precision default 0.05
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
    group by 1, 2
    limit 20000;
end;
$$;
