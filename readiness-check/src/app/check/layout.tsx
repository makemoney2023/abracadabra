import type { Metadata } from "next";
import { Tektur } from "next/font/google";
import Link from "next/link";
import { STUDIO } from "@/lib/brand/studio";

const tektur = Tektur({
  variable: "--font-tektur",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  themeColor: STUDIO.canvas,
};

export default function CheckLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`check-studio flex min-h-svh flex-1 flex-col ${tektur.variable}`}>
      <header className="border-b border-[var(--sc-hairline)]">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/check" className="font-heading text-lg no-underline">
            Readiness Check
          </Link>
          <a href="https://abra-ca-dabra.app" className="studio-kicker no-underline">
            Abracadabra
          </a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">{children}</main>
    </div>
  );
}
