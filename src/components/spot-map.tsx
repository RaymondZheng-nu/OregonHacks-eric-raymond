"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { Spot, SpotCategory } from "@/lib/types";
import { CATEGORY_META } from "@/lib/categories";
import type { BoundingBox } from "@/lib/geo";
import {
  getVerifiedSpotsInBounds,
  getSpotDensity,
} from "@/lib/supabase/queries.client";
import { getSpotVerdict } from "@/lib/spot-verdict";
import { markerIcon } from "@/lib/leaflet-marker";
import { cn } from "@/lib/utils";

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
}: {
  initialSpots: Spot[];
  categories: Set<SpotCategory>;
  activity?: string;
  picnic?: boolean;
  initialCenter?: [number, number];
  focusSpotId?: string;
  onViewChange?: (info: { count: number; mode: MapMode }) => void;
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
      onViewChange?.({ count: 0, mode: "markers" });
      return;
    }

    let cancelled = false;
    getVerifiedSpotsInBounds(viewport.bounds, {
      limit: VIEWPORT_FETCH_LIMIT,
      categories: categoryList,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onViewChange intentionally excluded: it's a per-render prop from the parent, not something a refetch should be keyed on.
  }, [viewport, mode, categoryList, activity, picnic]);

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
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ViewportWatcher onChange={handleViewportChange} />
      {mode === "markers" ? (
        visibleSpots.map((spot) => {
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
        })
      ) : (
        <HeatmapLayer points={densityPoints} />
      )}
    </MapContainer>
  );
}
