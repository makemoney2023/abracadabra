"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LeadSheet } from "@/components/ops/LeadSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { OpsQueueItem } from "@/lib/ops/queue";
import type { OpsStatus } from "@/lib/types";

function statusVariant(
  status: OpsStatus,
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "won":
      return "default";
    case "contacted":
      return "secondary";
    case "skipped":
      return "outline";
    case "booked":
      return "secondary";
    default:
      return "destructive";
  }
}

async function fetchQueue(params: {
  status: string;
  hasEmail: string;
  minScore: string;
  maxScore: string;
}): Promise<{ items: OpsQueueItem[]; error?: string }> {
  const search = new URLSearchParams();
  if (params.status !== "all") search.set("status", params.status);
  if (params.hasEmail !== "all") search.set("hasEmail", params.hasEmail);
  if (params.minScore.trim()) search.set("minScore", params.minScore.trim());
  if (params.maxScore.trim()) search.set("maxScore", params.maxScore.trim());
  const qs = search.toString();
  const res = await fetch(`/api/ops/queue${qs ? `?${qs}` : ""}`);
  const data = (await res.json()) as { items?: OpsQueueItem[]; error?: string };
  if (!res.ok) {
    return { items: [], error: data.error ?? "Failed to load queue" };
  }
  return { items: data.items ?? [] };
}

export function QueueTable() {
  const [items, setItems] = useState<OpsQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("all");
  const [hasEmail, setHasEmail] = useState<string>("all");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [selected, setSelected] = useState<OpsQueueItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchQueue({ status, hasEmail, minScore, maxScore });
      if (cancelled) return;
      setItems(result.items);
      setError(result.error ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [status, hasEmail, minScore, maxScore, reloadToken]);

  function refresh() {
    setLoading(true);
    setReloadToken((n) => n + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 border-b border-border pb-4">
        <div className="space-y-1">
          <Label htmlFor="filter-status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="filter-status" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="new">new</SelectItem>
              <SelectItem value="contacted">contacted</SelectItem>
              <SelectItem value="won">won</SelectItem>
              <SelectItem value="skipped">skipped</SelectItem>
              <SelectItem value="booked">booked</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-email">Contact</Label>
          <Select value={hasEmail} onValueChange={setHasEmail}>
            <SelectTrigger id="filter-email" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="true">Has email</SelectItem>
              <SelectItem value="false">Missing email</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-min">Min score</Label>
          <Input
            id="filter-min"
            type="number"
            className="w-[100px]"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="filter-max">Max score</Label>
          <Input
            id="filter-max"
            type="number"
            className="w-[100px]"
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            placeholder="100"
          />
        </div>
        <Button type="button" variant="outline" onClick={refresh} className="cursor-pointer">
          Refresh
        </Button>
        <Button asChild variant="secondary" className="ml-auto cursor-pointer">
          <Link href="/ops/prospect">Prospect</Link>
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading queue…</p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Check</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No queue items match filters.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelected(item);
                    setSheetOpen(true);
                  }}
                >
                  <TableCell className="font-medium">
                    {item.lead.name || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.lead.domain}</TableCell>
                  <TableCell className="tabular-nums">
                    {item.latestScan?.scoreTotal ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">{item.priorityScore}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(item.status)} className="rounded-md">
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.missingContact ? (
                      <Badge variant="outline" className="rounded-md">
                        missing
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">ok</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.check?.band ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      ) : null}

      <LeadSheet
        item={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdated={refresh}
      />
    </div>
  );
}
