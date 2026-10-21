import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import { DENSITY_BOOT } from "@/components/density";
import { STUDIO } from "@/lib/brand/studio";
import "./globals.css";

/*
 * Same type system as the marketing site (abra-ca-dabra.app, scrollcraft/builds/abracadabra-ai/assets/fonts.css):
 * IBM Plex Sans for body text, Inter Tight for headings, labels and the wordmark. Self-hosted Latin subsets,
 * the same woff2 files (OFL, licences in ./fonts; Inter Tight 700 is left out because nothing here uses bold). next/font serves them hashed from /_next/static/media
 * (immutable cache), preloads them and adds size-adjusted fallbacks so text doesn't shift when they arrive.
 */
const plexSans = localFont({
  variable: "--font-plex-sans",
  display: "swap",
  src: [
    { path: "./fonts/ibm-plex-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-400-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/ibm-plex-sans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-600.woff2", weight: "600", style: "normal" },
  ],
  fallback: ["system-ui", "sans-serif"],
});

const interTight = localFont({
  variable: "--font-inter-tight",
  display: "swap",
  src: [
    { path: "./fonts/inter-tight-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/inter-tight-600.woff2", weight: "600", style: "normal" },
  ],
  fallback: ["system-ui", "sans-serif"],
});

/** Code, ids, hosts and times only (the marketing site has no mono). One weight; nothing in the app sets mono bold. */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Handoff",
  description:
    "A private place to send files to the team you work with.",
};

export const viewport: Viewport = {
  themeColor: STUDIO.canvas,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${interTight.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <script dangerouslySetInnerHTML={{ __html: DENSITY_BOOT }} />
        {children}
      </body>
    </html>
  );
}
