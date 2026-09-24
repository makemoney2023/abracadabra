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
      <div className="absolute inset-0 z-0">
        <OrbitalVideo />
      </div>
      <div
        aria-hidden
        className="absolute inset-0 z-10 bg-[rgba(8,20,15,0.72)] lg:bg-[linear-gradient(90deg,rgba(8,20,15,0.96)_0%,rgba(8,20,15,0.88)_44%,rgba(8,20,15,0.42)_72%,rgba(8,20,15,0.22)_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 z-10 bg-gradient-to-t from-[#08140f]/75 via-transparent to-[#08140f]/20"
      />
      <div aria-hidden className="orbital-hero__glow" />
      <div aria-hidden className="orbital-hero__grid" />
      <div className="relative z-20 flex min-h-[70vh] items-center px-6 py-16 sm:px-10 lg:px-14 lg:py-24">
        <div className="w-full max-w-2xl">
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
      </div>
    </section>
  );
}
