"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { EventCity } from "@/lib/events";

// Demo-only device: lets whoever's driving pick which city's live events and
// nearby spots to spotlight, rather than mixing NYC + Portland together on
// the one screen a judge sees first. No persistence (localStorage etc.) on
// purpose — reappearing on every fresh load means it can be re-demoed for a
// new viewer just by refreshing, and there's nothing here worth remembering
// across visits yet.
export function CityPickerModal({
  onSelect,
}: {
  onSelect: (city: EventCity | null) => void;
}) {
  const [open, setOpen] = useState(true);

  function choose(city: EventCity | null) {
    setOpen(false);
    onSelect(city);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && choose(null)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Where are you exploring from?</DialogTitle>
          <DialogDescription>
            We&apos;ll spotlight live events and nearby spots for that city.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" onClick={() => choose("portland")}>
            Portland
          </Button>
          <Button variant="outline" size="lg" onClick={() => choose("nyc")}>
            New York City
          </Button>
        </div>
        <button
          type="button"
          onClick={() => choose(null)}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Skip, just show me everything
        </button>
      </DialogContent>
    </Dialog>
  );
}
