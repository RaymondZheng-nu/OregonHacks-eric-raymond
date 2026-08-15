import Link from "next/link";
import type { VariantProps } from "class-variance-authority";

import { Button, buttonVariants } from "@/components/ui/button";

export interface CtaProps {
  ctaEnabled: boolean;
  text: string;
  link: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
}

export function Cta({ cta }: { cta: CtaProps }) {
  if (!cta.ctaEnabled) return null;

  return (
    <Button
      variant={cta.variant ?? "default"}
      nativeButton={false}
      render={<Link href={cta.link}>{cta.text}</Link>}
    />
  );
}
