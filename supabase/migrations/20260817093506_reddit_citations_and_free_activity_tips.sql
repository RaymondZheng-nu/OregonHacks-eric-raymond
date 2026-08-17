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

-- Same reasoning as spots: anon writes go through INSERT + confirm_tip only.
revoke update, delete on free_activity_tips from anon;
