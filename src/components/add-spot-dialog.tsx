"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
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
import { isValidLatLng } from "@/lib/geo";
import type { SpotCategory } from "@/lib/types";

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
  const [locating, setLocating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // No default category: "other" as a starting value meant most lazy
  // submissions never touched the selector, which is exactly how "other"
  // became one of the most common categories in the live data. Requiring an
  // explicit pick (like the Name field already does) fixes that at the
  // source instead of relying on submitters to notice and change it.
  const [category, setCategory] = useState<SpotCategory | null>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
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

  function useMyLocation() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        toast.error("Couldn't get your location — enter coordinates manually");
        setLocating(false);
      }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

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
    if (!lat || !lng) {
      nextErrors.location = "Add coordinates or use your location";
    } else if (!isValidLatLng(parsedLat, parsedLng)) {
      nextErrors.location = "That doesn't look like a valid latitude/longitude";
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      nextErrors.description = `Keep it under ${MAX_DESCRIPTION_LENGTH} characters`;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !category) return;

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
        lat: parsedLat,
        lng: parsedLng,
        photo_url: photoUrl,
      });

      toast.success(`${name} submitted for review — check "Review submissions" to confirm it`);
      setOpen(false);
      setName("");
      setDescription("");
      setLat("");
      setLng("");
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
            <Label>Location</Label>
            <div className="flex gap-2">
              <Input
                aria-label="Latitude"
                value={lat}
                onChange={(e) => {
                  setLat(e.target.value);
                  if (errors.location) setErrors((prev) => ({ ...prev, location: undefined }));
                }}
                placeholder="Latitude"
                aria-invalid={!!errors.location}
                required
              />
              <Input
                aria-label="Longitude"
                value={lng}
                onChange={(e) => {
                  setLng(e.target.value);
                  if (errors.location) setErrors((prev) => ({ ...prev, location: undefined }));
                }}
                placeholder="Longitude"
                aria-invalid={!!errors.location}
                required
              />
              <Button
                type="button"
                variant="outline"
                onClick={useMyLocation}
                disabled={locating}
                className="shrink-0"
              >
                {locating ? "Locating…" : "Use my location"}
              </Button>
            </div>
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
