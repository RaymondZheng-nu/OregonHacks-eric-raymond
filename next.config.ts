import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
    // Every photo in this app is hotlinked straight to Wikimedia's origin —
    // there's no self-hosted cache in front of it. Next's default
    // deviceSizes has 8 breakpoints; the same photo showing up across the
    // carousel/grid/swipe-deck at different responsive widths means up to
    // 8 separate origin fetches per photo before Next's own optimizer
    // cache is warm for every size, which is what was tripping Wikimedia's
    // rate limiter (observed live: 5 real 429s loading the homepage once).
    // Collapsing to 4 tiers cuts that worst case roughly in half; a longer
    // minimumCacheTTL means each variant only has to survive that once.
    deviceSizes: [640, 1080, 1920],
    imageSizes: [64, 128, 256],
    minimumCacheTTL: 2678400, // 31 days
  },
};

export default nextConfig;
