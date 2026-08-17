"use client";

import { useState } from "react";
import { BookmarkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SavedModal } from "@/components/saved-modal";

// Same self-contained trigger-plus-dialog shape as AddSpotDialog, so the
// homepage header can offer this without finishing the quiz first — that
// used to be the only way to reach /saved at all (via the swipe deck's own
// nav bar), which meant a saved spot from a past session was unreachable
// without redoing the quiz just to get back to the nav bar that links to it.
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
