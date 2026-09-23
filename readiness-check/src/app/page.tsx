import { ScanForm } from "@/components/public/ScanForm";
import {
  LandingAnalogy,
  LandingFaq,
  LandingFinalCopy,
  LandingHowItWorks,
  LandingProblem,
} from "@/components/public/landing/LandingSections";
import { LANDING_COPY } from "@/lib/marketing/copy";

export default function Home() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_10%_0%,_oklch(0.93_0.03_210)_0%,_transparent_55%),radial-gradient(ellipse_50%_40%_at_90%_20%,_oklch(0.94_0.02_160)_0%,_transparent_50%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] [background-size:48px_48px]"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <p className="font-heading text-2xl tracking-tight sm:text-3xl">{LANDING_COPY.brand}</p>
        <p className="hidden font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground sm:block">
          {LANDING_COPY.eyebrow}
        </p>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pb-24 pt-6 sm:px-8 sm:pb-32">
        <div className="flex min-h-[70vh] flex-col justify-center">
          <div className="max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-700">
            <div className="space-y-4">
              <h1 className="font-heading text-4xl leading-[1.05] tracking-tight text-foreground sm:text-6xl">
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
            className="space-y-6 border-t border-border/60 pt-12 animate-in fade-in duration-700"
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
