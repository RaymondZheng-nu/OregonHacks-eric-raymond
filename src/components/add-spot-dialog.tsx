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
import { uploadSpotPhoto } from "@/lib/supabase/storage";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import type { SpotCategory } from "@/lib/types";

export function AddSpotDialog({ onSubmitted }: { onSubmitted?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SpotCategory>("other");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ name?: string; location?: string }>({});

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
      },
      () => toast.error("Couldn't get your location — enter coordinates manually")
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const nextErrors: { name?: string; location?: string } = {};
    if (!name.trim()) nextErrors.name = "Give this spot a name";
    if (!lat || !lng) nextErrors.location = "Add coordinates or use your location";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

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
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        photo_url: photoUrl,
      });

      toast.success(`${name} submitted for review — check "Review submissions" to confirm it`);
      setOpen(false);
      setName("");
      setDescription("");
      setLat("");
      setLng("");
      setPhotoFile(null);
      setCategory("other");
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
          <Button>
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
              <Button type="button" variant="outline" onClick={useMyLocation}>
                Use my location
              </Button>
            </div>
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
