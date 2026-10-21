"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { groupPages, pageRank, pageSlice, type MatrixPage, type PageGroup } from "@/lib/scan/page-groups";

export type PageMatrixRow = MatrixPage;

export type PageMatrixProps = {
  pages: PageMatrixRow[];
  /** CSV of every page, served behind the same unlock as this matrix. */
  csvHref?: string;
};

/** Rows per group page. A 1,000-page deep scan stays a short list per section. */
export const MATRIX_PAGE_SIZE = 25;

function StatusBadge({ page }: { page: PageMatrixRow }) {
  const rank = pageRank(page);
  const label = rank === 0 ? "Not fetched" : rank === 1 ? "No schema" : "OK";
  const tone =
    rank === 0
      ? "border-[var(--sc-accent)] text-[var(--sc-accent)]"
      : rank === 1
        ? "border-[var(--sc-hairline-strong)] text-foreground"
        : "border-[var(--sc-hairline)] text-muted-foreground";
  return (
    <Badge variant="outline" className={`rounded-md font-normal ${tone}`}>
      {label}
    </Badge>
  );
}

function GroupTable({ group }: { group: PageGroup<PageMatrixRow> }) {
  const [page, setPage] = useState(0);
  const slice = pageSlice(group.pages, page, MATRIX_PAGE_SIZE);
  return (
    <div className="border-t border-[var(--sc-hairline)]">
      <ul className="divide-y divide-[var(--sc-hairline)]">
        {slice.items.map((row) => (
          <li key={row.url} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,11rem)] sm:items-center sm:gap-4">
            <a
              href={row.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 truncate font-mono text-xs text-foreground underline-offset-2 hover:underline"
              title={row.url}
            >
              {row.url}
            </a>
            <span>
              <StatusBadge page={row} />
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {row.hasJsonLd ? (row.schemaTypes.length > 0 ? row.schemaTypes.slice(0, 3).join(", ") : "JSON-LD") : "—"}
            </span>
          </li>
        ))}
      </ul>
      {slice.pages > 1 ? (
        <div className="no-print flex items-center justify-between gap-3 border-t border-[var(--sc-hairline)] px-4 py-2 text-xs text-muted-foreground">
          <span>
            {slice.page * MATRIX_PAGE_SIZE + 1}–{slice.page * MATRIX_PAGE_SIZE + slice.items.length} of {group.pages.length}
          </span>
          <span className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="cursor-pointer" disabled={slice.page === 0} onClick={() => setPage(slice.page - 1)}>
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="cursor-pointer"
              disabled={slice.page >= slice.pages - 1}
              onClick={() => setPage(slice.page + 1)}
            >
              Next
            </Button>
          </span>
        </div>
      ) : null}
    </div>
  );
}

export const MATRIX_OPEN_ALL_UP_TO = 40;
const MATRIX_OPEN_SECTIONS = 3;

export function initiallyOpen(groups: PageGroup[], pageCount: number): string[] {
  if (pageCount <= MATRIX_OPEN_ALL_UP_TO) return groups.map((g) => g.key);
  const failing = groups.filter((g) => g.failed > 0).slice(0, MATRIX_OPEN_SECTIONS);
  return (failing.length > 0 ? failing : groups.slice(0, 1)).map((g) => g.key);
}

export function PageMatrix({ pages, csvHref }: PageMatrixProps) {
  const groups = useMemo(() => groupPages(pages), [pages]);
  const failed = groups.reduce((sum, g) => sum + g.failed, 0);
  const missing = groups.reduce((sum, g) => sum + g.missingSchema, 0);
  // A small scan opens everything. A large one opens the first few sections with failures (or just the first).
  const [open, setOpen] = useState<Set<string>>(() => new Set(initiallyOpen(groups, pages.length)));
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section className="space-y-4 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-heading text-2xl tracking-tight">Page matrix</h3>
          <p className="text-sm text-muted-foreground">
            {pages.length} pages by section. {failed} could not be fetched, {missing} have no structured data. Problems first.
          </p>
        </div>
        {csvHref && pages.length > 0 ? (
          <Button asChild variant="outline" size="sm" className="no-print cursor-pointer">
            <a href={csvHref}>Download CSV</a>
          </Button>
        ) : null}
      </div>
      {pages.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pages recorded for this scan.</p>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const isOpen = open.has(group.key);
            return (
              <div key={group.key} className="overflow-hidden rounded-lg border border-[var(--sc-hairline)] bg-[var(--sc-surface)]">
                <button
                  type="button"
                  onClick={() => toggle(group.key)}
                  aria-expanded={isOpen}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--sc-raised)]"
                >
                  <span className="min-w-0">
                    <span className="font-heading text-sm font-semibold">{group.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{group.pages.length} pages</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs">
                    {group.failed > 0 ? <span className="text-[var(--sc-accent)]">{group.failed} not fetched</span> : null}
                    {group.missingSchema > 0 ? <span className="text-muted-foreground">{group.missingSchema} no schema</span> : null}
                    <ChevronDown aria-hidden="true" className={`size-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </span>
                </button>
                {isOpen ? <GroupTable group={group} /> : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
