"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TicketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitTip } from "@/lib/supabase/queries.client";
import { MAX_TIP_LENGTH } from "@/lib/supabase/queries";

export function SuggestTipDialog({ spotId }: { spotId: string }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tip, setTip] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!tip.trim()) {
      setError("Say what's free and worth knowing about");
      return;
    }
    if (tip.length > MAX_TIP_LENGTH) {
      setError(`Keep it under ${MAX_TIP_LENGTH} characters`);
      return;
    }
    setError(undefined);
    setSubmitting(true);

    try {
      await submitTip(spotId, tip, sourceUrl || null);
      toast.success("Thanks — it'll show up once a couple other people confirm it");
      setOpen(false);
      setTip("");
      setSourceUrl("");
    } catch {
      toast.error("Couldn't save that — try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <TicketIcon aria-hidden="true" className="size-3.5" />
            Know something free here?
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suggest a free activity</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tip">What&apos;s free here?</Label>
            <Textarea
              id="tip"
              value={tip}
              onChange={(e) => {
                setTip(e.target.value);
                if (error) setError(undefined);
              }}
              placeholder="e.g. Free rowing on the Hudson most Saturday mornings"
              aria-invalid={!!error}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="source">Link (optional)</Label>
            <Input
              id="source"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="A post or page confirming it, if you have one"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Shown once a couple other people confirm it, same as new spots.
          </p>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Submit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
