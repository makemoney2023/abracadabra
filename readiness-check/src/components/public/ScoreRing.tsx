"use client";

import {
  heatConicGradientCss,
  scoreBand,
  scoreBandLabel,
  scoreColorCss,
  scorePercent,
  scoreRatio,
} from "@/lib/scoring/score-color";
import { cn } from "@/lib/utils";

export type ScoreRingProps = {
  score: number;
  max?: number;
  label?: string;
  /** Outer diameter in px */
  size?: number;
  className?: string;
};

/**
 * Single-KPI heat gauge for the overall score.
 * Track shows ColorBrewer-style red→orange→yellow→green; fill stops at the score.
 */
export function ScoreRing({
  score,
  max = 100,
  label = "AI visibility",
  size = 168,
  className,
}: ScoreRingProps) {
  const ratio = scoreRatio(score, max);
  const color = scoreColorCss(ratio);
  const band = scoreBand(ratio);
  const pct = scorePercent(score, max);
  const stroke = Math.max(8, Math.round(size * 0.07));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);
  const display = Number.isFinite(score) ? Math.round(score) : 0;
  const mask = `radial-gradient(farthest-side, transparent calc(100% - ${stroke}px), #000 calc(100% - ${stroke - 0.5}px))`;

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div
        className="relative"
        style={{ width: size, height: size }}
        role="img"
        aria-label={`${label}: ${display} of ${max} (${pct} percent, ${scoreBandLabel(band)})`}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-full opacity-80"
          style={{
            background: heatConicGradientCss(),
            maskImage: mask,
            WebkitMaskImage: mask,
          }}
        />
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="motion-safe:transition-[stroke-dashoffset,stroke] motion-safe:duration-700 motion-safe:ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          <span className="font-heading text-5xl font-medium tabular-nums tracking-tight text-foreground">
            {display}
          </span>
          <span className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            of {max}
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
          <span style={{ color }}>{scoreBandLabel(band)}</span>
          <span className="mx-1.5 text-border">·</span>
          {pct}%
        </p>
      </div>
    </div>
  );
}
