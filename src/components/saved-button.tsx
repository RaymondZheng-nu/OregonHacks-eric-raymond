"use client";

import { useState } from "react";
import { BookmarkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SavedModal } from "@/components/saved-modal";

// Self-contained trigger+dialog so the homepage header can reach saved spots
// without going through the quiz and swipe deck's nav bar.
export function SavedButton({
  triggerSize,
}: {
  triggerSize?: "default" | "sm" | "lg";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size={triggerSize} onClick={() => setOpen(true)}>
        <BookmarkIcon aria-hidden="true" />
        Saved
      </Button>
      <SavedModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
