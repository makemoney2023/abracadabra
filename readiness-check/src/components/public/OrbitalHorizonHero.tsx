import { OrbitalVideo } from "@/components/public/OrbitalVideo";
import { ScanForm } from "@/components/public/ScanForm";
import { LANDING_COPY } from "@/lib/marketing/copy";

export function OrbitalHorizonHero() {
  return (
    <section
      role="banner"
      aria-label="AI visibility check"
      className="orbital-hero isolate overflow-hidden rounded-[2rem] border border-white/10 bg-[#08140f] text-white shadow-2xl shadow-slate-950/20"
    >
      <div aria-hidden className="orbital-hero__grid" />
      <div className="relative grid min-h-[70vh] items-center lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative z-20 px-6 py-16 sm:px-10 lg:px-14 lg:py-24">
          <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">
            {LANDING_COPY.eyebrow}
          </p>
          <h1 className="font-heading text-5xl leading-[0.95] tracking-tight text-white sm:text-7xl lg:text-8xl">
            {LANDING_COPY.brand}
          </h1>
          <p className="mt-7 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg">
            {LANDING_COPY.heroSubhead}
          </p>

          <div className="mt-10 max-w-xl rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-md sm:p-5">
            <ScanForm />
          </div>

          <div className="mt-8 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
            <span className="h-2 w-2 rounded-full bg-cyan-200 shadow-[0_0_18px_rgba(165,243,252,0.8)]" />
            Structured data · discovery · answer readiness
          </div>
        </div>

        <div className="relative min-h-[22rem] self-stretch lg:min-h-[44rem]">
          <div aria-hidden className="orbital-hero__glow" />
          <div className="orbital-hero__portal absolute inset-0">
            <OrbitalVideo />
            <div className="absolute inset-0 bg-[#08140f]/25 mix-blend-overlay" />
          </div>
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#08140f] to-transparent lg:inset-y-0 lg:left-0 lg:h-auto lg:w-28 lg:bg-gradient-to-r"
          />
        </div>
      </div>
    </section>
  );
}
