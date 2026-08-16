"use client";

import { useEffect, useRef, useState } from "react";
import { StartSessionDialog } from "@/components/start-session-dialog";

// Shows once the hero's own Start Session button scrolls out of view, so
// mobile users browsing further down don't have to scroll back up. Hidden
// on sm+ since the hero CTA stays reachable without a sticky bar there.
export function StickyMobileCta({ heroCtaId }: { heroCtaId: string }) {
  const [visible, setVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const target = document.getElementById(heroCtaId);
    if (!target) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 }
    );
    observerRef.current.observe(target);

    return () => observerRef.current?.disconnect();
  }, [heroCtaId]);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1150] border-t bg-background/95 p-3 shadow-md backdrop-blur-xs sm:hidden">
      <StartSessionDialog fullWidth />
    </div>
  );
}
