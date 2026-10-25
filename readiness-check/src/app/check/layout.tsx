import type { Metadata } from "next";
import Link from "next/link";
import { CheckMenu } from "@/components/check/CheckMenu";
import { STUDIO } from "@/lib/brand/studio";
import { READINESS_META_COPY } from "@/lib/marketing/copy";

export const metadata: Metadata = {
  description: READINESS_META_COPY.description,
  themeColor: STUDIO.canvas,
};

export default function CheckLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="check-studio flex min-h-svh flex-1 flex-col">
      <header className="border-b border-[var(--sc-hairline)]">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/check" className="font-heading text-lg no-underline">
            Readiness Check
          </Link>
          <CheckMenu fontClass="" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">{children}</main>
    </div>
  );
}
