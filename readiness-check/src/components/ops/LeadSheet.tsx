"use client";

import { useEffect, useState } from "react";
import { PageMatrix, type PageMatrixRow } from "@/components/public/PageMatrix";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { buildOutreachBlurb } from "@/lib/ops/outreach";
import type { OpsQueueItem } from "@/lib/ops/queue";
import type { OpsStatus } from "@/lib/types";

const STATUSES: OpsStatus[] = ["new", "contacted", "won", "skipped", "booked"];

export type LeadSheetProps = {
  item: OpsQueueItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
};

function LeadSheetBody({
  item,
  open,
  onUpdated,
}: {
  item: OpsQueueItem;
  open: boolean;
  onUpdated: () => void;
}) {
  const [status, setStatus] = useState<OpsStatus>(item.status);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pages, setPages] = useState<PageMatrixRow[]>([]);

  useEffect(() => {
    if (!open || !item.latestScan?.publicToken) return;
    let cancelled = false;
    const token = item.latestScan.publicToken;
    fetch(`/api/ops/scans/${token}`)
      .then(async (res) => {
        const data = (await res.json()) as { pages?: PageMatrixRow[] };
        if (!cancelled && res.ok && Array.isArray(data.pages)) {
          setPages(data.pages);
        }
      })
      .catch(() => {
        /* matrix is optional enrichment */
      });
    return () => {
      cancelled = true;
    };
  }, [open, item.latestScan?.publicToken]);

  async function save() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/ops/queue/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Update failed");
        return;
      }
      onUpdated();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  async function rescan() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/rescan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId: item.leadId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Rescan failed");
        return;
      }
      onUpdated();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  async function copyBlurb() {
    const blurb = buildOutreachBlurb(
      { name: item.lead.name, domain: item.lead.domain },
      {
        scoreTotal: item.latestScan?.scoreTotal ?? null,
        topGaps: item.topGaps,
      },
    );
    try {
      await navigator.clipboard.writeText(blurb);
      setCopied(true);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  const website = item.lead.website || `https://${item.lead.domain}`;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-heading text-xl tracking-tight">
          {item.lead.name || item.lead.domain}
        </SheetTitle>
        <SheetDescription className="font-mono text-xs">
          {item.lead.domain}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-6 space-y-6 px-4 pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="rounded-md tabular-nums">
            Score {item.latestScan?.scoreTotal ?? "—"}
          </Badge>
          <Badge
            variant={item.missingContact ? "destructive" : "secondary"}
            className="rounded-md"
          >
            {item.missingContact ? "Missing contact" : "Has contact"}
          </Badge>
          <Badge variant="outline" className="rounded-md">
            Priority {item.priorityScore}
          </Badge>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ops-status">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as OpsStatus)}>
            <SelectTrigger id="ops-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ops-notes">Notes</Label>
          <textarea
            id="ops-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Contacts
          </p>
          {item.contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {item.contacts.map((c) => (
                <li key={c.id} className="border-l-2 border-border pl-3">
                  <p className="font-medium">{c.name || "Unknown"}</p>
                  <p className="text-muted-foreground">
                    {[c.title, c.email, c.phone].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {item.check ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Readiness Check
            </p>
            <p className="text-sm">
              Band {item.check.band ?? "—"} · overall {item.check.overall ?? "—"} · readiness{" "}
              {item.check.readiness ?? "—"} · growth {item.check.growth ?? "—"} · visibility{" "}
              {item.check.visibility ?? "—"}
            </p>
            {item.check.pressures.length > 0 ? (
              <p className="text-sm text-muted-foreground">{item.check.pressures.join(", ")}</p>
            ) : null}
            {item.check.appointmentStartsAt ? (
              <p className="text-sm">Session {item.check.appointmentStartsAt}</p>
            ) : null}
            <a className="text-sm underline" href={`/check/${item.check.token}`}>
              Open the check
            </a>
          </div>
        ) : null}

        {item.topGaps.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Top gaps
            </p>
            <ul className="space-y-1 text-sm">
              {item.topGaps.map((g) => (
                <li key={`${g.code}-${g.message}`}>{g.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {item.latestScan ? <PageMatrix pages={pages} /> : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={save}
            disabled={pending}
            className="cursor-pointer"
          >
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={rescan}
            disabled={pending}
            className="cursor-pointer"
          >
            Re-scan
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={copyBlurb}
            className="cursor-pointer"
          >
            {copied ? "Copied" : "Copy outreach"}
          </Button>
          <Button asChild variant="ghost" className="cursor-pointer">
            <a href={website} target="_blank" rel="noreferrer">
              Open site
            </a>
          </Button>
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </>
  );
}

export function LeadSheet({ item, open, onOpenChange, onUpdated }: LeadSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {item ? (
          <LeadSheetBody
            key={item.id}
            item={item}
            open={open}
            onUpdated={onUpdated}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
