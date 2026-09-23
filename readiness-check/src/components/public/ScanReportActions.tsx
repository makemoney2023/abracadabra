"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ScanReportActionsProps = {
  token: string;
  unlocked: boolean;
};

export function ScanReportActions({ token, unlocked }: ScanReportActionsProps) {
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="cursor-pointer"
        onClick={() => window.print()}
      >
        <Printer data-icon="inline-start" aria-hidden="true" />
        Print report
      </Button>
      {unlocked ? (
        <Button asChild size="sm" className="cursor-pointer">
          <a href={`/api/scans/${token}/pdf`}>
            <Download data-icon="inline-start" aria-hidden="true" />
            Download PDF
          </a>
        </Button>
      ) : (
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Unlock with email to download the full PDF (page matrix + findings).
        </p>
      )}
    </div>
  );
}
