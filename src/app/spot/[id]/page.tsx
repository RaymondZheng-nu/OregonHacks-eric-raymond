import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SpotLocationPreview } from "@/components/spot-location-preview-dynamic";
import { getSpotById } from "@/lib/supabase/queries.server";
import { CATEGORY_META } from "@/lib/categories";
import { getSpotVerdict } from "@/lib/spot-verdict";
import { directionsUrl } from "@/lib/geo";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

// A dedicated shareable URL per spot — /explore's spot is just a query param,
// which can't carry its own per-spot metadata/OG image (a route segment can).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const spot = await getSpotById(id);
  if (!spot) return { title: "Spot not found" };

  const categoryLabel = CATEGORY_META[spot.category].label;
  const description =
    spot.description || `A ${categoryLabel.toLowerCase()} on TOUCH GRASS.`;

  return {
    title: `${spot.name} | TOUCH GRASS`,
    description,
    openGraph: { title: spot.name, description },
  };
}

export default async function SpotPage({ params }: Props) {
  const { id } = await params;
  const spot = await getSpotById(id);
  if (!spot) notFound();

  const verdict = getSpotVerdict(spot);
  const categoryLabel = CATEGORY_META[spot.category].label;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col gap-4 p-4">
      <Link
        href="/"
        className="font-logo text-lg tracking-tight text-green-700 hover:opacity-90"
      >
        TOUCH GRASS
      </Link>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="relative aspect-4/3 w-full overflow-hidden bg-muted">
          {spot.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={spot.photo_url}
              alt={spot.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <SpotLocationPreview
              lat={spot.lat}
              lng={spot.lng}
              category={spot.category}
            />
          )}
        </div>
        <div className="space-y-2 p-4">
          <h1 className="text-xl font-semibold leading-tight text-balance">
            {spot.name}
          </h1>
          <p className="text-sm text-muted-foreground">{categoryLabel}</p>
          {spot.description && <p className="text-sm">{spot.description}</p>}
          <p
            className={cn(
              "text-xs",
              verdict.tone === "caution"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {verdict.label}
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              nativeButton={false}
              render={
                <Link href={`/explore?spot=${spot.id}&lat=${spot.lat}&lng=${spot.lng}`}>
                  View on map
                </Link>
              }
            />
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <a
                  href={directionsUrl(spot.lat, spot.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get directions
                </a>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
