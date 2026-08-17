-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query)
create table if not exists spots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null, -- 'park' | 'tree' | 'garden' | 'climbing' | 'birdwatching' | 'abandoned' | 'hangout' | 'other'
  source text not null default 'user', -- 'official' (city/state open-data portal) | 'user' (self-reported) | 'osm' (OpenStreetMap) | 'reddit' (social-sourced mention)
  status text not null default 'verified', -- 'pending' | 'verified' | 'rejected' (junk, size-filtered) | 'merged' (collapsed into a parent, see merged_into)
  confirm_count integer not null default 0,
  lat double precision not null,
  lng double precision not null,
  photo_url text,
  created_at timestamptz not null default now()
);

-- Added for ingestion sources (OSM, open-data portals): each source's native ID,
-- so re-running an ingestion job is idempotent via `upsert(..., { onConflict })`
-- against the unique index below, instead of fragile check-then-insert logic.
alter table spots add column if not exists external_id text;

-- Added for the data-quality cleanup pass (junk-sized spots + nested
-- duplicates like Brooklyn Botanic Garden's ~20 separate sub-garden pins).
-- All nullable/additive, same precedent as external_id above.
--
-- area_m2: computed footprint for way/relation-derived OSM rows, used to
-- distinguish a real visitable green space from a street planter or median.
-- Null means "no area data" (node-derived, a non-OSM source, or not yet
-- backfilled) — always exempt from the size filter, not treated as zero.
alter table spots add column if not exists area_m2 double precision;
-- features: for a parent spot that absorbed nested sub-features, their
-- names (e.g. Brooklyn Botanic Garden -> {"Rose Garden","Cherry Esplanade"})
-- — so that information is preserved instead of lost when the children are
-- hidden from the map via status='merged'.
alter table spots add column if not exists features text[];
-- merged_into: for a child row collapsed into a parent, the parent's id.
-- Kept as an audit trail rather than deleting the row outright — a bad
-- merge is reversible with a single UPDATE (status='verified', merged_into
-- = null) instead of requiring a restore from backup.
alter table spots add column if not exists merged_into uuid references spots(id);

-- Tag schema, added alongside the cleanup pass so recategorized spots are
-- findable/filterable instead of just hidden. Every field is either a
-- direct measurement (size_class, from area_m2) or a direct 1:1 OSM tag
-- mapping (amenities, accessibility) — nothing here is inferred beyond
-- activity_fit's documented size-default-with-tag-override, and nothing is
-- fabricated. No 'mood' column: no real data source exists for it yet.
--
-- size_class: 'small' | 'medium' | 'large', computed from area_m2 against
-- per-category bands. Null when area_m2 is unknown — an honest "can't
-- classify," not a guess.
alter table spots add column if not exists size_class text;
-- activity_fit: e.g. {climb} | {birdwatch} | {lounge} | {walk} | {walk,sports}.
-- Defaults from size_class (a real measurement), overridden by real OSM
-- tags where they'd contradict it (a tagged nature_reserve never implies
-- "sports" regardless of size; a tagged playground/sport always does).
alter table spots add column if not exists activity_fit text[];
-- amenities: e.g. {water_feature,open_lawn}, straight from OSM tags present
-- on the element itself. Sparse by design — benches/restrooms are almost
-- always separate point features inside a polygon in OSM, not tags on the
-- polygon, so this stays null for most rows. Never fabricated.
alter table spots add column if not exists amenities text[];
-- accessibility: OSM's own wheelchair=yes/no/limited tag verbatim when
-- present, else null. Never inferred from anything else.
alter table spots add column if not exists accessibility text;

-- climbing_grade: raw grade string straight from OSM (climbing:grade:french,
-- climbing:grade:yds, or bare climbing:grade — whichever tag is present,
-- preferred in that order). Deliberately not normalized to one scale: French
-- sport grades and YDS aren't a clean 1:1 mapping, and inventing a
-- conversion here would assert precision the source data doesn't have.
-- Null means "no grade tagged in OSM," not "ungraded" or "easiest."
alter table spots add column if not exists climbing_grade text;

create index if not exists spots_category_idx on spots (category);

-- spots_status_idx (status) is superseded by spots_status_lat_lng_idx below,
-- whose leading column is also `status` — any query the single-column index
-- served can use the composite index's prefix instead, so keeping both would
-- just be two B-trees to maintain on every write for no read benefit.
drop index if exists spots_status_idx;

-- Plain unique index, not partial: Postgres already treats NULL as distinct
-- from other NULLs in a unique index, so existing rows with external_id=NULL
-- (all user submissions) never conflict with each other regardless. A partial
-- index here would additionally break upsert's onConflict target, since it
-- can't express the partial predicate as an inference clause.
drop index if exists spots_source_external_id_key;
create unique index if not exists spots_source_external_id_key
  on spots (source, external_id);

create or replace function confirm_spot(spot_id uuid, threshold integer default 2)
returns void as $$
  update spots
  set confirm_count = confirm_count + 1,
      status = case when confirm_count + 1 >= threshold then 'verified' else status end
  where id = spot_id;
$$ language sql;

-- Added so /pending has a way to say a submission looks fake/junk, not just
-- confirm. Every spot's own flag report count, surfaced in the crowd verdict
-- blurb (src/lib/spot-verdict.ts) on verified spots too.
alter table spots add column if not exists flag_count integer not null default 0;

-- Mirrors confirm_spot: a threshold-based anon vote, no auth required. Only
-- auto-transitions status when the spot is still pending — a verified spot
-- accumulates flag_count for display (see spot-verdict.ts) but is never
-- auto-hidden by it, since anon flags on an already-live spot are a
-- griefing vector with no auth to stop them.
create or replace function flag_spot(spot_id uuid, threshold integer default 2)
returns void as $$
  update spots
  set flag_count = flag_count + 1,
      status = case when status = 'pending' and flag_count + 1 >= threshold then 'rejected' else status end
  where id = spot_id;
$$ language sql;

-- Speeds up the viewport bounding-box filter (status + lat/lng range) used by
-- both the map's in-bounds query and the ingestion scripts' proximity dedup
-- check. Without this, those queries fall back to a full scan of every
-- verified row on every request as the table keeps growing.
create index if not exists spots_status_lat_lng_idx on spots (status, lat, lng);

-- Zoomed-out map views: instead of shipping every spot's full row (or even
-- just lat/lng) to the client, bucket verified spots into a coarse lat/lng
-- grid server-side and return one row per bucket with its count. Payload
-- size is bounded by grid resolution, not by how many rows are in `spots`,
-- so this stays cheap no matter how much ingestion grows the table.
create or replace function spot_density_grid(
  min_lat double precision,
  max_lat double precision,
  min_lng double precision,
  max_lng double precision,
  grid_size double precision default 0.05,
  -- Optional: restricts counted spots to this category set. Added so the
  -- density view can count only 'park'/'garden'/'tree'/'birdwatching' (the
  -- categories fetchSpotDensity in queries.ts actually passes) instead of
  -- every verified spot regardless of category — this RPC's original form
  -- counted 'abandoned'/'hangout' rows too, which aren't green space, and
  -- 'other'/'climbing' rows the density view can't defend as green space
  -- either. Null (the default) keeps this RPC's original all-categories
  -- behavior for any other caller.
  categories text[] default null
)
returns table (lat double precision, lng double precision, count bigint)
language plpgsql
stable
as $$
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
      and (categories is null or spots.category = any(categories))
    group by 1, 2
    limit 20000;
end;
$$;

-- Storage bucket for spot photos. Deterministic: always ends up public,
-- regardless of whether it already existed in some other state. Capped at
-- 5MB and image mime types only — anon insert policy below has no other
-- upload restriction, so this is the only backstop against abuse.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spot-photos', 'spot-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Storage policies: create-if-missing via exception handling, never drop-then-create.
-- A drop+create would momentarily remove the policy inside the same statement batch;
-- this way there is no window where the policy is absent.
do $$
begin
  create policy "Public read spot-photos" on storage.objects
    for select using (bucket_id = 'spot-photos');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "Anon insert spot-photos" on storage.objects
    for insert with check (bucket_id = 'spot-photos');
exception
  when duplicate_object then null;
end $$;

-- RLS is intentionally left disabled on `spots`: there is no auth in this app, so the
-- browser (anon key) inserts/selects/rpcs directly against this table with no session.
-- Enabling RLS here without matching policies would silently break anonymous submission
-- and confirmation. If auth is added post-hackathon, replace this line with real policies.
alter table spots disable row level security;
