"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import { CATEGORY_META } from "@/lib/categories";
import { markerIcon } from "@/lib/leaflet-marker";
import type { SpotCategory } from "@/lib/types";

const PREVIEW_ZOOM = 15;
// These embed inside dialogs that animate open. Leaflet measures its container
// once at mount, so mounting mid-animation reads the wrong (often zero) size and
// never fetches tiles. invalidateSize() after the animation settles fixes it.
const INVALIDATE_DELAY_MS = 300;

function InvalidateSizeOnMount() {
  const map = useMap();
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), INVALIDATE_DELAY_MS);
    return () => clearTimeout(id);
  }, [map]);
  return null;
}

// MapContainer reads center/zoom only at construction, not reactively. This
// instance is reused as lat/lng change, so recenter imperatively or the view
// stays stuck on the first spot while only the Marker moves.
function RecenterOnChange({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], PREVIEW_ZOOM);
  }, [map, lat, lng]);
  return null;
}

// Small live map fallback for a photo-less spot. Dragging off by default (it's
// a preview anchored to one point, not a browsable map); scroll-zoom off
// everywhere so a wheel event doesn't hijack the surrounding card's scroll.
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
