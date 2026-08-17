"use client";

import { useState } from "react";
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
  const [category, setCategory] = useState<SpotCategory>("other");
  const [locationInput, setLocationInput] = useState("");
  // Cleared whenever locationInput changes, so a stale resolution never gets
  // silently submitted for text the user has since edited.
  const [resolvedLocation, setResolvedLocation] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ name?: string; location?: string }>({});

  function handleLocationInputChange(value: string) {
    setLocationInput(value);
    setResolvedLocation(null);
    if (errors.location) setErrors((prev) => ({ ...prev, location: undefined }));
  }

  async function locateFromInput() {
    if (!locationInput.trim() || locating) return;
    setLocating(true);
    try {
      const result = await resolveLocationInput(locationInput);
      if (result) {
        setResolvedLocation(result);
        setErrors((prev) => ({ ...prev, location: undefined }));
      } else {
        toast.error(
          "Couldn't find that location. Try a full address, or paste a Google Maps link"
        );
      }
    } catch {
      toast.error("Couldn't find that location. Try again");
    } finally {
      setLocating(false);
    }
  }

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setResolvedLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationInput(MY_LOCATION_LABEL);
        if (errors.location) setErrors((prev) => ({ ...prev, location: undefined }));
      },
      () =>
        toast.error(
          "Couldn't get your location. Enter an address or paste a Google Maps link instead"
        )
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const nextErrors: { name?: string; location?: string } = {};
    if (!name.trim()) nextErrors.name = "Give this spot a name";

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
        "Add a location: paste a Google Maps link, an address, or use your location";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !location) return;

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

      toast.success(`${name} submitted for review. Check "Review submissions" to confirm it`);
      setOpen(false);
      setName("");
      setDescription("");
      setLocationInput("");
      setResolvedLocation(null);
      setPhotoFile(null);
      setCategory("other");
      setErrors({});
      onSubmitted?.();
      router.refresh();
    } catch {
      toast.error("Couldn't save that spot. Try again");
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
              value={category}
              onValueChange={(v) => setCategory(v as SpotCategory)}
            >
              <SelectTrigger id="category">
                <SelectValue />
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What makes this spot worth visiting?"
            />
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
              id="photo"
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            New spots go to review first. Once confirmed by others, they show up on the map.
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
