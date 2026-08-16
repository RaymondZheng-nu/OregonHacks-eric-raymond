"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CompassIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACTIVITY_OPTIONS } from "@/lib/activities";
import { CATEGORY_META } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type { SpotCategory } from "@/lib/types";

const MILES_TO_METERS = 1609.34;
const MY_LOCATION_LABEL = "My current location";

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

export function StartSessionDialog({ fullWidth }: { fullWidth?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Set<SpotCategory>>(new Set());
  const [activity, setActivity] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [address, setAddress] = useState("");
  const [myLocationCoords, setMyLocationCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [maxMiles, setMaxMiles] = useState("5");
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

  function selectActivity(option: (typeof ACTIVITY_OPTIONS)[number]) {
    const nextActivity = activity === option.value ? null : option.value;
    setActivity(nextActivity);

    if (nextActivity && option.impliesCategory) {
      setCategories((prev) => new Set(prev).add(option.impliesCategory as SpotCategory));
      setErrors((prev) => ({ ...prev, categories: undefined }));
    }
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
    if (activity) params.set("activity", activity);

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

      const miles = parseFloat(maxMiles);
      if (Number.isFinite(miles) && miles > 0) {
        params.set("radius", String(Math.round(miles * MILES_TO_METERS)));
      }
    }

    router.push(`/explore?${params.toString()}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="lg" className={fullWidth ? "w-full" : undefined}>
            Take a quiz
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Find your spot</DialogTitle>
          <DialogDescription>
            A couple quick questions and we&apos;ll point you to real spots nearby.
          </DialogDescription>
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
            <Label>What do you want to do there? (optional)</Label>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_OPTIONS.map((option) => {
                const active = activity === option.value;
                return (
                  <Badge
                    key={option.value}
                    variant="outline"
                    render={
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => selectActivity(option)}
                      />
                    }
                    className={cn(
                      "h-9 cursor-pointer select-none px-3.5 transition-[opacity,background-color,color] duration-200 ease-out",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "opacity-40"
                    )}
                  >
                    {option.label}
                  </Badge>
                );
              })}
            </div>
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
            <div className="space-y-2">
              <Label htmlFor="max-miles">How far will you go? (miles)</Label>
              <Input
                id="max-miles"
                type="number"
                min="1"
                inputMode="numeric"
                value={maxMiles}
                onChange={(e) => setMaxMiles(e.target.value)}
              />
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
