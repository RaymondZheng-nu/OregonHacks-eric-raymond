"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "confirmed-spots";

function getConfirmedIds(): string[] {
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

  useEffect(() => {
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
    >
      {confirmed ? "Confirmed" : submitting ? "Confirming…" : "Looks legit — confirm"}
    </Button>
  );
}
