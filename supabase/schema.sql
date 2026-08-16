-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query)
create table if not exists spots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null, -- 'park' | 'tree' | 'garden' | 'climbing' | 'birdwatching' | 'abandoned' | 'hangout' | 'other'
  source text not null default 'user', -- 'official' (city/state open-data portal) | 'user' (self-reported) | 'osm' (OpenStreetMap) | 'reddit' (social-sourced mention)
  status text not null default 'verified', -- 'pending' | 'verified'
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

create index if not exists spots_category_idx on spots (category);
create index if not exists spots_status_idx on spots (status);

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
