-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP EXTENSION IF EXISTS pg_net;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

CREATE FUNCTION public.confirm_spot (
  spot_id   uuid,
  threshold integer DEFAULT 2
)
  RETURNS void
  LANGUAGE sql
  AS $function$
  update spots
  set confirm_count = confirm_count + 1,
      status = case when confirm_count + 1 >= threshold then 'verified' else status end
  where id = spot_id;
$function$;

GRANT ALL ON FUNCTION public.confirm_spot(uuid, integer) TO anon;

GRANT ALL ON FUNCTION public.confirm_spot(uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.confirm_spot(uuid, integer) TO service_role;

CREATE FUNCTION public.flag_spot (
  spot_id   uuid,
  threshold integer DEFAULT 2
)
  RETURNS void
  LANGUAGE sql
  AS $function$
  update spots
  set flag_count = flag_count + 1,
      status = case when status = 'pending' and flag_count + 1 >= threshold then 'rejected' else status end
  where id = spot_id;
$function$;

GRANT ALL ON FUNCTION public.flag_spot(uuid, integer) TO anon;

GRANT ALL ON FUNCTION public.flag_spot(uuid, integer) TO authenticated;

GRANT ALL ON FUNCTION public.flag_spot(uuid, integer) TO service_role;

CREATE FUNCTION public.spot_density_grid (
  min_lat   double precision,
  max_lat   double precision,
  min_lng   double precision,
  max_lng   double precision,
  grid_size double precision DEFAULT 0.05
)
  RETURNS TABLE (
    lat   double precision,
    lng   double precision,
    count bigint
  )
  LANGUAGE plpgsql
  STABLE
  AS $function$
begin
  -- Same anon-reachability concern as the grid_size floor below: `limit`
  -- only caps the aggregated *output*, not the scan+group-by cost that
  -- happens before it. A world-sized bounds request would still force a
  -- full scan of every verified row on each call. 20 degrees comfortably
  -- covers a multi-state viewport (the widest legitimate use here) while
  -- rejecting anything approaching global scale.
  if (max_lat - min_lat) > 20 or (max_lng - min_lng) > 20 then
    raise exception 'bounds span too large: max 20 degrees per axis';
  end if;

  return query
    -- Floored at 0.005 degrees (~500m): this RPC is reachable directly with
    -- the anon key (no RLS on this table), so grid_size can't be trusted as
    -- given. Unfloored, 0 divides by zero and a near-zero value produces
    -- close to one bucket per row, defeating the bounded-payload guarantee
    -- this function exists for. `limit` below is a second, independent cap.
    select
      round(spots.lat / greatest(grid_size, 0.005)) * greatest(grid_size, 0.005) as lat,
      round(spots.lng / greatest(grid_size, 0.005)) * greatest(grid_size, 0.005) as lng,
      count(*) as count
    from spots
    where status = 'verified'
      -- Qualified as spots.lat/spots.lng: this function's own OUT parameters
      -- are also named lat/lng (see `returns table` above), so a bare
      -- reference here is ambiguous between the column and the OUT param —
      -- Postgres rejects it at call time with "column reference is ambiguous",
      -- which silently broke every heatmap request since this function's
      -- introduction (the client swallows the error and just keeps showing
      -- the last successful markers-mode count).
      and spots.lat between min_lat and max_lat
      and spots.lng between min_lng and max_lng
    group by 1, 2
    limit 20000;
end;
$function$;

GRANT ALL ON FUNCTION public.spot_density_grid(double precision, double precision, double precision, double precision, double precision) TO anon;

GRANT ALL ON FUNCTION public.spot_density_grid(double precision, double precision, double precision, double precision, double precision) TO authenticated;

GRANT ALL ON FUNCTION public.spot_density_grid(double precision, double precision, double precision, double precision, double precision) TO service_role;

CREATE TABLE public.spots (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name           text                     NOT NULL,
  description    text,
  category       text                     NOT NULL,
  source         text                     DEFAULT 'user'::text NOT NULL,
  lat            double precision         NOT NULL,
  lng            double precision         NOT NULL,
  photo_url      text,
  created_at     timestamp with time zone DEFAULT now() NOT NULL,
  status         text                     DEFAULT 'verified'::text NOT NULL,
  confirm_count  integer                  DEFAULT 0 NOT NULL,
  external_id    text,
  area_m2        double precision,
  features       text[],
  merged_into    uuid,
  size_class     text,
  activity_fit   text[],
  amenities      text[],
  accessibility  text,
  climbing_grade text,
  flag_count     integer                  DEFAULT 0 NOT NULL
);

ALTER TABLE public.spots
  ADD CONSTRAINT spots_pkey PRIMARY KEY (id);

ALTER TABLE public.spots
  ADD CONSTRAINT spots_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES public.spots(id);

GRANT ALL ON public.spots TO anon;

GRANT ALL ON public.spots TO authenticated;

GRANT ALL ON public.spots TO service_role;

CREATE UNIQUE INDEX spots_source_external_id_key ON public.spots (source, external_id);

CREATE INDEX spots_category_idx ON public.spots (category);

CREATE INDEX spots_status_lat_lng_idx ON public.spots (status, lat, lng);
