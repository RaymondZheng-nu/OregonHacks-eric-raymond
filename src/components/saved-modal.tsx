"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SavedList } from "@/components/saved-list";

// In-place modal so a mid-session swipe deck stays mounted behind it; routing
// to /saved would unmount it. /saved still exists as a real page reusing SavedList.
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
