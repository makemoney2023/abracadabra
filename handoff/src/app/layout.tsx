import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Tektur } from "next/font/google";
import { DENSITY_BOOT } from "@/components/density";
import { STUDIO } from "@/lib/brand/studio";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const tektur = Tektur({
  variable: "--font-tektur",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
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
      className={`${plexSans.variable} ${tektur.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <script dangerouslySetInnerHTML={{ __html: DENSITY_BOOT }} />
        {children}
      </body>
    </html>
  );
}
