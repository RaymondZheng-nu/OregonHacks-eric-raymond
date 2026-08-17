import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      // backfill-photos.mjs resolves a spot's `File:` OSM tag to a Commons
      // Special:FilePath URL (this hostname) — separate from the Wikipedia
      // REST API's thumbnail.source URLs (upload.wikimedia.org, above).
      // Missing this crashed the whole homepage with a 500 the moment any
      // featured spot (confirm_count-ranked, so this rotates) happened to
      // have one of these as its photo_url.
      { protocol: "https", hostname: "commons.wikimedia.org" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
