import type { Metadata } from "next";
import { Geist, Geist_Mono, Bungee } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "@/components/ui/sonner";
import { CookieBanner } from "@/components/cookie-banner";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bungee = Bungee({
  variable: "--font-bungee",
  weight: "400",
  subsets: ["latin"],
});

// No production domain assigned yet — falls back to localhost so relative
// OG/sitemap URLs resolve during dev. Set NEXT_PUBLIC_SITE_URL once deployed.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "TOUCH GRASS",
    template: "%s | TOUCH GRASS",
  },
  description: "Find green space and self-reported nature spots across the USA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${bungee.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster />
          <CookieBanner />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
