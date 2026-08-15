"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "confirmed-spots";

function getConfirmedIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function ConfirmSpotButton({ spotId }: { spotId: string }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Server-rendered HTML always has confirmed=false (no window/localStorage on
  // the server) — reading localStorage must happen post-mount, not during the
  // lazy initializer, or client/server output mismatches and React throws a
  // hydration error.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirmed(getConfirmedIds().includes(spotId));
  }, [spotId]);

  async function handleConfirm() {
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("confirm_spot", { spot_id: spotId });
    setSubmitting(false);

    if (error) {
      toast.error("Couldn't confirm this spot — try again");
      return;
    }

    const ids = getConfirmedIds();
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids, spotId]));
    setConfirmed(true);
    toast.success("Thanks for confirming");
    router.refresh();
  }

  return (
    <Button
      size="sm"
      variant={confirmed ? "outline" : "default"}
      disabled={confirmed || submitting}
      onClick={handleConfirm}
      className="transition-colors duration-200"
    >
      {confirmed && (
        <CheckIcon className="motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200 motion-safe:ease-out" />
      )}
      {confirmed ? "Confirmed" : submitting ? "Confirming…" : "Looks legit — confirm"}
    </Button>
  );
}
