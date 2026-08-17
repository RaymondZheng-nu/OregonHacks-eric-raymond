import Link from "next/link";
import { MapIcon } from "lucide-react";

// Mirrors SwipeNavBar's real markup (not a pulsing skeleton) so the header
// doesn't visibly change the moment the deck finishes loading — only the
// card area below shows a loading placeholder.
export default function SwipeLoading() {
  return (
    <div className="flex h-[100dvh] w-full flex-col bg-accent">
      <div className="flex w-full items-center justify-between border-b bg-background px-4 py-3 md:px-6">
        <Link
          href="/explore"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <MapIcon aria-hidden="true" className="size-4" />
          General map view
        </Link>
        <span className="font-logo text-sm tracking-tight text-green-700">
          TOUCH GRASS
        </span>
        <div className="h-4 w-12" aria-hidden="true" />
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="aspect-3/4 w-full max-w-sm animate-pulse rounded-2xl bg-card" />
      </div>
    </div>
  );
}
