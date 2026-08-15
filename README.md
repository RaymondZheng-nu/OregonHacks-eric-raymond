# Nearby Nature

Built for OregonHacks 2026 — theme: *build tech that helps people connect with nature or supports environmental health*.

For NYC apartment-dwellers with no yard, "go outside" isn't always obvious. Nearby Nature is a map that combines official city green-space data with spots the community has actually found worth visiting — parks, quiet gardens, birdwatching corners, even outdoor climbing spots — so finding a piece of nature nearby takes one look, not a search.

## Features

- Interactive map of NYC green space, seeded from official park/street-tree data
- Community-submitted "niche" spots — hidden gardens, climbing spots, birdwatching corners — tagged by category, with photos and descriptions
- One-click "add a spot" with geolocation, no account required

## Tech stack

- [Next.js](https://nextjs.org/) (App Router) + [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- [Supabase](https://supabase.com/) (Postgres + storage)
- [Leaflet](https://leafletjs.com/) / OpenStreetMap for mapping
- Deployed on [Vercel](https://vercel.com/)

## Getting started

1. Clone the repo and install dependencies:

   ```bash
   git clone git@github.com:RaymondZheng-nu/OregonHacks-eric-raymond.git
   cd OregonHacks-eric-raymond
   npm install
   ```

2. Copy `.env.local.example` to `.env.local` and fill in your Supabase project's URL and keys (Project Settings → API):

   ```bash
   cp .env.local.example .env.local
   ```

3. Create the database table — run `supabase/schema.sql` in your Supabase project's SQL Editor.

4. Seed sample data:

   ```bash
   npm run seed
   ```

5. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Team

Raymond Zheng & Eric Huang
