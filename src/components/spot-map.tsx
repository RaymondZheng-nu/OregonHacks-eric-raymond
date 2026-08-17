"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
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
import { clampBoundsSpan, type BoundingBox } from "@/lib/geo";
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

const PORTLAND_CENTER: [number, number] = [45.5152, -122.6784];
const DEFAULT_ZOOM = 11;

// Below this zoom the viewport spans multiple cities — too many pins to render,
// so show a density heatmap instead of individual markers.
const HEATMAP_ZOOM_THRESHOLD = 10;
const VIEWPORT_FETCH_LIMIT = 1000;
const MOVE_DEBOUNCE_MS = 300;

export type MapMode = "markers" | "heatmap";
type Viewport = { bounds: BoundingBox; zoom: number };

// Matches markercluster's default icon but adds an accessible name: Leaflet
// gives the cluster role="button" with no label, so a screen reader hears a
// bare number. L.DivIcon has no `title` option, so set aria-label on the inner
// element — the wrapper's accessible name resolves through its descendant.
function clusterIcon(cluster: { getChildCount: () => number }) {
  const childCount = cluster.getChildCount();
  const sizeClass =
    childCount < 10 ? "small" : childCount < 100 ? "medium" : "large";

  return L.divIcon({
    html: `<div aria-label="Cluster of ${childCount} spots — click to zoom in"><span aria-hidden="true">${childCount}</span></div>`,
    className: `marker-cluster marker-cluster-${sizeClass}`,
    iconSize: L.point(40, 40),
  });
}

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
        onViewChange?.({ count: result.length, mode: "markers" });
      })
      .catch((error) => {
        console.error("Failed to fetch spots in bounds", error);
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
        onViewChange?.({ count: total, mode: "heatmap" });
      })
      .catch((error) => {
        console.error("Failed to fetch spot density", error);
        // Report the mode even on failure, or the parent's chrome stays stuck
        // in marker-mode UI while the map has already switched to an empty heatmap.
        if (!cancelled) onViewChange?.({ count: 0, mode: "heatmap" });
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
          {visibleSpots.map((spot) => {
            const verdict = getSpotVerdict(spot);
            return (
              <Marker
                key={spot.id}
                position={[spot.lat, spot.lng]}
                icon={markerIcon(CATEGORY_META[spot.category].color)}
                // Leaflet marks the icon role="button" but gives it no name;
                // `title` becomes its accessible name so pins aren't bare buttons.
                title={spot.name}
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
