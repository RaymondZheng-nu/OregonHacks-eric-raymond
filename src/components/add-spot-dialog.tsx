"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, MapPinIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitSpot } from "@/lib/supabase/queries.client";
import { MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH } from "@/lib/supabase/queries";
import { uploadSpotPhoto } from "@/lib/supabase/storage";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import { resolveLocationInput, type LatLng } from "@/lib/geocode";
import type { SpotCategory } from "@/lib/types";

const MY_LOCATION_LABEL = "My current location";

export function AddSpotDialog({
  onSubmitted,
  triggerSize,
}: {
  onSubmitted?: () => void;
  triggerSize?: "default" | "sm" | "lg";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // No default category: "other" as a starting value meant most lazy
  // submissions never touched the selector, which is exactly how "other"
  // became one of the most common categories in the live data. Requiring an
  // explicit pick (like the Name field already does) fixes that at the
  // source instead of relying on submitters to notice and change it.
  const [category, setCategory] = useState<SpotCategory | null>(null);
  const [locationInput, setLocationInput] = useState("");
  // Cleared whenever locationInput changes, so a stale resolution never gets
  // silently submitted for text the user has since edited.
  const [resolvedLocation, setResolvedLocation] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  // Forces the native file input to remount on reset — its displayed
  // filename is uncontrolled DOM state that `setPhotoFile(null)` alone
  // doesn't clear, so without this a reopened dialog would show a stale
  // filename next to an input the app itself considers empty.
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [errors, setErrors] = useState<{
    name?: string;
    category?: string;
    location?: string;
    description?: string;
  }>({});

  function handleLocationInputChange(value: string) {
    setLocationInput(value);
    setResolvedLocation(null);
    if (errors.location) setErrors((prev) => ({ ...prev, location: undefined }));
  }

  // Address lookup and "use my location" can both be in flight at once —
  // whichever resolves last wins, so give each attempt an id and drop
  // callbacks that aren't the latest by the time they land.
  const locationRequestIdRef = useRef(0);

  async function locateFromInput() {
    if (!locationInput.trim() || locating) return;
    const requestId = ++locationRequestIdRef.current;
    setLocating(true);
    try {
      const result = await resolveLocationInput(locationInput);
      if (requestId !== locationRequestIdRef.current) return;
      if (result) {
        setResolvedLocation(result);
        setErrors((prev) => ({ ...prev, location: undefined }));
      } else {
        toast.error(
          "Couldn't find that location — try a full address, or paste a Google Maps link"
        );
      }
    } catch {
      if (requestId === locationRequestIdRef.current) {
        toast.error("Couldn't find that location — try again");
      }
    } finally {
      if (requestId === locationRequestIdRef.current) setLocating(false);
    }
  }

  function useMyLocation() {
    const requestId = ++locationRequestIdRef.current;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (requestId !== locationRequestIdRef.current) return;
        setResolvedLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationInput(MY_LOCATION_LABEL);
        setLocating(false);
        if (errors.location) setErrors((prev) => ({ ...prev, location: undefined }));
      },
      () => {
        if (requestId !== locationRequestIdRef.current) return;
        toast.error(
          "Couldn't get your location — enter an address or paste a Google Maps link instead"
        );
        setLocating(false);
      }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const nextErrors: { name?: string; category?: string; location?: string; description?: string } = {};
    // Same bounds insertSpot enforces server-side — checked here too so a
    // name/description over the limit gets a specific inline message
    // instead of surfacing only as the generic "Couldn't save that spot —
    // try again" toast from the catch block below.
    if (!name.trim()) {
      nextErrors.name = "Give this spot a name";
    } else if (name.length > MAX_NAME_LENGTH) {
      nextErrors.name = `Keep it under ${MAX_NAME_LENGTH} characters`;
    }
    if (!category) nextErrors.category = "Pick a category";
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      nextErrors.description = `Keep it under ${MAX_DESCRIPTION_LENGTH} characters`;
    }

    // Submitting straight from a typed address (without clicking "Locate"
    // first) is a real path, not just a fallback — resolve it here instead
    // of forcing an extra click before every submission.
    let location = resolvedLocation;
    if (!location && locationInput.trim()) {
      setLocating(true);
      location = await resolveLocationInput(locationInput).catch(() => null);
      setLocating(false);
      if (location) setResolvedLocation(location);
    }
    if (!location) {
      nextErrors.location =
        "Add a location — paste a Google Maps link, an address, or use your location";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !category || !location) return;

    setSubmitting(true);

    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        photoUrl = await uploadSpotPhoto(photoFile);
      }

      await submitSpot({
        name,
        description: description || null,
        category,
        lat: location.lat,
        lng: location.lng,
        photo_url: photoUrl,
      });

      toast.success(`${name} submitted for review — check "Review submissions" to confirm it`);
      setOpen(false);
      setName("");
      setDescription("");
      setLocationInput("");
      setResolvedLocation(null);
      setPhotoFile(null);
      setPhotoInputKey((k) => k + 1);
      setCategory(null);
      setErrors({});
      onSubmitted?.();
      router.refresh();
    } catch {
      toast.error("Couldn't save that spot — try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size={triggerSize}>
            <PlusIcon aria-hidden="true" />
            Add a spot
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share a nature spot</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              placeholder="e.g. Quiet bench behind the library"
              aria-invalid={!!errors.name}
              required
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={category ?? ""}
              onValueChange={(v) => {
                setCategory(v as SpotCategory);
                if (errors.category)
                  setErrors((prev) => ({ ...prev, category: undefined }));
              }}
            >
              <SelectTrigger id="category" aria-invalid={!!errors.category}>
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span
                      aria-hidden="true"
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: opt.color }}
                    />
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && (
              <p className="text-xs text-destructive">{errors.category}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description)
                  setErrors((prev) => ({ ...prev, description: undefined }));
              }}
              placeholder="What makes this spot worth visiting?"
              aria-invalid={!!errors.description}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <div className="flex gap-2">
              <Input
                id="location"
                value={locationInput}
                onChange={(e) => handleLocationInputChange(e.target.value)}
                placeholder="Paste a Google Maps link, an address, or coordinates"
                aria-invalid={!!errors.location}
              />
              <Button
                type="button"
                variant="outline"
                onClick={locateFromInput}
                disabled={locating || !locationInput.trim()}
              >
                {locating ? "Locating…" : "Locate"}
              </Button>
            </div>
            <button
              type="button"
              onClick={useMyLocation}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <MapPinIcon aria-hidden="true" className="size-3.5" />
              Use my current location instead
            </button>
            {resolvedLocation && (
              <p className="text-xs text-muted-foreground">
                📍 Located at {resolvedLocation.lat.toFixed(5)},{" "}
                {resolvedLocation.lng.toFixed(5)}
              </p>
            )}
            {errors.location && (
              <p className="text-xs text-destructive">{errors.location}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="photo">Photo</Label>
            <Input
              key={photoInputKey}
              id="photo"
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            New spots go to review first — once confirmed by others they show up on the map.
          </p>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Submit for review"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
