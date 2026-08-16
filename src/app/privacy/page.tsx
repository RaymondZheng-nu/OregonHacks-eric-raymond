import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What TOUCH GRASS does and doesn't do with your data.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated{" "}
        {new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
        })}
        . This is a hackathon project, written honestly, not lawyer-reviewed
        legal boilerplate.
      </p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground">
        <section>
          <h2 className="font-medium">No accounts</h2>
          <p className="mt-1 text-muted-foreground">
            TOUCH GRASS has no login and no user accounts. We don&apos;t know
            who you are.
          </p>
        </section>

        <section>
          <h2 className="font-medium">Location</h2>
          <p className="mt-1 text-muted-foreground">
            If you use &quot;Use my location&quot; or type an address into the
            questionnaire, that location is used in your browser to build a map
            search and is not stored on our servers. If you type an address,
            it&apos;s sent to OpenStreetMap&apos;s free geocoding service to
            convert it to coordinates.
          </p>
        </section>

        <section>
          <h2 className="font-medium">Spots you submit</h2>
          <p className="mt-1 text-muted-foreground">
            When you add a spot (name, description, category, coordinates, and
            optionally a photo), that information is public by design. It goes
            into a shared review queue and, once confirmed, shows up on the map
            for everyone. Don&apos;t submit anything you don&apos;t want public.
            Photos are stored with our hosting provider (Supabase).
          </p>
        </section>

        <section>
          <h2 className="font-medium">Analytics</h2>
          <p className="mt-1 text-muted-foreground">
            We use Vercel Analytics, which is cookieless and doesn&apos;t track
            you individually across sites. It just tells us which pages get
            visited.
          </p>
        </section>

        <section>
          <h2 className="font-medium">Questions</h2>
          <p className="mt-1 text-muted-foreground">
            This is a small hackathon project, not a company. If something here
            seems off, open an issue on the project repo.
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
