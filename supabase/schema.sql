-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query)
create table if not exists spots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null, -- 'park' | 'tree' | 'garden' | 'climbing' | 'birdwatching' | 'other'
  source text not null default 'user', -- 'official' (NYC Open Data) | 'user' (self-reported)
  status text not null default 'verified', -- 'pending' | 'verified'
  confirm_count integer not null default 0,
  lat double precision not null,
  lng double precision not null,
  photo_url text,
  created_at timestamptz not null default now()
);

create index if not exists spots_category_idx on spots (category);
create index if not exists spots_status_idx on spots (status);

create or replace function confirm_spot(spot_id uuid, threshold integer default 2)
returns void as $$
  update spots
  set confirm_count = confirm_count + 1,
      status = case when confirm_count + 1 >= threshold then 'verified' else status end
  where id = spot_id;
$$ language sql;

-- Storage: create a public bucket named "spot-photos" in the dashboard first, then run:
-- create policy "Public read spot-photos" on storage.objects for select using (bucket_id = 'spot-photos');
-- create policy "Anon insert spot-photos" on storage.objects for insert with check (bucket_id = 'spot-photos');
