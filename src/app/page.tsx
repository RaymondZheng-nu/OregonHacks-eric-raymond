import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardListIcon } from "lucide-react";
import { SessionQuestionnaire } from "@/components/session-questionnaire";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { getPendingCount } from "@/lib/supabase/queries.server";

export const metadata: Metadata = {
  title: "Find Real Parks & Nature Spots Near You",
  description:
    "Tell us what you're into, where you are, and how far you'll go. We'll match you with real parks, gardens, and quiet spots nearby.",
};

export default async function LandingPage() {
  const pendingCount = await getPendingCount();

  return (
    <div className="min-h-[100dvh]">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4">
          <span className="font-logo text-lg tracking-tight text-green-700">
            TOUCH GRASS
          </span>
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
              <Link href="/privacy" className="hover:text-foreground">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-foreground">
                Terms
              </Link>
            </div>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <Link href="/pending">
                  <ClipboardListIcon aria-hidden="true" />
                  Review submissions{pendingCount > 0 ? ` (${pendingCount})` : ""}
                </Link>
              }
            />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <section className="mx-auto flex max-w-[1400px] flex-col items-center gap-6 px-4 py-12 md:py-20">
        <div className="text-center">
          <h1 className="font-logo text-4xl tracking-tight text-green-700 md:text-5xl">
            TOUCH GRASS
          </h1>
          <p className="mt-3 text-muted-foreground text-pretty">
            Real parks and quiet spots near you, from people who actually left
            the house to find them.
          </p>
        </div>
        <SessionQuestionnaire />
        <Link
          href="/explore"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Or browse the full map
        </Link>
      </section>
    </div>
  );
}
