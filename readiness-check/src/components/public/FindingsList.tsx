"use client";

import { Badge } from "@/components/ui/badge";

export type FindingRow = {
  code: string;
  severity: string;
  passed: boolean;
  message: string;
  pageUrl?: string;
};

export function FindingsList({ findings }: { findings: FindingRow[] }) {
  return (
    <section className="space-y-3 animate-in fade-in duration-500">
      <h3 className="font-heading text-2xl tracking-tight">Findings</h3>
      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No findings recorded.</p>
      ) : (
        <ul className="divide-y divide-border/70 border-y border-border/70">
          {findings.map((f, idx) => (
            <li key={`${f.code}-${idx}`} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
              <Badge
                variant={f.passed ? "secondary" : f.severity === "critical" ? "destructive" : "outline"}
                className="w-fit rounded-md capitalize"
              >
                {f.passed ? "pass" : f.severity}
              </Badge>
              <div className="min-w-0">
                <p className="font-mono text-xs text-muted-foreground">{f.code}</p>
                <p className="text-sm">{f.message}</p>
                {f.pageUrl ? (
                  <p className="truncate font-mono text-xs text-muted-foreground">{f.pageUrl}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
