"use client";
import { Icon } from "@iconify/react";
import type { SoundName } from "@/lib/sounds";

export type VisualProps = { active: boolean };


function ChimeVisual({ active }: VisualProps) {
  return (
    <div className="relative flex items-end justify-center gap-1 h-5">
      <span className={`w-1.5 h-1.5 rounded-full bg-sky-400 transition-all duration-300 ${active ? "opacity-100 -translate-y-1 scale-125" : "opacity-40 translate-y-0"}`} />
      <span className={`w-1.5 h-1.5 rounded-full bg-sky-300 transition-all duration-300 delay-150 ${active ? "opacity-100 -translate-y-2.5 scale-125" : "opacity-30 translate-y-0"}`} />
    </div>
  );
}

function SparkleVisual({ active }: VisualProps) {
  return (
    <div className="relative w-8 h-6">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`absolute w-1 h-1 rounded-full bg-amber-300 transition-all ${active ? "opacity-100 scale-100" : "opacity-0 scale-0"}`}
          style={{ left: i * 7, bottom: i * 4, transitionDelay: active ? `${i * 45}ms` : "0ms", transitionDuration: "180ms" }}
        />
      ))}
    </div>
  );
}

function ReadyVisual({ active }: VisualProps) {
  const corner = "absolute w-2 h-2 border-emerald-300/70 transition-transform duration-200";
  return (
    <div className="relative w-6 h-6">
      <span className={`${corner} top-0 left-0 border-t border-l ${active ? "translate-x-0.5 translate-y-0.5" : ""}`} />
      <span className={`${corner} top-0 right-0 border-t border-r ${active ? "-translate-x-0.5 translate-y-0.5" : ""}`} />
      <span className={`${corner} bottom-0 left-0 border-b border-l ${active ? "translate-x-0.5 -translate-y-0.5" : ""}`} />
      <span className={`${corner} bottom-0 right-0 border-b border-r ${active ? "-translate-x-0.5 -translate-y-0.5" : ""}`} />
      <span className={`absolute inset-0 m-auto w-1 h-1 rounded-full bg-emerald-300 transition-opacity duration-150 delay-150 ${active ? "opacity-100" : "opacity-0"}`} />
    </div>
  );
}

function ErrorVisual({ active }: VisualProps) {
  return (
    <div className={`w-4 h-4 rounded-full border border-red-400/50 flex items-center justify-center ${active ? "animate-[shake_300ms_ease-in-out]" : ""}`}>
      <Icon icon="mdi:close" width="10" className="text-red-400/80" />
    </div>
  );
}

function TickVisual({ active }: VisualProps) {
  return (
    <div className={`w-4 h-4 rounded-[3px] border flex items-center justify-center transition-colors duration-150 ${active ? "bg-orange-400 border-orange-400" : "border-muted-foreground/40"}`}>
      <Icon icon="mdi:check" width="10" className={`text-black transition-transform duration-150 ${active ? "scale-100" : "scale-0"}`} />
    </div>
  );
}

function PressVisual({ active }: VisualProps) {
  return <div className={`w-6 h-4 rounded border transition-all duration-100 ${active ? "translate-y-0.5 bg-muted shadow-inner border-border" : "border-muted-foreground/40"}`} />;
}

function ReleaseVisual({ active }: VisualProps) {
  return <div className={`w-6 h-4 rounded border transition-all ${active ? "-translate-y-0.5 border-emerald-400/50 bg-emerald-400/10 duration-150 ease-out" : "translate-y-0 border-muted-foreground/40 duration-100"}`} />;
}

function ToggleVisual({ active }: VisualProps) {
  return (
    <div className={`w-7 h-4 rounded-full flex items-center px-0.5 transition-colors duration-200 ${active ? "bg-fuchsia-500/70 justify-end" : "bg-input justify-start"}`}>
      <span className="w-3 h-3 rounded-full bg-foreground" />
    </div>
  );
}

function PulseVisual({ active }: VisualProps) {
  return (
    <div className="relative w-5 h-5 flex items-center justify-center">
      {active && <span className="absolute inset-0 rounded-full bg-violet-400/40 animate-ping" />}
      <span className="relative w-2.5 h-2.5 rounded-full bg-violet-400" />
    </div>
  );
}

function ScanVisual({ active }: VisualProps) {
  return (
    <div className="relative w-8 h-3 flex items-center">
      <span className="absolute inset-x-0 top-1/2 border-b border-muted-foreground/30" />
      <span className={`absolute w-1 h-1 rounded-full bg-teal-300 ease-linear ${active ? "left-[26px] transition-all duration-500" : "left-0"}`} />
    </div>
  );
}

function PageVisual({ active }: VisualProps) {
  return (
    <div className="relative w-7 h-6 flex items-center justify-center">
      <span className={`absolute w-4 h-5 rounded-sm bg-muted-foreground/20 border border-muted-foreground/30 transition-all duration-250 ease-out ${active ? "-translate-x-1.5 -rotate-6 opacity-40" : "opacity-70"}`} />
      <span className={`absolute w-4 h-5 rounded-sm bg-muted-foreground/25 border border-muted-foreground/35 transition-all duration-250 ease-out ${active ? "translate-x-1 rotate-3" : ""}`} />
    </div>
  );
}

function DropletVisual({ active }: VisualProps) {
  return (
    <div className="relative w-6 h-6 flex items-center justify-center">
      <span className={`absolute w-1.5 h-2 rounded-b-full rounded-t-sm bg-cyan-300 transition-all duration-300 ease-in ${active ? "translate-y-1.5 opacity-0" : "-translate-y-1.5 opacity-100"}`} />
      <span className={`absolute w-4 h-1 rounded-full border border-cyan-300/60 transition-all ${active ? "scale-100 opacity-70 duration-300 delay-200" : "scale-0 opacity-0"}`} />
    </div>
  );
}

function BloomVisual({ active }: VisualProps) {
  return (
    <div className="relative w-6 h-6 flex items-center justify-center">
      <span className={`absolute rounded-full bg-pink-400/30 transition-all duration-500 ease-out ${active ? "w-6 h-6 opacity-100" : "w-2 h-2 opacity-50"}`} />
      <span className="relative w-2 h-2 rounded-full bg-pink-300" />
    </div>
  );
}

function ArrivalVisual({ active }: VisualProps) {
  return (
    <div className="relative w-6 h-6 overflow-hidden">
      <span className={`absolute inset-x-0 bottom-0 h-4 rounded-t-sm bg-indigo-400/30 border-t border-indigo-300/50 transition-all duration-400 ease-out ${active ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`} />
    </div>
  );
}

function WhisperVisual({ active }: VisualProps) {
  return (
    <div className="w-8 h-6 flex items-center justify-center">
      <span className={`px-1.5 py-0.5 rounded text-[8px] bg-muted text-muted-foreground transition-all duration-300 ${active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}>tip</span>
    </div>
  );
}

function LoadingVisual({ active }: VisualProps) {
  return <Icon icon="mdi:loading" width="16" className={active ? "text-blue-400/80 animate-spin" : "text-blue-400/30"} />;
}

function SuccessVisual({ active }: VisualProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="8" fill="none" stroke="rgb(52 211 153)" strokeWidth="1.5"
        className="transition-[stroke-opacity] duration-300" strokeOpacity={active ? 1 : 0.25} />
      <path d="M6 10.5l2.5 2.5L14 7.5" fill="none" stroke="rgb(52 211 153)" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ strokeDasharray: 1, pathLength: 1, strokeDashoffset: active ? 0 : 1, transition: "stroke-dashoffset 300ms ease-out" } as React.CSSProperties} />
    </svg>
  );
}

export const SOUND_VISUALS: Record<SoundName, React.FC<VisualProps>> = {
  chime: ChimeVisual,
  sparkle: SparkleVisual,
  ready: ReadyVisual,
  success: SuccessVisual,
  error: ErrorVisual,
  tick: TickVisual,
  press: PressVisual,
  release: ReleaseVisual,
  toggle: ToggleVisual,
  pulse: PulseVisual,
  scan: ScanVisual,
  page: PageVisual,
  droplet: DropletVisual,
  bloom: BloomVisual,
  arrival: ArrivalVisual,
  whisper: WhisperVisual,
  loading: LoadingVisual,
};