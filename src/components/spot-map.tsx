"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { Spot } from "@/lib/types";
import { CATEGORY_META } from "@/lib/categories";

const NYC_CENTER: [number, number] = [40.7484, -73.9857];

function markerIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

export function SpotMap({
  spots,
  center,
}: {
  spots: Spot[];
  center?: [number, number];
}) {
  return (
    <MapContainer
      center={center ?? NYC_CENTER}
      zoom={center ? 13 : 11}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {spots.map((spot) => (
        <Marker
          key={spot.id}
          position={[spot.lat, spot.lng]}
          icon={markerIcon(CATEGORY_META[spot.category].color)}
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
                  {spot.source === "official" ? "NYC Open Data" : "Community spot"}
                </span>
              </div>
              {spot.description && (
                <p className="text-xs">{spot.description}</p>
              )}
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
      ))}
    </MapContainer>
  );
}
