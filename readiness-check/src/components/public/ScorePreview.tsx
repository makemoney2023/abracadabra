"use client";

import type { ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PillarMeter } from "@/components/public/PillarMeter";
import { ScoreRing } from "@/components/public/ScoreRing";
import { SCORE_PREVIEW_COPY } from "@/lib/marketing/copy";
import type { PageMissingJsonLd, ScanGap } from "@/lib/scan/present";
import { PILLAR_DESCRIPTIONS, type PillarWhy } from "@/lib/scoring/pillar-why";
import type { ScoreSummary } from "@/lib/scoring/score-summary";
import type { ScoreBreakdown } from "@/lib/types";

const PILLARS: Array<{ key: keyof ScoreBreakdown; label: string; max: number }> = [
  { key: "structuredData", label: "Structured data", max: 35 },
  { key: "aiDiscoveryFiles", label: "AI discovery files", max: 20 },
  { key: "aiCrawlability", label: "AI crawlability", max: 20 },
  { key: "pageCoverage", label: "Page coverage", max: 15 },
  { key: "answerReadiness", label: "Answer readiness", max: 10 },
];

function asBreakdown(value: unknown): Partial<ScoreBreakdown> {
  if (!value || typeof value !== "object") return {};
  return value as Partial<ScoreBreakdown>;
}

export type ScorePreviewProps = {
  domain: string;
  scoreTotal: number | null;
  scoreBreakdown: unknown;
  topGaps: ScanGap[];
  pagesMissingJsonLd?: PageMissingJsonLd[];
  pillarWhy?: Record<keyof ScoreBreakdown, PillarWhy> | null;
  scoreSummary?: ScoreSummary | null;
  actions?: ReactNode;
};

export function ScorePreview({
  domain,
  scoreTotal,
  scoreBreakdown,
  topGaps,
  pagesMissingJsonLd = [],
  pillarWhy,
  scoreSummary,
  actions,
}: ScorePreviewProps) {
  const breakdown = asBreakdown(scoreBreakdown);
  const total = typeof scoreTotal === "number" ? scoreTotal : 0;

  return (
    <section className="space-y-10 animate-in fade-in duration-500">
      <div className="grid items-center gap-8 border-b border-border/70 pb-8 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            {SCORE_PREVIEW_COPY.label}
          </p>
          <h2 className="text-balance font-heading text-3xl tracking-tight text-foreground sm:text-4xl">
            <span translate="no">{domain}</span>
          </h2>
          <p className="max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
            {SCORE_PREVIEW_COPY.previewHint}
          </p>
          {actions ? <div className="no-print pt-2">{actions}</div> : null}
        </div>

        {scoreTotal == null ? (
          <p className="font-heading text-5xl tabular-nums text-muted-foreground">—</p>
        ) : (
          <ScoreRing score={total} max={100} label="Overall score" size={172} />
        )}
      </div>

      {scoreSummary ? (
        <div className="space-y-3 rounded-xl border border-border/70 bg-muted/30 px-5 py-5">
          <h3 className="font-heading text-xl tracking-tight text-foreground text-pretty">
            {scoreSummary.headline}
          </h3>
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            {scoreSummary.body}
          </p>
          {scoreSummary.drivers.length > 0 ? (
            <ul className="mt-2 space-y-1.5 border-t border-border/60 pt-3">
              {scoreSummary.drivers.map((driver) => (
                <li
                  key={driver}
                  className="flex gap-2 text-sm text-foreground/90 before:mt-2 before:block before:size-1 before:shrink-0 before:rounded-full before:bg-accent"
                >
                  <span className="text-pretty">{driver}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-5">
        <div className="flex items-end justify-between gap-3">
          <h3 className="text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Pillars
          </h3>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Heat scale · red → orange → yellow → green
          </p>
        </div>

        <TooltipProvider delayDuration={200}>
          <ul className="space-y-5">
            {PILLARS.map((pillar, i) => {
              const score = typeof breakdown[pillar.key] === "number" ? breakdown[pillar.key]! : 0;
              const why = pillarWhy?.[pillar.key];
              return (
                <li
                  key={pillar.key}
                  className="animate-in fade-in slide-in-from-bottom-1 duration-400"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <PillarMeter
                    label={pillar.label}
                    score={score}
                    max={pillar.max}
                    description={PILLAR_DESCRIPTIONS[pillar.key]}
                  />
                  {why ? (
                    <Accordion type="single" collapsible className="mt-1 w-full">
                      <AccordionItem value={`why-${pillar.key}`} className="border-none">
                        <AccordionTrigger className="py-1.5 text-xs font-normal text-muted-foreground hover:no-underline hover:text-foreground">
                          Why this score
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground">
                          <p className="text-foreground/90">{why.summary}</p>
                          {why.bullets.length > 0 ? (
                            <>
                              <p className="mt-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                Gaps
                              </p>
                              <ul className="mt-1 list-disc space-y-1 pl-4">
                                {why.bullets.map((bullet) => (
                                  <li key={bullet}>{bullet}</li>
                                ))}
                              </ul>
                            </>
                          ) : null}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </TooltipProvider>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Top gaps
        </h3>
        {topGaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No critical gaps surfaced.</p>
        ) : (
          <ul className="space-y-2">
            {topGaps.map((gap) => (
              <li
                key={`${gap.code}-${gap.message}`}
                className="flex flex-col gap-1 border-l-2 border-accent pl-3 sm:flex-row sm:items-center sm:gap-3"
              >
                <Badge
                  variant={gap.severity === "critical" ? "destructive" : "outline"}
                  className="w-fit rounded-md"
                >
                  {gap.severity}
                </Badge>
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">{gap.code}</p>
                  <p className="text-sm text-pretty">{gap.message}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 pt-2">
          <h4 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Pages missing JSON-LD ({pagesMissingJsonLd.length})
          </h4>
          {pagesMissingJsonLd.length === 0 ? (
            <p className="text-sm text-muted-foreground">All fetched pages include JSON-LD.</p>
          ) : (
            <ul className="max-h-56 space-y-1.5 overflow-y-auto print:max-h-none">
              {pagesMissingJsonLd.map((page) => (
                <li
                  key={page.url}
                  className="flex flex-col gap-0.5 border-l-2 border-border pl-3 sm:flex-row sm:items-baseline sm:gap-3"
                >
                  <Badge variant="outline" className="w-fit rounded-md font-mono text-[10px]">
                    {page.pageType}
                  </Badge>
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 truncate text-sm text-foreground underline-offset-2 hover:underline"
                    translate="no"
                  >
                    {page.url}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
