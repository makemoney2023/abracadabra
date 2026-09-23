"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PillarMeter } from "@/components/public/PillarMeter";
import { ScoreRing } from "@/components/public/ScoreRing";
import type { AssessmentPayload, ResultsPayload } from "@/lib/assessment/present";
import type { ScoreBreakdown } from "@/lib/types";
import { BookingCard } from "./BookingCard";

const PILLARS: Array<{ key: keyof ScoreBreakdown; label: string; max: number; description: string }> = [
  { key: "structuredData", label: "Structured data", max: 35, description: "JSON-LD the page actually publishes." },
  { key: "aiDiscoveryFiles", label: "Discovery files", max: 20, description: "llms.txt, llms-full, and the sitemap." },
  { key: "aiCrawlability", label: "AI crawl", max: 20, description: "Whether answer-engine crawlers are allowed in." },
  { key: "pageCoverage", label: "Page coverage", max: 15, description: "How many key pages carry structured data." },
  { key: "answerReadiness", label: "Answer readiness", max: 10, description: "Whether a page can answer a direct question." },
];

function SuggestionList({ items }: { items: ResultsPayload["suggestions"]["readiness"] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing to flag here.</p>;
  return (
    <ul className="divide-y divide-border border-y border-border">
      {items.map((item) => (
        <li key={item.code} className="py-3">
          <Link href={`/check/guide/${item.guideSlug}`} className="font-medium underline-offset-4 hover:underline">
            {item.title}
          </Link>
          <p className="text-sm text-muted-foreground">{item.body}</p>
        </li>
      ))}
    </ul>
  );
}

export function ResultsView({ token, initial }: { token: string; initial: ResultsPayload }) {
  const [results, setResults] = useState(initial);

  useEffect(() => {
    void fetch(`/api/assessments/${token}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "results_viewed" }),
    });
  }, [token]);

  useEffect(() => {
    if (results.scores.visibility.status !== "pending") return;
    const started = Date.now();
    const timer = window.setInterval(async () => {
      if (Date.now() - started > 3 * 60 * 1000) {
        window.clearInterval(timer);
        return;
      }
      const res = await fetch(`/api/assessments/${token}`);
      if (!res.ok) return;
      const data = (await res.json()) as AssessmentPayload;
      if (data.results) setResults(data.results);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [results.scores.visibility.status, token]);

  const { scores } = results;
  const breakdown = scores.visibility.breakdown;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Readiness Check</p>
        <h1 className="font-heading text-4xl tracking-tight">{results.bandLabel}</h1>
        <p className="text-lg text-muted-foreground">
          {results.bandSentence}
          {results.topPressureLabel ? ` The job that costs the most right now: ${results.topPressureLabel}.` : ""}
        </p>
      </header>

      <section className="space-y-4" aria-labelledby="readiness-heading">
        <h2 id="readiness-heading" className="font-heading text-2xl">
          Readiness
        </h2>
        <ScoreRing score={scores.readiness.total} label="Readiness" />
        <div className="grid gap-3 sm:grid-cols-2">
          <PillarMeter label="Data" score={scores.readiness.data} max={100} description="Where the knowledge lives." />
          <PillarMeter label="Process" score={scores.readiness.process} max={100} description="Whether the workflow is written down." />
          <PillarMeter label="People" score={scores.readiness.people} max={100} description="Who would own a new system." />
          <PillarMeter label="Decision" score={scores.readiness.decision} max={100} description="Who can say yes, and how fast." />
        </div>
        <SuggestionList items={results.suggestions.readiness} />
      </section>

      <section className="space-y-4" aria-labelledby="visibility-heading">
        <h2 id="visibility-heading" className="font-heading text-2xl">
          Website visibility
        </h2>
        {scores.visibility.status === "complete" && scores.visibility.total != null ? (
          <ScoreRing score={scores.visibility.total} label="AI visibility" />
        ) : (
          <p className="text-sm text-muted-foreground">
            {scores.visibility.status === "pending"
              ? "Reading the site. This card updates on its own."
              : "We could not read the site on this pass. The rest of the check still stands."}
          </p>
        )}
        {breakdown ? (
          <div className="grid gap-3">
            {PILLARS.map((pillar) => (
              <PillarMeter
                key={pillar.key}
                label={pillar.label}
                score={breakdown[pillar.key]}
                max={pillar.max}
                description={pillar.description}
              />
            ))}
          </div>
        ) : null}
        {results.scan ? (
          <Link href={`/scan/${results.scan.token}`} className="text-sm underline">
            Open the full site scan
          </Link>
        ) : null}
        <SuggestionList items={results.suggestions.visibility} />
      </section>

      <section className="space-y-4" aria-labelledby="growth-heading">
        <h2 id="growth-heading" className="font-heading text-2xl">
          Growth
        </h2>
        <ScoreRing score={scores.growth.total} label="Growth" />
        <SuggestionList items={results.suggestions.growth} />
      </section>

      <section className="space-y-3" aria-labelledby="pressure-heading">
        <h2 id="pressure-heading" className="font-heading text-2xl">
          Pressure
        </h2>
        {scores.pressures.length === 0 ? (
          <p className="text-sm text-muted-foreground">No single job was named.</p>
        ) : (
          <ul className="space-y-2">
            {scores.pressures.map((item) => (
              <li key={item.code} className="flex items-center justify-between gap-3 text-sm">
                <span>{item.code}</span>
                <span className="rounded-full border px-2 py-0.5 text-xs">Severity {item.severity}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="help-heading">
        <h2 id="help-heading" className="font-heading text-2xl">
          How we can help
        </h2>
        {results.offers.map((offer) => (
          <article key={offer.row} className="space-y-2 rounded-lg border border-border p-4">
            <h3 className="font-medium">{offer.said}</h3>
            <p className="text-sm text-muted-foreground">{offer.build}</p>
            {offer.specimens.length > 0 ? (
              <ul className="text-sm">
                {offer.specimens.map((specimen) => (
                  <li key={specimen.url}>
                    <a className="underline" href={specimen.url}>
                      {specimen.name}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </section>

      <BookingCard token={token} booking={results.booking} />

      <div className="flex flex-wrap gap-3">
        <a
          href={`/api/assessments/${token}/pdf`}
          className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm"
          onClick={() => {
            void fetch(`/api/assessments/${token}/events`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ kind: "pdf_downloaded" }),
            });
          }}
        >
          Download report
        </a>
      </div>
    </div>
  );
}
