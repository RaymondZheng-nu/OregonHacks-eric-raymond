"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` at load time, so this can never go through SSR —
// same reason explore-view.tsx dynamically imports the full SpotMap. Factored
// into its own file since three separate "no photo" fallbacks (results list,
// spotlight carousel, featured grid) all need the same dynamic import.
export const SpotLocationPreview = dynamic(
  () =>
    import("@/components/spot-location-preview").then(
      (m) => m.SpotLocationPreview,
    ),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
  },
);
