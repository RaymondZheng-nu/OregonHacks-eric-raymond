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
import { INTENT_OPTIONS } from "@/lib/intents";
import { cn } from "@/lib/utils";

const MILES_TO_METERS = 1609.34;
const MY_LOCATION_LABEL = "My current location";
const TOTAL_STEPS = 2;

async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  // Bare zip codes are ambiguous across countries (e.g. "10001" is also a
  // real postcode in Algeria) — without this, Nominatim's global ranking can
  // put a same-numbered foreign postcode ahead of the US one. This app only
  // has spot data in the US, so restricting the search is always correct here.
  url.searchParams.set("countrycodes", "us");

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const results: { lat: string; lon: string }[] = await res.json();
  if (results.length === 0) return null;

  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
}

export function StartSessionDialog({ fullWidth }: { fullWidth?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [intent, setIntent] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [address, setAddress] = useState("");
  const [myLocationCoords, setMyLocationCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [maxMiles, setMaxMiles] = useState("5");
  const [errors, setErrors] = useState<{ intent?: string; address?: string }>({});

  function selectIntent(value: string) {
    setIntent(value);
    setErrors((prev) => ({ ...prev, intent: undefined }));
  }

  function goNext() {
    if (step === 0 && !intent) {
      setErrors((prev) => ({ ...prev, intent: "Pick one to continue" }));
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
      }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const selected = INTENT_OPTIONS.find((option) => option.value === intent);
    if (!selected) {
      setErrors((prev) => ({ ...prev, intent: "Pick one to continue" }));
      return;
    }

    const params = new URLSearchParams();
    // Never both: activity-based intents leave categories unset so /explore
    // defaults to every category and activity_fit does the real filtering;
    // category-based intents are already a precise 1:1 match on their own.
    if (selected.kind === "activity") params.set("activity", selected.activity);
    else params.set("cats", selected.category);

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
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

        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-200 ease-out",
                i === step ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"
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
                <Label>What&apos;s calling you outside?</Label>
                <div className="flex flex-wrap gap-2">
                  {INTENT_OPTIONS.map((option) => {
                    const active = intent === option.value;
                    return (
                      <Badge
                        key={option.value}
                        variant="outline"
                        render={
                          <button
                            type="button"
                            aria-pressed={active}
                            onClick={() => selectIntent(option.value)}
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
                {errors.intent && (
                  <p className="text-xs text-destructive">{errors.intent}</p>
                )}
              </div>
            )}

            {step === 1 && (
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
  );
}
