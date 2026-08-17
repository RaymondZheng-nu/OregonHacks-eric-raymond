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
  useMap,
  useMapEvents,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import type { Spot, SpotCategory } from "@/lib/types";
import { CATEGORY_META } from "@/lib/categories";
import type { BoundingBox } from "@/lib/geo";
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

// Same visual as leaflet.markercluster's own default icon (identical
// size-tier className logic and DOM shape — see its
// `_defaultIconCreateFunction`), but with an accessible name. Leaflet sets
// role="button"/tabindex on the cluster's wrapper element whenever
// `keyboard` is on (the default) but the library never gives it a name —
// a screen reader hears a bare number with no indication it's a map
// cluster. `L.DivIcon` has no `title` option (unlike `L.Marker`, which
// applies its own `options.title` to the icon — not reachable here since
// MarkerCluster doesn't forward iconCreateFunction's return value into its
// own marker options), so this sets `aria-label` directly on the icon's
// inner element instead: the accessible-name computation for the outer
// role="button" wrapper falls back to "name from content," which resolves
// through a descendant's own aria-label rather than just its raw text.
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
  // Registry of live marker instances, keyed by spot id — lets the focus
  // effect below imperatively open one specific marker's popup once it's
  // actually rendered, without react-leaflet exposing that as a declarative
  // prop on <Marker>.
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());
  // Tracks which spot id's popup was last auto-opened, not just whether one
  // ever was — a plain boolean flag never resets, so a second "View on map"
  // navigation to a *different* spot (same SpotMap instance, still mounted
  // across a client-side searchParams change) would silently never open its
  // popup once the flag had already tripped once for an earlier spot.
  const openedFocusSpotIdRef = useRef<string | null>(null);

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

  // Debounces category/filter-driven refetches independently from viewport-
  // driven ones. `viewport` is already debounced upstream (ViewportWatcher's
  // own MOVE_DEBOUNCE_MS timer below, before handleViewportChange ever
  // fires) — without a *separate* debounce layer here, rapidly toggling
  // category checkboxes or Advanced-filter chips fired one full network
  // request per click (observed live: 7 requests for 7 rapid checkbox
  // toggles), where sharing viewport's timer would instead double pan/zoom's
  // perceived latency. filtersRef holds the latest values so the fetch
  // effect always reads current filters, not whatever was current when the
  // debounce timer was scheduled.
  const filtersRef = useRef({
    categoryList,
    minParkAreaM2,
    advancedFilters,
    activity,
    picnic,
  });
  const [debouncedFiltersTick, setDebouncedFiltersTick] = useState(0);
  const isFirstFilterRenderRef = useRef(true);
  useEffect(() => {
    // Ref writes must happen in an effect, not during render (React forbids
    // reading/writing ref.current in the render body) — safe here because
    // this effect re-runs on every filter-value change, strictly before
    // debouncedFiltersTick's own (delayed) update ever lets the fetch effect
    // below re-read filtersRef.current.
    filtersRef.current = { categoryList, minParkAreaM2, advancedFilters, activity, picnic };
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

  // No categories selected means "show nothing" — derived directly at render
  // time rather than via setState in the effect below, so there's no need to
  // dispatch a fetch (or a state update) just to represent an empty result.
  const noCategoriesSelected = categoryList.length === 0;
  const visibleSpots = noCategoriesSelected ? [] : spots;

  // Opens the focused marker's popup exactly once, as soon as it actually
  // exists in the currently-rendered set — the results list only passes the
  // spot's own coordinates, not a guarantee it's already in `spots`.
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

  // Instant "0 results" feedback for the zero-categories-selected state —
  // deliberately its own effect, not folded into the debounced fetch effect
  // below. noCategoriesSelected flips synchronously on every checkbox click
  // (not debounced); if it were a dependency of the fetch effect, every
  // transition across the zero boundary would re-run that whole effect
  // immediately and fire its own fetch, defeating debouncedFiltersTick's
  // coalescing for exactly the oscillating-through-zero case it exists to
  // handle (confirmed live: 5 rapid toggles through zero fired 4 separate
  // requests before this split, instead of the intended 1).
  useEffect(() => {
    if (!viewport || mode !== "markers" || !noCategoriesSelected) return;
    hasFetchedRef.current = true;
    onViewChange?.({ count: 0, mode: "markers" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onViewChange intentionally excluded, same reasoning as the fetch effect below.
  }, [viewport, mode, noCategoriesSelected]);

  // Individual-marker mode: refetches on pan/zoom (instant, pre-debounced
  // via ViewportWatcher) or category/filter change (debounced via
  // debouncedFiltersTick above — see its comment for why these need
  // separate debounce timers rather than sharing one). Does NOT depend on
  // noCategoriesSelected (see the effect above) — whether to skip this fetch
  // is instead decided from filtersRef.current.categoryList, the settled
  // value as of the last debounce tick, not the live per-render one.
  useEffect(() => {
    if (!viewport || mode !== "markers") return;

    const { categoryList, minParkAreaM2, advancedFilters, activity, picnic } =
      filtersRef.current;
    if (categoryList.length === 0) return;

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
        onViewChange?.({ count: result.length, mode: "markers" });
      })
      .catch((error) => {
        console.error("Failed to fetch spots in bounds", error);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onViewChange intentionally excluded: it's a per-render prop from the parent, not something a refetch should be keyed on. categoryList/minParkAreaM2/advancedFilters/activity/picnic intentionally excluded: read via filtersRef.current instead — debouncedFiltersTick is the deliberate proxy dependency for those.
  }, [viewport, mode, debouncedFiltersTick]);

  // Heatmap mode: the density RPC has no category param (deliberately — see
  // schema.sql), so this only depends on viewport, not categoryList. Toggling
  // a category badge while zoomed out is a documented no-op, not a bug.
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
        onViewChange?.({ count: total, mode: "heatmap" });
      })
      .catch((error) => {
        console.error("Failed to fetch spot density", error);
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
                // Leaflet's Marker sets role="button"/tabindex on its icon
                // element when `keyboard` is on (the default) but never an
                // accessible name — without `title` (which Leaflet applies
                // as the icon's `title` attribute), a screen reader announces
                // a bare, unlabeled "button" for every pin on the map.
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
        <HeatmapLayer points={densityPoints} />
      )}
    </MapContainer>
  );
}
