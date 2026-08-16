"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CompassIcon, Footprints, Bike, Car, TrainFront } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_META } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type { SpotCategory } from "@/lib/types";

const MY_LOCATION_LABEL = "My current location";

type TransportMode = "walk" | "bike" | "drive" | "transit";

// Straight-line radius, not a routed isochrone — this app has no routing API,
// so travel time is approximated from a flat average speed per mode. Good
// enough to size the map's initial viewport; not meant to promise "reachable
// in N minutes" accuracy the way real turn-by-turn routing would.
const MODE_SPEED_KMH: Record<TransportMode, number> = {
  walk: 5,
  bike: 15,
  drive: 40,
  transit: 20,
};

const MODE_META: Record<TransportMode, { label: string; icon: typeof Footprints }> = {
  walk: { label: "Walk", icon: Footprints },
  bike: { label: "Bike", icon: Bike },
  drive: { label: "Drive", icon: Car },
  transit: { label: "Transit", icon: TrainFront },
};

const DEFAULT_MODE: TransportMode = "walk";
const DEFAULT_MINUTES = "15";

function minutesToRadiusMeters(minutes: number, mode: TransportMode): number {
  const metersPerMinute = (MODE_SPEED_KMH[mode] * 1000) / 60;
  return Math.round(minutes * metersPerMinute);
}

async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const results: { lat: string; lon: string }[] = await res.json();
  if (results.length === 0) return null;

  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
}

// Dialog-wrapped questionnaire — same trigger/API shape as the old
// StartSessionDialog (fullWidth prop, "Start session" trigger button, so
// sticky-mobile-cta.tsx's usage carries over unchanged), but with a richer
// form (transport mode + travel time, not just a flat miles radius).
export function SessionQuestionnaire({ fullWidth }: { fullWidth?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Set<SpotCategory>>(new Set());
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [address, setAddress] = useState("");
  const [myLocationCoords, setMyLocationCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [mode, setMode] = useState<TransportMode>(DEFAULT_MODE);
  const [maxMinutes, setMaxMinutes] = useState(DEFAULT_MINUTES);
  const [errors, setErrors] = useState<{ categories?: string; address?: string }>({});

  function toggleCategory(category: SpotCategory) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
    setErrors((prev) => ({ ...prev, categories: undefined }));
  }

  function useMyLocation() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLocationCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setAddress(MY_LOCATION_LABEL);
        setLocating(false);
      },
      () => {
        toast.error("Couldn't get your location, enter an address instead");
        setLocating(false);
      }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (categories.size === 0) {
      setErrors((prev) => ({ ...prev, categories: "Pick at least one kind of spot" }));
      return;
    }

    const params = new URLSearchParams();
    params.set("cats", Array.from(categories).join(","));

    if (address.trim()) {
      setSubmitting(true);
      const coords =
        address === MY_LOCATION_LABEL && myLocationCoords
          ? myLocationCoords
          : await geocodeAddress(address.trim());
      setSubmitting(false);

      if (!coords) {
        setErrors((prev) => ({
          ...prev,
          address: "Couldn't find that address, try being more specific",
        }));
        return;
      }

      params.set("lat", String(coords.lat));
      params.set("lng", String(coords.lng));

      const minutes = parseFloat(maxMinutes);
      if (Number.isFinite(minutes) && minutes > 0) {
        params.set("radius", String(minutesToRadiusMeters(minutes, mode)));
      }
    }

    router.push(`/swipe?${params.toString()}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="lg" className={fullWidth ? "w-full" : undefined}>
            Start session
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Find spots near you</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>What are you into?</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CATEGORY_META).map(([key, meta]) => {
                const category = key as SpotCategory;
                const active = categories.has(category);
                return (
                  <Badge
                    key={key}
                    variant="outline"
                    render={
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleCategory(category)}
                      />
                    }
                    className={cn(
                      "h-9 cursor-pointer select-none px-3.5 transition-[opacity,background-color,color] duration-200 ease-out",
                      !active && "opacity-40"
                    )}
                    style={{
                      borderColor: meta.color,
                      color: active ? meta.color : undefined,
                      backgroundColor: active ? `${meta.color}1a` : undefined,
                    }}
                  >
                    {meta.label}
                  </Badge>
                );
              })}
            </div>
            {errors.categories && (
              <p className="text-xs text-destructive">{errors.categories}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Where are you?</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="address"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  if (e.target.value !== MY_LOCATION_LABEL) {
                    setMyLocationCoords(null);
                  }
                  if (errors.address) setErrors((prev) => ({ ...prev, address: undefined }));
                }}
                placeholder="Address, city, or zip code"
                aria-invalid={!!errors.address}
              />
              <Button
                type="button"
                variant="outline"
                onClick={useMyLocation}
                disabled={locating}
                className="shrink-0"
              >
                <CompassIcon aria-hidden="true" />
                {locating ? "Locating…" : "Use my location"}
              </Button>
            </div>
            {errors.address ? (
              <p className="text-xs text-destructive">{errors.address}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Optional. Skip this to browse spots across the whole country.
              </p>
            )}
          </div>

          {address.trim() && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Getting there by</Label>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(MODE_META) as [TransportMode, typeof MODE_META[TransportMode]][]).map(
                    ([key, meta]) => {
                      const active = mode === key;
                      const Icon = meta.icon;
                      return (
                        <Badge
                          key={key}
                          variant="outline"
                          render={
                            <button
                              type="button"
                              aria-pressed={active}
                              onClick={() => setMode(key)}
                            />
                          }
                          className={cn(
                            "h-9 cursor-pointer select-none gap-1.5 px-3.5 transition-[opacity,background-color,color] duration-200 ease-out",
                            !active && "opacity-40"
                          )}
                        >
                          <Icon aria-hidden="true" className="size-3.5" />
                          {meta.label}
                        </Badge>
                      );
                    }
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-minutes">Max travel time (minutes)</Label>
                <Input
                  id="max-minutes"
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={maxMinutes}
                  onChange={(e) => setMaxMinutes(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Finding spots…" : "Find my spots"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
