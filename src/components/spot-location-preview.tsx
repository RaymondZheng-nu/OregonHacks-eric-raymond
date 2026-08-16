"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import { CATEGORY_META } from "@/lib/categories";
import { markerIcon } from "@/lib/leaflet-marker";
import type { SpotCategory } from "@/lib/types";

const PREVIEW_ZOOM = 15;
// These embed inside things that animate open (the results Dialog scales in
// from 95%, per dialog.tsx's duration-100 transition) — Leaflet measures its
// container's size once at mount, and mounting mid-animation means it can
// measure the wrong (sometimes zero) size and never fetch any tiles, leaving
// a blank color block. invalidateSize() after the animation settles fixes it.
const INVALIDATE_DELAY_MS = 300;

function InvalidateSizeOnMount() {
  const map = useMap();
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), INVALIDATE_DELAY_MS);
    return () => clearTimeout(id);
  }, [map]);
  return null;
}

// react-leaflet only reads MapContainer's `center`/`zoom` props once, at
// construction — they're not reactive like a normal controlled prop. The
// results popup reuses a single SpotLocationPreview instance while paging
// through spots (only lat/lng change underneath it), so without this the
// view stayed stuck on whichever spot happened to be first, even though
// the Marker itself (a genuinely reactive react-leaflet component) moved.
function RecenterOnChange({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], PREVIEW_ZOOM);
  }, [map, lat, lng]);
  return null;
}

// Interactive-but-locked fallback for a spot with no real photo — a small
// live map centered on the spot instead of a flat color tile, so "no photo"
// still shows something real. Dragging is off by default: this is a location
// preview anchored to one point, not a browsable map, and letting it pan
// makes it feel like a broken/empty void once you've dragged the pin out of
// view. Zoom (+/- control, pinch) still works. Scroll-zoom is off everywhere
// since these embed inside scrollable cards/carousels — a wheel event over
// the map shouldn't hijack the page scroll.
export function SpotLocationPreview({
  lat,
  lng,
  category,
  draggable = false,
}: {
  lat: number;
  lng: number;
  category: SpotCategory;
  draggable?: boolean;
}) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={PREVIEW_ZOOM}
      scrollWheelZoom={false}
      dragging={draggable}
      attributionControl={false}
      className="h-full w-full"
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker
        position={[lat, lng]}
        icon={markerIcon(CATEGORY_META[category].color)}
      />
      <InvalidateSizeOnMount />
      <RecenterOnChange lat={lat} lng={lng} />
    </MapContainer>
  );
}
