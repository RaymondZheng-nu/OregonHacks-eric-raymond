import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms",
  description: "The ground rules for using TOUCH GRASS.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Terms</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated{" "}
        {new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
        })}
        . Plain-language rules for a hackathon project, not a formal legal
        agreement.
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground">
        <section>
          <h2 className="font-medium">Use this at your own risk</h2>
          <p className="mt-1 text-muted-foreground">
            TOUCH GRASS is a small side project built for a hackathon.
            Coordinates, descriptions, and photos are submitted by other people
            using the app, and haven&apos;t been professionally verified. Use
            your own judgment before visiting anywhere, especially anything
            remote or unfamiliar.
          </p>
        </section>

        <section>
          <h2 className="font-medium">What you submit</h2>
          <p className="mt-1 text-muted-foreground">
            Don&apos;t submit spots you don&apos;t have the right to share,
            private property without permission, or anything illegal, dangerous,
            or intentionally misleading. New submissions go to a review queue
            and can be removed at any time.
          </p>
        </section>

        <section>
          <h2 className="font-medium">No warranty</h2>
          <p className="mt-1 text-muted-foreground">
            The app is provided as-is, with no guarantee it&apos;ll be
            available, accurate, or bug-free. It&apos;s a hackathon project, not
            a production service with an SLA.
          </p>
        </section>

        <section>
          <h2 className="font-medium">Changes</h2>
          <p className="mt-1 text-muted-foreground">
            These terms may change as the project changes. Nothing here is a
            substitute for real legal advice.
          </p>
        </section>
      </div>

      <Link
        href="/"
        className="mt-12 inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Back home
      </Link>
    </div>
  );
}
