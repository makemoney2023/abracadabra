import type { Metadata } from "next";
import { ScanForm } from "@/components/public/ScanForm";
import {
  LandingAnalogy,
  LandingFaq,
  LandingFinalCopy,
  LandingHowItWorks,
  LandingProblem,
} from "@/components/public/landing/LandingSections";
import { schemaUrl } from "@/lib/hosts";
import { LANDING_COPY, META_COPY } from "@/lib/marketing/copy";

export const metadata: Metadata = {
  title: META_COPY.title,
  description: META_COPY.description,
  alternates: { canonical: `${schemaUrl()}/` },
  openGraph: {
    title: META_COPY.title,
    description: META_COPY.description,
    url: `${schemaUrl()}/`,
  },
};

export default function Home() {
  return (
    <div className="check-studio schema-studio relative flex min-h-full flex-1 flex-col overflow-hidden">
      <header className="schema-nav">
        <a className="schema-mark" href={schemaUrl()}>
          {LANDING_COPY.brand}
        </a>
        <a className="schema-nav__studio" href="https://abra-ca-dabra.app/">
          Abracadabra
        </a>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pb-24 pt-10 sm:px-8 sm:pb-32">
        <div className="flex min-h-[70vh] flex-col justify-center">
          <div className="max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-700">
            <div className="space-y-4">
              <p className="studio-kicker">{LANDING_COPY.eyebrow}</p>
              <h1 className="font-heading text-4xl sm:text-6xl">
                {LANDING_COPY.brand}
              </h1>
              <p className="max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
                {LANDING_COPY.heroSubhead}
              </p>
            </div>

            <div className="max-w-xl animate-in fade-in duration-700 delay-150">
              <ScanForm />
            </div>
          </div>
        </div>

        <div className="mt-8 space-y-12 sm:mt-12 sm:space-y-16">
          <LandingProblem />
          <LandingAnalogy />
          <LandingHowItWorks />
          <LandingFaq />

          <section
            id="scan-again"
            className="space-y-6 border-t border-border pt-12 animate-in fade-in duration-700"
          >
            <LandingFinalCopy />
            <div className="max-w-xl">
              <ScanForm />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
