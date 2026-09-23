"use client";

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HEAT_STOPS, scoreBand, scoreBandLabel, scoreColorCss, scorePercent, scoreRatio } from "@/lib/scoring/score-color";
import { cn } from "@/lib/utils";

export type PillarMeterProps = {
  label: string;
  score: number;
  max: number;
  /** Plain-language explanation of what the pillar measures */
  description: string;
  className?: string;
};

/**
 * Compact multi-KPI meter (bullet-chart family).
 * ui-ux-pro-max: for 3+ KPIs prefer bullet/meter grid over multiple gauges.
 */
export function PillarMeter({
  label,
  score,
  max,
  description,
  className,
}: PillarMeterProps) {
  const ratio = scoreRatio(score, max);
  const color = scoreColorCss(ratio);
  const band = scoreBand(ratio);
  const pct = scorePercent(score, max);
  const display = Number.isFinite(score) ? Math.round(score) : 0;
  const widthPct = `${Math.round(ratio * 1000) / 10}%`;

  return (
    <div
      className={cn("min-w-0 space-y-2", className)}
      role="group"
      aria-label={`${label}: ${display} of ${max}, ${pct} percent, ${scoreBandLabel(band)}. ${description}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-medium text-foreground">{label}</p>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`About ${label}`}
              >
                <Info className="size-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-pretty leading-relaxed">
              {description}
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          <span className="text-foreground">{display}</span>/{max}
          <span className="mx-1.5 text-border">·</span>
          {pct}%
        </p>
      </div>

      <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex">
          {HEAT_STOPS.slice(0, 4).map((stop, i) => (
            <span
              key={stop.hex}
              className="w-1/4 border-r border-background/80 last:border-r-0"
              style={{ backgroundColor: `${HEAT_STOPS[i]!.hex}33` }}
            />
          ))}
        </div>
        <div
          className="relative h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-out"
          style={{ width: widthPct, backgroundColor: color }}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        <span style={{ color }}>{scoreBandLabel(band)}</span>
        <span className="text-muted-foreground/80"> vs max {max} pts</span>
      </p>
    </div>
  );
}
