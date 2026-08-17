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
import { TicketIcon } from "lucide-react";
import type { FreeActivityTip, Spot, SpotCategory } from "@/lib/types";
import { CATEGORY_META } from "@/lib/categories";
import { clampBoundsSpan, type BoundingBox } from "@/lib/geo";
import { COVERAGE_REGIONS } from "@/lib/coverage-regions";
import {
  getVerifiedSpotsInBounds,
  getSpotDensity,
  getVerifiedTips,
} from "@/lib/supabase/queries.client";
import type { SpotsInBoundsOptions } from "@/lib/supabase/queries";
import { getSpotVerdict } from "@/lib/spot-verdict";
import { markerIcon } from "@/lib/leaflet-marker";
import { SuggestTipDialog } from "@/components/suggest-tip-dialog";
import { cn } from "@/lib/utils";

export type AdvancedFilters = Pick<
  SpotsInBoundsOptions,
  "sizeClasses" | "amenities" | "wheelchairAccessibleOnly" | "climbingGrades"
>;

const PORTLAND_CENTER: [number, number] = [45.5152, -122.6784];
const DEFAULT_ZOOM = 11;

// Below this zoom the viewport spans multiple cities — too many pins to render,
// so show a density heatmap instead of individual markers.
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

// Reports bounds/zoom on mount and after every pan/zoom, debounced. onChange is
// kept in a ref so the handlers object stays stable — otherwise react-leaflet
// re-registers the native listeners on every render.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `map` is assigned after this memo but only referenced inside handlers that fire post-mount.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only, reports the map's initial bounds once.
  }, []);

  return null;
}

// leaflet.heat references a bare global `L` instead of importing it, so a
// static import throws "L is not defined" under the bundler. Expose window.L
// first, then import it dynamically.
let heatPluginPromise: Promise<unknown> | null = null;
function loadHeatPlugin(): Promise<unknown> {
  if (!heatPluginPromise) {
    (window as unknown as { L: typeof L }).L = L;
    heatPluginPromise = import("leaflet.heat").catch((error) => {
      // Don't cache a failed load, or a transient error disables the heatmap
      // for the whole session (every future mount awaits the same dead promise).
      heatPluginPromise = null;
      throw error;
    });
  }
  return heatPluginPromise;
}

// leaflet.heat normalizes weights against `max` (default 1.0) to pick a
// gradient stop. Real bucket counts run ~10-55 (Portland up to ~70, NYC ~190),
// so the default saturates nearly everything to "hottest" and kills the
// gradient. 40 ≈ observed p75-p90; rare outliers still clip, which is correct.
// Re-check once the RPC's GREEN_SPACE_CATEGORIES filter is live — counts drop.
const HEATMAP_MAX_INTENSITY = 40;

// Green ramp, not the default blue-to-red "heat" — reads as "more green space,"
// not danger. Lowest stop isn't transparent (the library default hides anything
// below ~40% of max) so a sparse bucket still shows instead of vanishing.
const HEATMAP_GRADIENT: Record<number, string> = {
  0.15: "#bbf7d0",
  0.4: "#4ade80",
  0.65: "#16a34a",
  1: "#14532d",
};

// No react-leaflet binding for leaflet.heat, so manage the L.heatLayer by hand.
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
// nominal type. aria-label on the wrapper (count itself is aria-hidden) gives
// the cluster an accessible name — Leaflet marks it role="button" but leaves
// it nameless otherwise, so a screen reader would hear a bare number.
function clusterIcon(cluster: { getChildCount(): number }): L.DivIcon {
  const count = cluster.getChildCount();
  const tier =
    CLUSTER_TIERS.find((t) => count < t.max) ??
    CLUSTER_TIERS[CLUSTER_TIERS.length - 1];
  return L.divIcon({
    className: "",
    html: `<div aria-label="Cluster of ${count} spots — click to zoom in" style="width:${tier.size}px;height:${tier.size}px;border-radius:9999px;background:${tier.bg};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:${tier.text};font:600 ${tier.size >= 46 ? 14 : 12}px system-ui,sans-serif;"><span aria-hidden="true">${count}</span></div>`,
    iconSize: [tier.size, tier.size],
    iconAnchor: [tier.size / 2, tier.size / 2],
  });
}

// Tips are fetched lazily on popup open, not eagerly per marker — up to
// VIEWPORT_FETCH_LIMIT markers can be mounted at once, and firing a tips
// fetch for all of them on mount would spam the DB for popups nobody opens.
function SpotMarker({
  spot,
  markerRefs,
}: {
  spot: Spot;
  markerRefs: React.MutableRefObject<Map<string, L.Marker>>;
}) {
  const verdict = getSpotVerdict(spot);
  const [tips, setTips] = useState<FreeActivityTip[]>([]);
  const tipsFetchedRef = useRef(false);

  return (
    <Marker
      position={[spot.lat, spot.lng]}
      icon={markerIcon(CATEGORY_META[spot.category].color)}
      // Leaflet marks the icon role="button" but gives it no name;
      // `title` becomes its accessible name so pins aren't bare buttons.
      title={spot.name}
      ref={(instance) => {
        if (instance) markerRefs.current.set(spot.id, instance);
        else markerRefs.current.delete(spot.id);
      }}
      eventHandlers={{
        popupopen: () => {
          if (tipsFetchedRef.current) return;
          tipsFetchedRef.current = true;
          getVerifiedTips(spot.id).then(setTips);
        },
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
              {spot.source === "official" ? "Open data" : "Community spot"}
            </span>
          </div>
          {spot.description && (
            <p className="text-xs">{spot.description}</p>
          )}
          {tips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tips.map((tip) => (
                <span
                  key={tip.id}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  <TicketIcon aria-hidden="true" className="size-3" />
                  {tip.tip}
                </span>
              ))}
            </div>
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
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-primary underline underline-offset-2"
            >
              Get directions
            </a>
            <a
              href={`/spot/${spot.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground underline underline-offset-2"
            >
              Share
            </a>
          </div>
          <div className="flex justify-end">
            <SuggestTipDialog spotId={spot.id} />
          </div>
        </div>
      </Popup>
    </Marker>
  );
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
  // Live marker instances by spot id, so the focus effect can open one popup
  // imperatively (react-leaflet has no declarative prop for it).
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());
  // Which spot's popup was last auto-opened. Tracks the id, not a bool: a
  // second "View on map" to a different spot on the same mounted instance
  // needs to open its popup too, which a one-shot flag would block.
  const openedFocusSpotIdRef = useRef<string | null>(null);
  // Last count either mode-effect reported, read by the mode-change effect
  // below so it never has to report a false "0" while a fresh fetch for the
  // new mode is still in flight. Seeded from initialSpots.length, not 0 —
  // explore-view.tsx's own visibleCount state starts there too, and the
  // mode-change effect fires once immediately on mount (mode has to "change"
  // from nothing to its first value); without this seed that first report
  // would flash the header's spot count to 0 before the real fetch resolves,
  // a regression from today's SSR-seeded first paint.
  const lastCountRef = useRef(initialSpots.length);

  // initialSpots (SSR default viewport) only wins until the first client fetch;
  // after that, reapplying it would clobber wherever the user has panned to. A
  // new initialSpots before that point (e.g. router.refresh()) still applies.
  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (!hasFetchedRef.current) setSpots(initialSpots);
  }, [initialSpots]);

  const categoryList = useMemo(
    () => Array.from(categories).sort(),
    [categories],
  );

  // Debounces filter-driven refetches separately from viewport-driven ones
  // (viewport is already debounced in ViewportWatcher). Sharing one timer would
  // double pan latency; no debounce fired one request per checkbox click
  // (observed: 7 toggles → 7 requests). filtersRef holds the latest values so
  // the fetch reads current filters, not what was set when the timer scheduled.
  const filtersRef = useRef({
    categoryList,
    minParkAreaM2,
    advancedFilters,
    activity,
    picnic,
  });
  const [debouncedFiltersTick, setDebouncedFiltersTick] = useState(0);
  // Bumped on every filter change so an in-flight fetch under old filters can
  // detect it's stale and drop its late result instead of clobbering a newer one.
  const filterRevisionRef = useRef(0);
  const isFirstFilterRenderRef = useRef(true);
  useEffect(() => {
    // Write the ref in the effect, not render. Runs on every filter change,
    // before the delayed debouncedFiltersTick lets the fetch effect re-read it.
    filtersRef.current = { categoryList, minParkAreaM2, advancedFilters, activity, picnic };
    filterRevisionRef.current += 1;
    if (isFirstFilterRenderRef.current) {
      isFirstFilterRenderRef.current = false;
      return;
    }
    const id = setTimeout(
      () => setDebouncedFiltersTick((t) => t + 1),
      MOVE_DEBOUNCE_MS,
    );
    return () => clearTimeout(id);
  }, [categoryList, minParkAreaM2, advancedFilters, activity, picnic]);

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

  // No categories = show nothing. Derived at render, so no fetch needed for it.
  const noCategoriesSelected = categoryList.length === 0;
  const visibleSpots = noCategoriesSelected ? [] : spots;

  // Open the focused marker's popup once it exists in the rendered set — the
  // results list passes coords, not a guarantee the spot is already in `spots`.
  useEffect(() => {
    if (
      !focusSpotId ||
      openedFocusSpotIdRef.current === focusSpotId ||
      noCategoriesSelected
    )
      return;
    const marker = markerRefs.current.get(focusSpotId);
    if (marker) {
      marker.openPopup();
      openedFocusSpotIdRef.current = focusSpotId;
    }
  }, [focusSpotId, spots, noCategoriesSelected]);

  // Instant "0 results" for the no-categories state — kept separate from the
  // fetch effect on purpose. noCategoriesSelected flips synchronously per click;
  // as a fetch dependency it would fire a request on every zero-crossing,
  // defeating the debounce (observed: 5 toggles through zero → 4 requests, not 1).
  useEffect(() => {
    if (!viewport || mode !== "markers" || !noCategoriesSelected) return;
    hasFetchedRef.current = true;
    lastCountRef.current = 0;
    onViewChange?.({ count: 0, mode: "markers" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onViewChange excluded, same as the fetch effect below.
  }, [viewport, mode, noCategoriesSelected]);

  // Marker mode: refetch on pan/zoom (pre-debounced) or filter change (debounced
  // via debouncedFiltersTick). Skips based on filtersRef.current.categoryList
  // (settled as of the last tick), not the live noCategoriesSelected.
  useEffect(() => {
    if (!viewport || mode !== "markers") return;

    const { categoryList, minParkAreaM2, advancedFilters, activity, picnic } =
      filtersRef.current;
    if (categoryList.length === 0) return;

    let cancelled = false;
    const filterRevision = filterRevisionRef.current;
    getVerifiedSpotsInBounds(viewport.bounds, {
      limit: VIEWPORT_FETCH_LIMIT,
      categories: categoryList,
      minParkAreaM2,
      ...advancedFilters,
      activity,
      picnic,
    })
      .then((result) => {
        if (cancelled || filterRevision !== filterRevisionRef.current) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onViewChange excluded (per-render prop). Filters read via filtersRef.current; debouncedFiltersTick is their proxy dependency.
  }, [viewport, mode, debouncedFiltersTick]);

  // Heatmap mode: fetchSpotDensity uses its own fixed GREEN_SPACE_CATEGORIES,
  // not categoryList, so this only depends on viewport. Toggling a category
  // while zoomed out is a no-op by design (the dropdowns are disabled here).
  useEffect(() => {
    if (!viewport || mode !== "heatmap") return;
    let cancelled = false;

    getSpotDensity(clampBoundsSpan(viewport.bounds))
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onViewChange excluded, see marker-mode effect above.
  }, [viewport, mode]);

  return (
    <MapContainer
      center={initialCenter ?? PORTLAND_CENTER}
      zoom={focusSpotId ? 16 : initialCenter ? 13 : DEFAULT_ZOOM}
      scrollWheelZoom
      className="h-full w-full"
    >
      {/* CARTO Positron: no API key, minimal basemap. Standard OSM tiles render
          every road/label/POI, too noisy at the zoom levels used here. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
      />
      <ViewportWatcher onChange={handleViewportChange} />
      {mode === "markers" ? (
        // Clustered: up to 1000 markers in view (VIEWPORT_FETCH_LIMIT) was the
        // main cause of map lag. Clustering keeps the DOM node count bounded.
        // At focusSpotId's forced zoom (16) the target pin is already separated.
        <MarkerClusterGroup chunkedLoading iconCreateFunction={clusterIcon}>
          {visibleSpots.map((spot) => (
            <SpotMarker key={spot.id} spot={spot} markerRefs={markerRefs} />
          ))}
        </MarkerClusterGroup>
      ) : (
        <>
          {/* Dashed outlines mark where the data was actually deduped/cleaned
              (no schema column tracks this — see coverage-regions.ts). Heat
              renders everywhere, but the legend only applies inside these. */}
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
