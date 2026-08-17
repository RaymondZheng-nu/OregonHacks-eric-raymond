"use client";

import "leaflet/dist/leaflet.css";
// Structural/animation styles only (spiderfy transitions) — no color. The
// stock color scheme lived in this package's sibling MarkerCluster.Default.css,
// deliberately not imported: clusterIcon() below replaces it entirely.
import "leaflet.markercluster/dist/MarkerCluster.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Rectangle,
  useMap,
  useMapEvents,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import type { Spot, SpotCategory } from "@/lib/types";
import { CATEGORY_META } from "@/lib/categories";
import type { BoundingBox } from "@/lib/geo";
import { COVERAGE_REGIONS } from "@/lib/coverage-regions";
import {
  getVerifiedSpotsInBounds,
  getSpotDensity,
} from "@/lib/supabase/queries.client";
import type { SpotsInBoundsOptions } from "@/lib/supabase/queries";
import { getSpotVerdict } from "@/lib/spot-verdict";
import { markerIcon } from "@/lib/leaflet-marker";
import { cn } from "@/lib/utils";

export type AdvancedFilters = Pick<
  SpotsInBoundsOptions,
  "sizeClasses" | "amenities" | "wheelchairAccessibleOnly" | "climbingGrades"
>;

const NYC_CENTER: [number, number] = [40.7484, -73.9857];
const DEFAULT_ZOOM = 11;

// Below this zoom, the viewport is wide enough (multi-city/state/country)
// that individual pins would mean fetching and rendering thousands of DOM
// markers — show a density heatmap instead. At or above it, a viewport
// realistically holds a bounded number of spots worth pinning individually.
const HEATMAP_ZOOM_THRESHOLD = 10;
const VIEWPORT_FETCH_LIMIT = 1000;
const MOVE_DEBOUNCE_MS = 300;

export type MapMode = "markers" | "heatmap";
type Viewport = { bounds: BoundingBox; zoom: number };

function boundsFromLeaflet(bounds: L.LatLngBounds): BoundingBox {
  return {
    minLat: bounds.getSouth(),
    maxLat: bounds.getNorth(),
    minLng: bounds.getWest(),
    maxLng: bounds.getEast(),
  };
}

// Reports the map's bounds/zoom on mount and after every pan/zoom, debounced
// so a drag gesture doesn't fire a burst of queries. `onChange` is wrapped in
// a ref so the moveend/zoomend handlers object passed to useMapEvents keeps a
// stable identity across renders — otherwise react-leaflet tears down and
// re-adds the native Leaflet listeners on every re-render of this component.
function ViewportWatcher({
  onChange,
}: {
  onChange: (viewport: Viewport) => void;
}) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const scheduleReport = useCallback((map: L.Map) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      onChangeRef.current({
        bounds: boundsFromLeaflet(map.getBounds()),
        zoom: map.getZoom(),
      });
    }, MOVE_DEBOUNCE_MS);
  }, []);

  const handlers = useMemo(
    () => ({
      moveend: () => scheduleReport(map),
      zoomend: () => scheduleReport(map),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `map` below is assigned after this memo runs but closed over by reference; both fire only on real Leaflet events, well after `map` is set.
    [scheduleReport],
  );

  const map = useMapEvents(handlers);

  useEffect(() => {
    onChangeRef.current({
      bounds: boundsFromLeaflet(map.getBounds()),
      zoom: map.getZoom(),
    });
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: fires once with the map's initial bounds, independent of prop identity.
  }, []);

  return null;
}

// leaflet.heat predates ES modules/bundlers: its own source references a
// bare global `L` instead of importing leaflet, so it can't be a static
// top-level import (Turbopack/webpack throw "L is not defined" evaluating
// it, since no such global exists in a bundled module scope). Loading it
// dynamically, after explicitly exposing `window.L`, works around that.
let heatPluginPromise: Promise<unknown> | null = null;
function loadHeatPlugin(): Promise<unknown> {
  if (!heatPluginPromise) {
    (window as unknown as { L: typeof L }).L = L;
    heatPluginPromise = import("leaflet.heat").catch((error) => {
      // Don't cache a failed load — a transient network/chunk error would
      // otherwise permanently disable the heatmap for the rest of the
      // session, since every future mount would await the same dead promise.
      heatPluginPromise = null;
      throw error;
    });
  }
  return heatPluginPromise;
}

// leaflet.heat normalizes each point's weight against `max` (default 1.0)
// to pick a gradient stop. Real per-bucket green-space counts are routinely
// well above 1 (sampled live against the actual RPC: Portland's buckets
// range up to ~70, NYC's up to ~190, with most falling between 10-55) — left
// at the default, nearly every populated bucket saturates to the same
// "hottest" color, erasing the sparse-vs-dense gradient this view exists to
// show. Set closer to the observed p75-p90 range so the visible gradient
// spans most real buckets; the rare higher-count outlier (e.g. a single
// dense downtown cluster) still clips to "hottest," which is the correct
// reading for it. Re-check this against real numbers once the RPC's
// category filter (queries.ts's GREEN_SPACE_CATEGORIES) is live — it will
// shift these counts down somewhat, more so in Portland than NYC.
const HEATMAP_MAX_INTENSITY = 40;

// Green, not leaflet.heat's default blue-to-red "heat" ramp — this reads as
// "more known green space," not "more danger/activity." The lowest stop
// isn't fully transparent (unlike the library default, which hides any
// point below ~40% of max) — a real but sparse bucket should still read as
// "we found something here," not fade into the basemap and look identical
// to a cell with zero data.
const HEATMAP_GRADIENT: Record<number, string> = {
  0.15: "#bbf7d0",
  0.4: "#4ade80",
  0.65: "#16a34a",
  1: "#14532d",
};

// No official react-leaflet binding for leaflet.heat exists, so this
// imperatively creates/tears down an L.heatLayer via useMap().
function HeatmapLayer({ points }: { points: L.HeatLatLngTuple[] }) {
  const map = useMap();
  const [pluginReady, setPluginReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadHeatPlugin()
      .then(() => {
        if (!cancelled) setPluginReady(true);
      })
      .catch((error) => {
        console.error("Failed to load heatmap plugin", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pluginReady) return;
    const layer = L.heatLayer(points, {
      radius: 22,
      blur: 28,
      maxZoom: HEATMAP_ZOOM_THRESHOLD,
      max: HEATMAP_MAX_INTENSITY,
      gradient: HEATMAP_GRADIENT,
    });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, points, pluginReady]);

  return null;
}

// Matches HEATMAP_GRADIENT's own stops, extended into marker mode — so
// "darker green = more" stays the same rule whether you're looking at a
// heat cluster or a pin cluster, instead of switching to leaflet.markercluster's
// stock green/yellow/orange/red scheme (MarkerCluster.Default.css, not
// imported above) right at the exact zoom level a user is most likely to
// compare the two views back to back. Tiers calibrated against real cluster
// counts seen live at typical viewport sizes (single digits up to a few
// hundred). White count text on the two darker tiers — #14532d is too dark
// for the default (implicitly black) text to stay legible.
const CLUSTER_TIERS = [
  { max: 10, size: 34, bg: "#bbf7d0", text: "#14532d" },
  { max: 50, size: 40, bg: "#4ade80", text: "#14532d" },
  { max: 150, size: 46, bg: "#16a34a", text: "#ffffff" },
  { max: Infinity, size: 52, bg: "#14532d", text: "#ffffff" },
];

// react-leaflet-cluster's own .d.ts references L.MarkerClusterGroupOptions /
// L.MarkerCluster, neither of which actually exists in @types/leaflet (no
// @types/leaflet.markercluster package is installed) — only skipLibCheck
// keeps that from erroring inside the library's own .d.ts. Typed narrowly
// here (the one method this needs) instead of referencing that nonexistent
// nominal type.
function clusterIcon(cluster: { getChildCount(): number }): L.DivIcon {
  const count = cluster.getChildCount();
  const tier =
    CLUSTER_TIERS.find((t) => count < t.max) ??
    CLUSTER_TIERS[CLUSTER_TIERS.length - 1];
  return L.divIcon({
    className: "",
    html: `<div style="width:${tier.size}px;height:${tier.size}px;border-radius:9999px;background:${tier.bg};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:${tier.text};font:600 ${tier.size >= 46 ? 14 : 12}px system-ui,sans-serif;">${count}</div>`,
    iconSize: [tier.size, tier.size],
    iconAnchor: [tier.size / 2, tier.size / 2],
  });
}

export function SpotMap({
  initialSpots,
  categories,
  activity,
  picnic,
  initialCenter,
  focusSpotId,
  onViewChange,
  minParkAreaM2,
  advancedFilters,
}: {
  initialSpots: Spot[];
  categories: Set<SpotCategory>;
  activity?: string;
  picnic?: boolean;
  initialCenter?: [number, number];
  focusSpotId?: string;
  onViewChange?: (info: { count: number; mode: MapMode }) => void;
  minParkAreaM2?: number;
  advancedFilters?: AdvancedFilters;
}) {
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [spots, setSpots] = useState<Spot[]>(initialSpots);
  const [densityPoints, setDensityPoints] = useState<L.HeatLatLngTuple[]>([]);
  // Registry of live marker instances, keyed by spot id — lets the focus
  // effect below imperatively open one specific marker's popup once it's
  // actually rendered, without react-leaflet exposing that as a declarative
  // prop on <Marker>.
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());
  const hasOpenedFocusPopupRef = useRef(false);
  // Last count either mode-effect reported, read by the mode-change effect
  // below so it never has to report a false "0" while a fresh fetch for the
  // new mode is still in flight. Seeded from initialSpots.length, not 0 —
  // explore-view.tsx's own visibleCount state starts there too, and the
  // mode-change effect fires once immediately on mount (mode has to "change"
  // from nothing to its first value); without this seed that first report
  // would flash the header's spot count to 0 before the real fetch resolves,
  // a regression from today's SSR-seeded first paint.
  const lastCountRef = useRef(initialSpots.length);

  // `initialSpots` (the SSR-fetched default viewport) is only authoritative
  // until the client's first real viewport-driven fetch resolves — after
  // that, resyncing from a later prop change would clobber whatever the user
  // has since panned/zoomed to. Before that point, still-mounted-but-not-yet-
  // fetched, a new `initialSpots` (e.g. from router.refresh()) should apply.
  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (!hasFetchedRef.current) setSpots(initialSpots);
  }, [initialSpots]);

  const categoryList = useMemo(
    () => Array.from(categories).sort(),
    [categories],
  );

  const handleViewportChange = useCallback((next: Viewport) => {
    setViewport(next);
  }, []);

  const mode: MapMode =
    !viewport || viewport.zoom >= HEATMAP_ZOOM_THRESHOLD
      ? "markers"
      : "heatmap";

  // `mode` is a pure function of viewport.zoom, so it (and the Leaflet layer
  // switch below that reads it directly) update the instant a zoom crosses
  // the threshold — but the two data-fetch effects further down only call
  // onViewChange once their own fetch resolves. Without this, the page
  // chrome (title/legend, disabled filter dropdowns — anything the parent
  // derives from onViewChange's `mode`) stays on the *previous* mode for a
  // full network round-trip after the map has already switched, which reads
  // as a stale/broken overlay sitting over the wrong layer. Reports the last
  // known count rather than 0 so this doesn't also flash the visible spot
  // count to zero on every crossing.
  useEffect(() => {
    onViewChange?.({ count: lastCountRef.current, mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only `mode` should retrigger this; onViewChange is a per-render parent prop, not a dependency to re-fire on.
  }, [mode]);

  // No categories selected means "show nothing" — derived directly at render
  // time rather than via setState in the effect below, so there's no need to
  // dispatch a fetch (or a state update) just to represent an empty result.
  const noCategoriesSelected = categoryList.length === 0;
  const visibleSpots = noCategoriesSelected ? [] : spots;

  // Opens the focused marker's popup exactly once, as soon as it actually
  // exists in the currently-rendered set — the results list only passes the
  // spot's own coordinates, not a guarantee it's already in `spots`.
  useEffect(() => {
    if (!focusSpotId || hasOpenedFocusPopupRef.current || noCategoriesSelected)
      return;
    const marker = markerRefs.current.get(focusSpotId);
    if (marker) {
      marker.openPopup();
      hasOpenedFocusPopupRef.current = true;
    }
  }, [focusSpotId, spots, noCategoriesSelected]);

  // Individual-marker mode: refetches on pan/zoom/category change.
  useEffect(() => {
    if (!viewport || mode !== "markers") return;

    if (noCategoriesSelected) {
      hasFetchedRef.current = true;
      lastCountRef.current = 0;
      onViewChange?.({ count: 0, mode: "markers" });
      return;
    }

    let cancelled = false;
    getVerifiedSpotsInBounds(viewport.bounds, {
      limit: VIEWPORT_FETCH_LIMIT,
      categories: categoryList,
      minParkAreaM2,
      ...advancedFilters,
      activity,
      picnic,
    })
      .then((result) => {
        if (cancelled) return;
        hasFetchedRef.current = true;
        setSpots(result);
        lastCountRef.current = result.length;
        onViewChange?.({ count: result.length, mode: "markers" });
      })
      .catch((error) => {
        console.error("Failed to fetch spots in bounds", error);
        // Still report the mode on failure — see the heatmap effect's
        // identical fix below for why (mismatch between what onViewChange
        // last reported and what the map layer actually switched to).
        if (!cancelled) {
          lastCountRef.current = 0;
          onViewChange?.({ count: 0, mode: "markers" });
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onViewChange intentionally excluded: it's a per-render prop from the parent, not something a refetch should be keyed on.
  }, [
    viewport,
    mode,
    categoryList,
    minParkAreaM2,
    advancedFilters,
    activity,
    picnic,
  ]);

  // Heatmap mode: fetchSpotDensity (queries.ts) always passes its own fixed
  // GREEN_SPACE_CATEGORIES, not this component's categoryList — the density
  // view's category scope is an editorial decision (see that constant's
  // comment), not the user's live filter selection, so this effect only
  // depends on viewport. Toggling a category badge while zoomed out is a
  // documented no-op, not a bug (the dropdowns are disabled in this mode
  // for exactly this reason).
  useEffect(() => {
    if (!viewport || mode !== "heatmap") return;
    let cancelled = false;

    getSpotDensity(viewport.bounds)
      .then((buckets) => {
        if (cancelled) return;
        const points = buckets.map(
          (b) => [b.lat, b.lng, b.count] as L.HeatLatLngTuple,
        );
        setDensityPoints(points);
        const total = buckets.reduce((sum, b) => sum + b.count, 0);
        lastCountRef.current = total;
        onViewChange?.({ count: total, mode: "heatmap" });
      })
      .catch((error) => {
        console.error("Failed to fetch spot density", error);
        // Still report the mode even on failure — otherwise the page chrome
        // (title/legend/hint, disabled filter dropdowns, all driven by the
        // parent's own copy of `mode` from this callback) stays stuck
        // showing stale marker-mode UI while the map underneath has already
        // switched to a heatmap layer, just with no points in it.
        if (!cancelled) {
          lastCountRef.current = 0;
          onViewChange?.({ count: 0, mode: "heatmap" });
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onViewChange intentionally excluded, see marker-mode effect above.
  }, [viewport, mode]);

  return (
    <MapContainer
      center={initialCenter ?? NYC_CENTER}
      zoom={focusSpotId ? 16 : initialCenter ? 13 : DEFAULT_ZOOM}
      scrollWheelZoom
      className="h-full w-full"
    >
      {/* CARTO Positron: no API key required, minimal light basemap — the
          standard OSM raster tiles above render every road/label/POI, which
          reads as noisy at the zoom levels this app is used at. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
      />
      <ViewportWatcher onChange={handleViewportChange} />
      {mode === "markers" ? (
        // Clustered instead of one Marker+Popup DOM node per spot: at up to
        // 1000 spots in view (VIEWPORT_FETCH_LIMIT), unclustered rendering
        // was the main cause of map lag. Clustering collapses nearby pins
        // into a single count bubble until the user zooms in enough to
        // separate them, so the DOM node count stays bounded regardless of
        // how dense a viewport gets. The ref callback still registers each
        // Marker instance for the focusSpotId popup-opening effect above —
        // at focusSpotId's forced zoom (16), the pin it targets has already
        // separated out of any cluster.
        <MarkerClusterGroup chunkedLoading iconCreateFunction={clusterIcon}>
          {visibleSpots.map((spot) => {
            const verdict = getSpotVerdict(spot);
            return (
              <Marker
                key={spot.id}
                position={[spot.lat, spot.lng]}
                icon={markerIcon(CATEGORY_META[spot.category].color)}
                ref={(instance) => {
                  if (instance) markerRefs.current.set(spot.id, instance);
                  else markerRefs.current.delete(spot.id);
                }}
              >
                <Popup>
                  <div className="w-52 space-y-1.5">
                    {spot.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={spot.photo_url}
                        alt={spot.name}
                        className="h-24 w-full rounded object-cover"
                      />
                    )}
                    <p className="font-semibold leading-tight">{spot.name}</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{CATEGORY_META[spot.category].label}</span>
                      <span>·</span>
                      <span>
                        {spot.source === "official"
                          ? "Open data"
                          : "Community spot"}
                      </span>
                    </div>
                    {spot.description && (
                      <p className="text-xs">{spot.description}</p>
                    )}
                    <p
                      className={cn(
                        "text-xs",
                        verdict.tone === "caution"
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {verdict.label}
                    </p>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-xs font-medium text-primary underline underline-offset-2"
                    >
                      Get directions
                    </a>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      ) : (
        <>
          {/* Dashed outline, not a filled claim — this is the only honest
              signal of "trust this area's reading" the UI has, since there's
              no schema column marking which rows were deduped/cleaned (see
              coverage-regions.ts). Heat renders everywhere regardless (so
              panning across the boundary doesn't look broken), but only
              inside these outlines does explore-view.tsx's legend apply. */}
          {COVERAGE_REGIONS.map((region) => (
            <Rectangle
              key={region.name}
              bounds={[
                [region.bounds.minLat, region.bounds.minLng],
                [region.bounds.maxLat, region.bounds.maxLng],
              ]}
              pathOptions={{
                color: "#16a34a",
                weight: 1,
                fillOpacity: 0.03,
                dashArray: "4 4",
              }}
              interactive={false}
            />
          ))}
          <HeatmapLayer points={densityPoints} />
        </>
      )}
    </MapContainer>
  );
}
