# Context for Claude Code — Nearby Nature (OregonHacks)

Paste this whole file into a new Claude Code session in this repo to get it up to speed.

## What this is

OregonHacks 2026 hackathon project (2-day build, team of 2: Raymond + Eric). Theme: "build tech that helps people connect with nature or supports environmental health."

**The idea**: NYC apartment-dwellers often have no yard/easy greenery access. Nearby Nature is a map combining (1) official NYC green-space data (parks, street trees, gardens) pre-seeded as static rows, with (2) community-submitted "niche" spots — hidden gardens, rock climbing spots, birdwatching corners — tagged by category with photos.

**Competitive note**: NYC Public Space (official+hidden-spots app) and GreenThumb/Green Map NYC (garden maps) already cover parts of this. Our differentiator is the *activity tagging* layer (climbing, birdwatching, not just "nice spot") combined with the review/verification flow below — lean into that in the pitch.

## Stack (locked, don't change)

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui (uses **Base UI** primitives, not Radix — components take a `render` prop instead of `asChild`, e.g. `<DialogTrigger render={<Button>...} />`). Supabase (Postgres + Storage), no ORM. Leaflet + OpenStreetMap for the map (no API key needed). Deploy target: Vercel.

## Current state (as of this handoff)

Fully scaffolded and building clean (`npm run build` passes, zero type errors). Core flow works end-to-end:

- `/` — main map, shows only `status = 'verified'` spots
- `/pending` — review queue, shows `status = 'pending'` submissions with a "confirm" button
- "Add a spot" dialog — real photo file upload (Supabase Storage, not a URL field), submits with `status: 'pending'`
- **Moderation flow**: new submissions don't show on the main map immediately. They sit in `/pending` until 2 people click "confirm" (tracked via a Postgres `confirm_spot()` RPC + a localStorage guard so the same browser can't confirm twice). This was a deliberate call to stop trolling/junk submissions — not real auth, just friction. If a judge asks: yes it's gameable via incognito tabs, that's an accepted hackathon-scope tradeoff, not oversight.
- 18 spots pre-seeded (7 official NYC parks/trees/gardens, 11 self-reported niche spots) via `npm run seed`

## Key files

- `src/app/page.tsx` — main map page (server component, fetches verified spots)
- `src/app/pending/page.tsx` — review queue page
- `src/components/explore-view.tsx` — map page shell/header
- `src/components/spot-map.tsx` — Leaflet map (client-only, dynamically imported with `ssr:false`)
- `src/components/add-spot-dialog.tsx` — submission form + photo upload
- `src/components/confirm-spot-button.tsx` — the review/confirm button
- `src/lib/supabase/{client,server,storage}.ts` — Supabase helpers (browser client, server client, photo upload)
- `src/lib/types.ts`, `src/lib/categories.ts` — shared types + category color/label config
- `supabase/schema.sql` — full schema, safe to re-run (uses `if not exists` / `or replace`)
- `supabase/seed-data.json` + `scripts/seed.mjs` — seed data (`npm run seed`)

## Getting your local env running

1. `npm install`
2. Get invited to the Supabase org (ask Raymond), then Project Settings → API → grab the values
3. `cp .env.local.example .env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
4. DB schema and the `spot-photos` storage bucket should already exist (shared Supabase project) — if `npm run dev` errors about missing table/bucket, run `supabase/schema.sql` in the SQL Editor and check Storage for a public `spot-photos` bucket
5. `npm run dev` → `localhost:3000`

## What's left (unassigned — split live)

- Category filtering on the map (click legend badges to toggle)
- General map/UI polish
- Vercel deploy + env vars
- Video script + recording (don't leave to the last 20 min)
- Devpost writeup — **must disclose Claude Code usage per hackathon rules**, keep that disclosure in the Devpost submission, not in the README

## Ground rules this session has been following

- Skip real auth entirely — anonymous submissions, moderation via the confirm-count flow above instead
- Front-load anything fragile/time-risky (photo upload, submission flow) early, save map/UI polish for last — advice came from a multi-perspective AI council eval, unanimous on this point
- Don't over-scope: one flawless demo loop (map loads populated → tap pin → see spot → submit new spot) matters more than feature count, since judging is a 5-min video, not a live demo
