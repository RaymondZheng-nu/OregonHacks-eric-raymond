"use client";

import Image from "next/image";
import { CheckIcon, FlagIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { SpotLocationPreview } from "@/components/spot-location-preview-dynamic";
import { CATEGORY_META } from "@/lib/categories";
import { getSpotVerdict } from "@/lib/spot-verdict";
import { cn } from "@/lib/utils";
import type { Spot } from "@/lib/types";

export function FeaturedSpotlight({ spots }: { spots: Spot[] }) {
  const reduceMotion = useReducedMotion();

  if (spots.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {spots.map((spot, i) => {
        const verdict = getSpotVerdict(spot);
        return (
          <motion.div
            key={spot.id}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{
              duration: 0.4,
              delay: i * 0.05,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <Card
              size="sm"
              className="gap-2 pt-0 transition-shadow duration-200 ease-out hover:shadow-md hover:ring-foreground/15"
            >
              <div className="relative aspect-4/3 w-full overflow-hidden rounded-t-xl">
                {spot.photo_url ? (
                  <Image
                    src={spot.photo_url}
                    alt={spot.name}
                    fill
                    sizes="(min-width: 640px) 33vw, 50vw"
                    className="object-cover"
                  />
                ) : (
                  <SpotLocationPreview
                    lat={spot.lat}
                    lng={spot.lng}
                    category={spot.category}
                  />
                )}
                {/* Only the two signal-bearing tones get a badge — the common
                    zero-votes case stays visually clean, no room here for the
                    full verdict sentence used elsewhere (map popup, results,
                    carousel), so this is a compact icon+count instead.
                    z-[1001] keeps it above the location-preview map's own
                    panes/controls when there's no photo. */}
                {verdict.tone !== "neutral" && (
                  <div
                    className={cn(
                      "absolute top-1.5 right-1.5 z-[1001] flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white",
                      verdict.tone === "caution" && "bg-destructive/80",
                    )}
                  >
                    {verdict.tone === "positive" ? (
                      <>
                        <CheckIcon aria-hidden="true" className="size-2.5" />
                        {spot.confirm_count}
                      </>
                    ) : (
                      <>
                        <FlagIcon aria-hidden="true" className="size-2.5" />
                        {spot.flag_count}
                      </>
                    )}
                  </div>
                )}
              </div>
              <CardContent className="space-y-0.5">
                <p className="truncate text-sm font-medium leading-tight">
                  {spot.name}
                </p>
                <p
                  className="text-xs leading-tight"
                  style={{ color: CATEGORY_META[spot.category].color }}
                >
                  {CATEGORY_META[spot.category].label}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
