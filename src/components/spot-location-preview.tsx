"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { CATEGORY_META } from "@/lib/categories";
import { markerIcon } from "@/lib/leaflet-marker";
import type { SpotCategory } from "@/lib/types";

const PREVIEW_ZOOM = 15;

// Interactive fallback for a spot with no real photo — a small live map
// centered on the spot instead of a flat color tile, so "no photo" still
// shows something real and explorable. Scroll-zoom is off since these embed
// inside scrollable cards/carousels (a wheel event over the map shouldn't
// hijack the page scroll); zoom is still reachable via the +/- control and
// pinch/touch gestures.
export function SpotLocationPreview({
  lat,
  lng,
  category,
  draggable = true,
}: {
  lat: number;
  lng: number;
  category: SpotCategory;
  // Off inside the landing carousel — a drag started on that slide's map
  // would otherwise fight the carousel's own native swipe-to-advance
  // scrolling. Zoom (+/- control, pinch) still works either way.
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
    </MapContainer>
  );
}
