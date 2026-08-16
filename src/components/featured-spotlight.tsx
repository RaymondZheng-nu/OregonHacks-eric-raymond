"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { CATEGORY_META } from "@/lib/categories";
import type { Spot } from "@/lib/types";

export function FeaturedSpotlight({ spots }: { spots: Spot[] }) {
  const reduceMotion = useReducedMotion();

  if (spots.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {spots.map((spot, i) => (
        <motion.div
          key={spot.id}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.4, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
        >
          <Card
            size="sm"
            className="gap-2 pt-0 transition-shadow duration-200 ease-out hover:shadow-md hover:ring-foreground/15"
          >
            {spot.photo_url ? (
              <div className="relative aspect-4/3 w-full overflow-hidden rounded-t-xl">
                <Image
                  src={spot.photo_url}
                  alt={spot.name}
                  fill
                  sizes="(min-width: 640px) 33vw, 50vw"
                  className="object-cover"
                />
              </div>
            ) : (
              <div
                className="aspect-4/3 w-full rounded-t-xl"
                style={{ backgroundColor: `${CATEGORY_META[spot.category].color}26` }}
                aria-hidden="true"
              />
            )}
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
      ))}
    </div>
  );
}
