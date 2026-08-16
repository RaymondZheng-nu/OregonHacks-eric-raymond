"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "touch-grass-cookie-notice-dismissed";

export function CookieBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // localStorage isn't available during SSR, so this can't be a lazy
    // useState initializer — it has to run post-mount, same render on
    // server and first client paint (hidden), then reveal after.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  if (dismissed) return null;

  return (
    <div className="fixed inset-x-0 bottom-14 z-[1200] border-t bg-background/95 px-4 py-3 shadow-md backdrop-blur-xs sm:bottom-0">
      <div className="mx-auto flex max-w-[1400px] flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We don&apos;t use tracking cookies. Just cookieless analytics to see
          which pages get visited.{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Privacy policy
          </Link>
        </p>
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "1");
            setDismissed(true);
          }}
        >
          Got it
        </Button>
      </div>
    </div>
  );
}
