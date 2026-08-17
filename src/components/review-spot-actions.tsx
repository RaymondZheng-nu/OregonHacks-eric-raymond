"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, FlagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmSpot, flagSpot } from "@/lib/supabase/queries.client";

const CONFIRMED_KEY = "confirmed-spots";
const FLAGGED_KEY = "flagged-spots";

function getIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}

function addId(key: string, spotId: string) {
  const ids = getIds(key);
  localStorage.setItem(key, JSON.stringify([...ids, spotId]));
}

export function ReviewSpotActions({ spotId }: { spotId: string }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [submitting, setSubmitting] = useState<"confirm" | "flag" | null>(null);
  // Keeps both buttons disabled until the localStorage check below resolves.
  const [hydrated, setHydrated] = useState(false);

  // Read localStorage post-mount, not in a lazy initializer — the server has
  // none, so a synchronous read would mismatch hydration.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirmed(getIds(CONFIRMED_KEY).includes(spotId));
    setFlagged(getIds(FLAGGED_KEY).includes(spotId));
    setHydrated(true);
  }, [spotId]);

  async function handleConfirm() {
    setSubmitting("confirm");
    try {
      await confirmSpot(spotId);
    } catch {
      toast.error("Couldn't confirm this spot. Try again");
      return;
    } finally {
      setSubmitting(null);
    }

    addId(CONFIRMED_KEY, spotId);
    setConfirmed(true);
    toast.success("Thanks for confirming");
    router.refresh();
  }

  async function handleFlag() {
    setSubmitting("flag");
    try {
      await flagSpot(spotId);
    } catch {
      toast.error("Couldn't flag this spot. Try again");
      return;
    } finally {
      setSubmitting(null);
    }

    addId(FLAGGED_KEY, spotId);
    setFlagged(true);
    toast.success("Thanks, we'll take another look");
    router.refresh();
  }

  const decided = confirmed || flagged;

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={confirmed ? "outline" : "default"}
        disabled={!hydrated || decided || submitting !== null}
        onClick={handleConfirm}
        className="transition-colors duration-200"
      >
        {confirmed && (
          <CheckIcon className="motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200 motion-safe:ease-out" />
        )}
        {confirmed
          ? "Confirmed"
          : submitting === "confirm"
            ? "Confirming…"
            : "Looks legit, confirm"}
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={!hydrated || decided || submitting !== null}
        onClick={handleFlag}
        className="transition-colors duration-200"
      >
        {flagged && (
          <FlagIcon className="motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200 motion-safe:ease-out" />
        )}
        {flagged
          ? "Flagged"
          : submitting === "flag"
            ? "Flagging…"
            : "Doesn't look real"}
      </Button>
    </div>
  );
}
