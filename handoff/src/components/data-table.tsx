import * as React from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import { parseSort, sortHref } from "@/components/data-table-sort";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type Column<Row> = {
  key: string;
  header: string;
  sortable?: boolean;
  align?: "left" | "right";
  width?: string;
  cell: (row: Row) => React.ReactNode;
};

/**
 * Server table for HQ lists. The page sorts `rows` (or each group) with
 * `sortRows` and passes the current `sort` so header links can advance it.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  rowHref,
  sort,
  basePath,
  groups,
  empty,
}: {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  rowHref?: (row: Row) => string;
  sort?: string;
  basePath?: string;
  groups?: { label: string; rows: Row[] }[];
  empty: React.ReactNode;
}) {
  const sections =
    groups !== undefined ? groups.map((group) => ({ label: group.label, rows: group.rows })) : [{ label: null, rows }];
  const total = sections.reduce((count, section) => count + section.rows.length, 0);
  if (total === 0) {
    return <div data-slot="data-table">{empty}</div>;
  }

  const parsed = parseSort(sort);

  return (
    <div data-slot="data-table" className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader className="max-md:sr-only">
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => {
              const active = parsed?.key === column.key ? parsed.dir : null;
              const href =
                column.sortable && basePath ? sortHref(basePath, sort, column.key) : null;
              return (
                <TableHead
                  key={column.key}
                  scope="col"
                  aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(column.align === "right" && "text-right")}
                >
                  {href ? (
                    <Link
                      href={href}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-foreground",
                        column.align === "right" && "flex-row-reverse",
                      )}
                    >
                      {column.header}
                      {active === "asc" ? <ArrowUpIcon className="size-3" aria-hidden /> : null}
                      {active === "desc" ? <ArrowDownIcon className="size-3" aria-hidden /> : null}
                      <span className="sr-only">
                        {active === "asc" ? ", sorted ascending" : active === "desc" ? ", sorted descending" : ", sort"}
                      </span>
                    </Link>
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sections.map((section) => (
            <React.Fragment key={section.label ?? "rows"}>
              {section.label ? (
                <TableRow className="bg-card hover:bg-card md:sticky md:top-[var(--row-h)] md:z-[9]">
                  <TableCell
                    colSpan={columns.length}
                    className="font-mono text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    {section.label}
                  </TableCell>
                </TableRow>
              ) : null}
              {section.rows.map((row) => (
                <DataRow
                  key={rowKey(row)}
                  row={row}
                  columns={columns}
                  href={rowHref?.(row)}
                />
              ))}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DataRow<Row>({
  row,
  columns,
  href,
}: {
  row: Row;
  columns: Column<Row>[];
  href?: string;
}) {
  return (
    <TableRow className="relative max-md:flex max-md:h-auto max-md:flex-col max-md:items-stretch max-md:py-2">
      {columns.map((column, index) => (
        <TableCell
          key={column.key}
          data-label={column.header}
          style={column.width ? { width: column.width } : undefined}
          className={cn(
            "max-md:flex max-md:w-full max-md:items-baseline max-md:justify-between max-md:gap-3 max-md:whitespace-normal max-md:py-1",
            column.align === "right" && "text-right tabular-nums",
          )}
        >
          {href && index === 0 ? (
            <Link href={href} className="absolute inset-0 z-0" aria-label="Open">
              <span className="sr-only">Open</span>
            </Link>
          ) : null}
          <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase md:hidden">
            {column.header}
          </span>
          <span className="relative z-10 min-w-0 pointer-events-none [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_select]:pointer-events-auto [&_textarea]:pointer-events-auto">
            {column.cell(row)}
          </span>
        </TableCell>
      ))}
    </TableRow>
  );
}
