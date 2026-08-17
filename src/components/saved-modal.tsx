"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SavedList } from "@/components/saved-list";

// Opens in place instead of navigating to /saved — whatever's underneath
// (the homepage, or a swipe deck mid-session) stays mounted and visible
// behind it. Navigating away used to unmount the quiz's in-progress swipe
// state entirely, so getting back to it meant redoing the quiz from
// scratch — same problem swipe-modal.tsx solved for the quiz-to-swipe
// handoff, applied here to the swipe-deck-to-saved-list handoff. /saved
// itself is unchanged and still handles direct links/bookmarks as a real
// page, reusing this same SavedList.
export function SavedModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Saved Spots</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <SavedList />
        </div>
      </DialogContent>
    </Dialog>
  );
}
