"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div>
        <h1 className="font-logo text-3xl tracking-tight text-green-700 md:text-4xl">
          TOUCH GRASS
        </h1>
        <p className="mt-4 max-w-sm text-xl text-muted-foreground text-pretty">
          Something broke on our end, not yours. Try again?
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button size="lg" onClick={reset}>
          Try again
        </Button>
        <Button
          size="lg"
          variant="outline"
          nativeButton={false}
          render={<Link href="/">Go home</Link>}
        />
      </div>
    </div>
  );
}
