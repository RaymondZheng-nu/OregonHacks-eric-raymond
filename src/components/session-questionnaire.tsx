"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CompassIcon, Footprints, Bike, Car, TrainFront } from "lucide-react";
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
import { SwipeModal } from "@/components/swipe-modal";
import { CATEGORY_META, SELECTABLE_CATEGORIES } from "@/lib/categories";
import { VIBE_OPTIONS } from "@/lib/vibes";
import { clampRadiusMeters } from "@/lib/geo";
import { geocodeAddress } from "@/lib/geocode";
import { cn } from "@/lib/utils";
import type { SpotCategory } from "@/lib/types";

const MY_LOCATION_LABEL = "My current location";
const TOTAL_STEPS = 3;

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

const MODE_META: Record<
  TransportMode,
  { label: string; icon: typeof Footprints }
> = {
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

// Dialog-wrapped questionnaire — same trigger/API shape as the old
// StartSessionDialog (fullWidth prop, "Start session" trigger button, so
// sticky-mobile-cta.tsx's usage carries over unchanged), but with a richer,
// multi-step form (category + vibe + transport mode/travel time, not just a
// flat miles radius). Submits by handing off to SwipeModal — the swipe deck
// is this app's centerpiece flow, so the quiz's job is to seed it. It opens
// as a sibling Dialog instead of a router.push to /swipe, so the page this
// was opened from (today, always "/") stays mounted and visible behind it,
// same as every other dialog in the app.
export function SessionQuestionnaire({
  fullWidth,
  large,
}: {
  fullWidth?: boolean;
  // The quiz is the main entry point into the whole app — the hero CTA on
  // the landing page uses this to stand out from every other button on the
  // page, while the sticky mobile bar (constrained height) stays default.
  large?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [swipeQuery, setSwipeQuery] = useState<URLSearchParams | null>(null);
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState<Set<SpotCategory>>(new Set());
  const [vibe, setVibe] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [address, setAddress] = useState("");
  const [myLocationCoords, setMyLocationCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [mode, setMode] = useState<TransportMode>(DEFAULT_MODE);
  const [maxMinutes, setMaxMinutes] = useState(DEFAULT_MINUTES);
  const [errors, setErrors] = useState<{
    categories?: string;
    address?: string;
  }>({});

  function toggleCategory(category: SpotCategory) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
    setErrors((prev) => ({ ...prev, categories: undefined }));
  }

  function selectVibe(value: string) {
    setVibe((prev) => (prev === value ? null : value));
  }

  function goNext() {
    if (step === 0 && categories.size === 0) {
      setErrors((prev) => ({
        ...prev,
        categories: "Pick at least one kind of spot",
      }));
      return;
    }
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) setStep(0);
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
      },
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (categories.size === 0) {
      setErrors((prev) => ({
        ...prev,
        categories: "Pick at least one kind of spot",
      }));
      return;
    }

    const params = new URLSearchParams();
    params.set("cats", Array.from(categories).join(","));

    const selectedVibe = VIBE_OPTIONS.find((option) => option.value === vibe);
    if (selectedVibe) {
      if (selectedVibe.kind === "activity")
        params.set("activity", selectedVibe.activity);
      else params.set("picnic", "1");
    }

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
        params.set(
          "radius",
          String(clampRadiusMeters(minutesToRadiusMeters(minutes, mode))),
        );
      }
    }

    setOpen(false);
    setSwipeQuery(params);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger
          render={
            <Button
              size="lg"
              className={cn(
                fullWidth && "w-full",
                large &&
                  "h-auto px-8 py-4 text-2xl font-bold tracking-tight transition-transform duration-200 ease-out hover:scale-[1.02]",
              )}
            >
              Take a quiz
            </Button>
          }
        />
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Find your spot</DialogTitle>
            <DialogDescription>
              A couple quick questions and we&apos;ll point you to real spots
              nearby.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-center gap-1.5" aria-hidden="true">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-200 ease-out",
                  i === step
                    ? "w-5 bg-primary"
                    : "w-1.5 bg-muted-foreground/30",
                )}
              />
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div
              key={step}
              className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 motion-safe:ease-out"
            >
              {step === 0 && (
                <div className="space-y-2">
                  <Label>What are you into?</Label>
                  <div className="flex flex-wrap gap-2">
                    {SELECTABLE_CATEGORIES.map((category) => {
                      const meta = CATEGORY_META[category];
                      const active = categories.has(category);
                      return (
                        <Badge
                          key={category}
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
                            !active && "opacity-40",
                          )}
                          style={{
                            borderColor: meta.color,
                            color: active ? meta.color : undefined,
                            backgroundColor: active
                              ? `${meta.color}1a`
                              : undefined,
                          }}
                        >
                          {meta.label}
                        </Badge>
                      );
                    })}
                  </div>
                  {errors.categories && (
                    <p className="text-xs text-destructive">
                      {errors.categories}
                    </p>
                  )}
                </div>
              )}

              {step === 1 && (
                <div className="space-y-2">
                  <Label>What&apos;s the vibe? (optional)</Label>
                  <div className="flex flex-wrap gap-2">
                    {VIBE_OPTIONS.map((option) => {
                      const active = vibe === option.value;
                      return (
                        <Badge
                          key={option.value}
                          variant="outline"
                          render={
                            <button
                              type="button"
                              aria-pressed={active}
                              onClick={() => selectVibe(option.value)}
                            />
                          }
                          className={cn(
                            "h-9 cursor-pointer select-none px-3.5 transition-[opacity,background-color,color] duration-200 ease-out",
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "opacity-40",
                          )}
                        >
                          {option.label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
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
                          if (errors.address)
                            setErrors((prev) => ({
                              ...prev,
                              address: undefined,
                            }));
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
                      <p className="text-xs text-destructive">
                        {errors.address}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Optional. Skip this to browse spots across the whole
                        country.
                      </p>
                    )}
                  </div>

                  {address.trim() && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Getting there by</Label>
                        <div className="flex flex-wrap gap-2">
                          {(
                            Object.entries(MODE_META) as [
                              TransportMode,
                              (typeof MODE_META)[TransportMode],
                            ][]
                          ).map(([key, meta]) => {
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
                                  !active && "opacity-40",
                                )}
                              >
                                <Icon aria-hidden="true" className="size-3.5" />
                                {meta.label}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="max-minutes">
                          Max travel time (minutes)
                        </Label>
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
                </div>
              )}
            </div>

            <DialogFooter>
              {step > 0 && (
                <Button type="button" variant="outline" onClick={goBack}>
                  Back
                </Button>
              )}
              {/* Distinct `key`s force React to swap DOM nodes here instead of
                mutating one button's `type` in place — without them, clicking
                "Next" on the second-to-last step flips the very node just
                clicked to type="submit" mid-event, and the browser submits
                the form as part of that same click. */}
              {step < TOTAL_STEPS - 1 ? (
                <Button key="next" type="button" onClick={goNext}>
                  Next
                </Button>
              ) : (
                <Button key="submit" type="submit" disabled={submitting}>
                  {submitting ? "Finding spots…" : "Find my spots"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {swipeQuery && (
        <SwipeModal query={swipeQuery} onClose={() => setSwipeQuery(null)} />
      )}
    </>
  );
}
