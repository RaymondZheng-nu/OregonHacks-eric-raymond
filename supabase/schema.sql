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

-- Source's native ID, so re-running an ingestion job is idempotent via
-- upsert onConflict against the unique index below.
alter table spots add column if not exists external_id text;

-- Cleanup-pass columns (junk-sized spots + nested dedup). All nullable/additive.
--
-- area_m2: footprint for way/relation OSM rows, to tell a real green space from
-- a planter. Null = "no area data" — always exempt from the size filter, not zero.
alter table spots add column if not exists area_m2 double precision;
-- features: sub-feature names a parent absorbed, kept so they survive the
-- children being hidden via status='merged'.
alter table spots add column if not exists features text[];
-- merged_into: parent id for a collapsed child. Audit trail — a bad merge is
-- reversible with one UPDATE instead of a backup restore.
alter table spots add column if not exists merged_into uuid references spots(id);

-- Tag columns. Each is a direct measurement or 1:1 OSM tag mapping — nothing
-- fabricated. No 'mood' column: no data source for it yet.
--
-- size_class: small|medium|large from area_m2 per-category bands. Null when
-- area_m2 is unknown, an honest "can't classify."
alter table spots add column if not exists size_class text;
-- activity_fit: defaults from size_class, overridden by OSM tags that contradict
-- it (a tagged nature_reserve never implies "sports"; a playground always does).
alter table spots add column if not exists activity_fit text[];
-- amenities: OSM tags on the element itself. Sparse — benches/restrooms are
-- usually separate point features in OSM, not tags on the polygon.
alter table spots add column if not exists amenities text[];
-- accessibility: OSM's wheelchair=yes/no/limited verbatim, else null.
alter table spots add column if not exists accessibility text;

-- climbing_grade: raw OSM grade string (french, yds, or bare — in that order).
-- Not normalized: French and YDS aren't a clean 1:1, so converting would fake
-- precision the source lacks. Null = "no grade tagged," not "easiest."
alter table spots add column if not exists climbing_grade text;

create index if not exists spots_category_idx on spots (category);

-- Superseded by spots_status_lat_lng_idx below (same leading column), so drop
-- it — keeping both is two B-trees to maintain for no read benefit.
drop index if exists spots_status_idx;

-- Plain unique index, not partial: Postgres treats NULLs as distinct, so the
-- external_id=NULL user rows never conflict. A partial index would also break
-- upsert's onConflict target (can't express the predicate as an inference clause).
drop index if exists spots_source_external_id_key;
create unique index if not exists spots_source_external_id_key
  on spots (source, external_id);

-- Status gated to 'pending' so anon spam can't flip a rejected/merged spot back
-- to verified. confirm_count still increments unconditionally (a display count).
-- security definer + fixed search_path: this must keep UPDATE-ing spots after
-- anon's direct UPDATE grant is revoked below, running as owner through this
-- narrow status-gated interface. search_path pins name resolution against hijack.
-- threshold is hardcoded at 2, not a param — as a param, anon could call with
-- threshold=0 and instantly verify any pending spot.
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

-- flag_count: report count for /pending, also shown in the verdict blurb.
alter table spots add column if not exists flag_count integer not null default 0;

-- Mirrors confirm_spot. Only auto-rejects a still-pending spot; a verified spot
-- accrues flag_count for display but is never auto-hidden (anon flags on a live
-- spot are a griefing vector with no auth to stop them).
-- security definer + fixed search_path: same reasoning as confirm_spot.
create or replace function flag_spot(spot_id uuid)
returns void as $$
  update spots
  set flag_count = flag_count + 1,
      status = case when status = 'pending' and flag_count + 1 >= 2 then 'rejected' else status end
  where id = spot_id;
$$ language sql security definer set search_path = public;

-- Serves the viewport bbox filter (status + lat/lng) for the map query and the
-- ingestion dedup check, which would otherwise full-scan every verified row.
create index if not exists spots_status_lat_lng_idx on spots (status, lat, lng);

-- GIN indexes for the .overlaps() (&&) array filters on amenities/activity_fit,
-- which a btree can't serve at all — without these, every Advanced Filter combo
-- touching them does a sequential scan.
create index if not exists spots_amenities_gin_idx on spots using gin (amenities);
create index if not exists spots_activity_fit_gin_idx on spots using gin (activity_fit);

-- Zoomed-out views: bucket verified spots into a coarse lat/lng grid server-side
-- and return one row per bucket with its count. Payload scales with grid
-- resolution, not table size.
create or replace function spot_density_grid(
  min_lat double precision,
  max_lat double precision,
  min_lng double precision,
  max_lng double precision,
  grid_size double precision default 0.05,
  -- Optional category filter so the density view counts only green-space
  -- categories, not every verified spot. Null keeps all-categories behavior.
  categories text[] default null
)
returns table (lat double precision, lng double precision, count bigint)
language plpgsql
stable
as $$
begin
  -- Cap the scan cost (limit only caps output, not the scan+group-by before it).
  -- 70 degrees, not the old 20: CONUS spans ~58deg of longitude, so a whole-country
  -- zoom-out (intended use) exceeded 20 and silently 400'd the heatmap. 70 covers
  -- CONUS with margin while still rejecting true global scale.
  if (max_lat - min_lat) > 70 or (max_lng - min_lng) > 70 then
    raise exception 'bounds span too large: max 70 degrees per axis';
  end if;

  return query
    -- Floor grid_size at 0.005deg (~500m): anon-reachable and untrusted, so 0
    -- would divide-by-zero and a tiny value gives ~one bucket per row, defeating
    -- the bounded payload. `limit` below is a second cap.
    select
      round(spots.lat / greatest(grid_size, 0.005)) * greatest(grid_size, 0.005) as lat,
      round(spots.lng / greatest(grid_size, 0.005)) * greatest(grid_size, 0.005) as lng,
      count(*) as count
    from spots
    where status = 'verified'
      -- Must qualify spots.lat/lng — the OUT params are also named lat/lng, and
      -- a bare reference is ambiguous, which silently 400'd every heatmap request.
      and spots.lat between min_lat and max_lat
      and spots.lng between min_lng and max_lng
      and (categories is null or spots.category = any(categories))
    group by 1, 2
    limit 20000;
end;
$$;

-- Spot-photos bucket. Idempotently ends up public, 5MB cap, image mime types
-- only — the only upload restriction, since the anon insert policy has none.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spot-photos', 'spot-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Create-if-missing, not drop-then-create, so there's no window where the
-- policy is absent.
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

-- RLS stays off: no auth, so the anon key reads/writes directly. Enabling it
-- without policies would break anonymous submission. Add real policies if auth lands.
alter table spots disable row level security;

-- Anon writes only go through INSERT and the confirm/flag RPCs, so close off the
-- default UPDATE/DELETE grants (an arbitrary .update({status:'rejected'}) from the
-- browser). SELECT/INSERT stay open — both are load-bearing.
revoke update, delete on spots from anon;

-- Reddit citation, attached to an existing spot by scripts/ingest-reddit-citations.mjs
-- (service-role writes only — anon never writes these directly, hence no RPC).
-- A real permalink + the post's own title, never a synthesized quote.
alter table spots add column if not exists reddit_citation_url text;
alter table spots add column if not exists reddit_citation_snippet text;
alter table spots add column if not exists reddit_citation_subreddit text;

-- Community-reported "free things to do" tips, same pending/verified +
-- confirm_count moderation shape already proven on spots — reused rather
-- than inventing a second mechanism. spot_id is nullable so a tip that's
-- more "this city has free rowing Saturdays" than tied to one exact pin
-- still has somewhere to live.
create table if not exists free_activity_tips (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid references spots(id),
  tip text not null,
  source_url text,
  status text not null default 'pending', -- 'pending' | 'verified' | 'rejected'
  confirm_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists free_activity_tips_spot_id_idx on free_activity_tips (spot_id);

alter table free_activity_tips disable row level security;

-- Mirrors confirm_spot: security definer + fixed search_path so this keeps
-- working after anon's UPDATE grant is revoked below. Threshold hardcoded
-- at 2 for the same reason (a param would let anon self-verify with 0).
create or replace function confirm_tip(tip_id uuid)
returns void as $$
  update free_activity_tips
  set confirm_count = confirm_count + 1,
      status = case
        when status = 'pending' and confirm_count + 1 >= 2 then 'verified'
        else status
      end
  where id = tip_id;
$$ language sql security definer set search_path = public;

-- Same reasoning as spots above: anon writes go through INSERT + confirm_tip only.
revoke update, delete on free_activity_tips from anon;
