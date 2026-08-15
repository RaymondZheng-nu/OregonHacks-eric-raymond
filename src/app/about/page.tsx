import Link from "next/link";
import { MapIcon, CameraIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hero05 } from "@/components/ui/hero-05";

const STEPS = [
  {
    number: "01",
    icon: MapIcon,
    title: "Browse the map",
    body: "Official NYC park and tree data, plus hidden spots people have already found and shared.",
  },
  {
    number: "02",
    icon: CameraIcon,
    title: "Add what you find",
    body: "A photo, a category, and why it's worth visiting. Rock climbing spots and quiet gardens count too.",
  },
  {
    number: "03",
    icon: UsersIcon,
    title: "The community checks it",
    body: "New spots wait for two confirmations before they show up for everyone else.",
  },
];

// Placeholder photography (not real photos of these locations) illustrating
// the three kinds of spots on the map — captions describe the category, not
// the specific image content.
const HIGHLIGHTS = [
  {
    seed: "central-park",
    label: "Official park data",
    alt: "Placeholder photo representing official park data",
  },
  {
    seed: "rat-rock",
    label: "Self-reported spots",
    alt: "Placeholder photo representing a self-reported spot",
  },
  {
    seed: "jamaica-bay",
    label: "Niche activities",
    alt: "Placeholder photo representing a niche outdoor activity",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-[100dvh]">
      <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4">
        <span className="font-semibold">Nearby Nature</span>
        <Button
          nativeButton={false}
          render={<Link href="/">Open the map</Link>}
        />
      </nav>

      <Hero05
        tagline="For New Yorkers without a yard"
        title="Nature is closer than your subway stop."
        description="Find real parks, gardens, and quiet nature spots across New York City, verified by the people who actually visit them."
        landscapeImage="https://picsum.photos/seed/central-park-hero/1600/800"
        landscapeAlt="Placeholder landscape photo of a green park"
        animation="subtle"
        primaryCTA={{ ctaEnabled: true, text: "Open the map", link: "/" }}
      />

      <section className="mx-auto max-w-[1400px] px-4 py-16">
        <h2 className="max-w-lg text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          New York has less green than you think.
        </h2>
        <p className="mt-4 max-w-[65ch] text-muted-foreground text-pretty">
          If you don&apos;t have a yard, finding real nature nearby usually
          means guessing. Nearby Nature turns official city data and real
          reports into one map.
        </p>
      </section>

      <section className="mx-auto grid max-w-[1400px] gap-8 px-4 py-16 md:grid-cols-3">
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <div key={step.number} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">
                  {step.number}
                </span>
                <Icon className="size-5 text-primary" />
              </div>
              <h3 className="font-medium">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </div>
          );
        })}
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-16">
        <div className="grid gap-4 sm:grid-cols-3">
          {HIGHLIGHTS.map((item) => (
            <figure
              key={item.seed}
              className="overflow-hidden rounded-lg border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://picsum.photos/seed/${item.seed}/640/480`}
                alt={item.alt}
                className="aspect-4/3 w-full object-cover"
              />
              <figcaption className="px-3 py-2 text-sm text-muted-foreground">
                {item.label}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="mx-auto flex max-w-[1400px] flex-col items-start gap-4 px-4 py-20">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
          See what&apos;s near you.
        </h2>
        <Button
          size="lg"
          nativeButton={false}
          render={<Link href="/">Open the map</Link>}
        />
      </section>

      <footer className="mx-auto max-w-[1400px] px-4 py-8 text-sm text-muted-foreground">
        Built for OregonHacks by Raymond Zheng &amp; Eric Huang.
      </footer>
    </div>
  );
}
