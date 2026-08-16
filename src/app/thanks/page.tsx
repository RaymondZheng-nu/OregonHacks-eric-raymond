import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Thanks",
  robots: { index: false, follow: false },
};

export default function ThanksPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div>
        <h1 className="font-logo text-3xl tracking-tight text-green-700 md:text-4xl">
          TOUCH GRASS
        </h1>
        <p className="mt-4 max-w-sm text-xl text-muted-foreground text-pretty">
          Thanks. Now go actually do the thing.
        </p>
      </div>
      <Button
        size="lg"
        nativeButton={false}
        render={<Link href="/explore">Back to the map</Link>}
      />
    </div>
  );
}
