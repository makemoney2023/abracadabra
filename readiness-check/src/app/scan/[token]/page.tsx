"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FindingsList } from "@/components/public/FindingsList";
import { FixPackageDownload } from "@/components/public/FixPackageDownload";
import { OptInForm } from "@/components/public/OptInForm";
import { PageMatrix } from "@/components/public/PageMatrix";
import { ScanReportActions } from "@/components/public/ScanReportActions";
import { ScorePreview } from "@/components/public/ScorePreview";
import { UnlockForm } from "@/components/public/UnlockForm";
import { Button } from "@/components/ui/button";
import type { ScanPayload } from "@/lib/scan/present";

const POLL_MS = 2000;

function stageLabel(status: string): string {
  switch (status) {
    case "queued":
      return "Queued — waiting for workers";
    case "running":
      return "Scanning priority pages and site files (usually under a minute)";
    case "complete":
      return "Scan complete";
    case "failed":
      return "Scan failed";
    default:
      return status;
  }
}

async function loadScan(token: string): Promise<ScanPayload> {
  const res = await fetch(`/api/scans/${token}`);
  const data = (await res.json()) as ScanPayload & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to load scan");
  }
  return data;
}

export default function ScanPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [payload, setPayload] = useState<ScanPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    loadScan(token)
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Network error while loading scan");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  const status = payload?.status;

  useEffect(() => {
    if (!token || !status) return;
    if (status !== "queued" && status !== "running") return;

    const id = window.setInterval(() => {
      loadScan(token)
        .then((data) => {
          setPayload(data);
          setError(null);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Network error while loading scan");
        });
    }, POLL_MS);

    return () => window.clearInterval(id);
  }, [token, status]);

  return (
    <div className="relative flex min-h-full flex-1 flex-col bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_oklch(0.94_0.02_220)_0%,_transparent_55%)]"
      />
      <header className="no-print relative z-10 border-b border-border/60">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4 sm:px-8">
          <Link
            href="/"
            className="font-heading text-xl tracking-tight text-foreground transition-opacity hover:opacity-80"
          >
            Schema
          </Link>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Scan report
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        {loading ? (
          <p className="animate-pulse text-sm text-muted-foreground">Loading scan…</p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {payload ? (
          <div className="space-y-10">
            {(payload.status === "queued" || payload.status === "running") && (
              <section className="animate-in fade-in space-y-3 duration-300">
                <p className="text-xs uppercase tracking-[0.16em] text-accent">In progress</p>
                <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">
                  {payload.domain}
                </h1>
                <p className="text-sm text-muted-foreground">{stageLabel(payload.status)}</p>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-1/3 animate-[progress_1.4s_ease-in-out_infinite] rounded-full bg-accent" />
                </div>
              </section>
            )}

            {payload.status === "failed" ? (
              <section className="space-y-2">
                <h1 className="font-heading text-3xl tracking-tight">Scan failed</h1>
                <p className="text-sm text-muted-foreground">
                  Something went wrong while auditing {payload.domain}. Start a new scan from the
                  home page.
                </p>
                <Button asChild variant="outline" className="cursor-pointer">
                  <Link href="/">Try another URL</Link>
                </Button>
              </section>
            ) : null}

            {payload.status === "complete" ? (
              <>
                <ScorePreview
                  domain={payload.domain}
                  scoreTotal={payload.scoreTotal}
                  scoreBreakdown={payload.scoreBreakdown}
                  topGaps={payload.topGaps}
                  pagesMissingJsonLd={payload.pagesMissingJsonLd}
                  pillarWhy={payload.pillarWhy}
                  scoreSummary={payload.scoreSummary}
                  actions={
                    <ScanReportActions token={token} unlocked={payload.unlocked} />
                  }
                />

                <div className="no-print">
                  <FixPackageDownload token={token} domain={payload.domain} />
                </div>

                {!payload.unlocked ? (
                  <div className="no-print">
                    <UnlockForm
                      token={token}
                      onUnlocked={() => setReloadKey((k) => k + 1)}
                    />
                  </div>
                ) : (
                  <>
                    <PageMatrix pages={payload.pages} />
                    <FindingsList findings={payload.findings} />
                    <div className="no-print border-t border-border/70 pt-8">
                      <ScanReportActions token={token} unlocked />
                    </div>
                    <div className="no-print">
                      <OptInForm token={token} />
                    </div>
                  </>
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
