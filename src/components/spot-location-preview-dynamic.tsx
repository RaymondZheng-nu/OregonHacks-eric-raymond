"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` at load, so this can't be SSR'd. Own file because
// three separate "no photo" fallbacks all need the same dynamic import.
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
