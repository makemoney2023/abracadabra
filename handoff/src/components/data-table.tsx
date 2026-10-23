import * as React from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, SearchXIcon } from "lucide-react";

import { splitMobileColumns } from "@/components/data-table-mobile";
import { DataTableFooter } from "@/components/data-table-footer";
import {
  DataTableToolbar,
  type ToolbarFilter,
} from "@/components/data-table-toolbar";
import {
  COLUMNS_KEY_PREFIX,
  applyFilters,
  buildHref,
  deriveOptions,
  firstParam,
  matchesSearch,
  paginate,
  parsePage,
  parsePageSize,
  pathOf,
  safeKey,
  type FilterDef,
  type RawQuery,
} from "@/components/data-table-query";
import { RowClickForwarder } from "@/components/data-table-row-click";
import { nextSort, parseSort } from "@/components/data-table-sort";
import { TruncatedText } from "@/components/truncated-text";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
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
  /** Set to false to keep the column out of the Columns menu. The first column is always kept. */
  hideable?: boolean;
  /** Cut long text to one line at this width (`true` is 20rem). A string cell gets a tooltip. */
  truncate?: boolean | string;
  cell: (row: Row) => React.ReactNode;
};

export type DataTableSearch<Row> = {
  /** Label and placeholder, for example "Search clients". */
  label?: string;
  /** Query param. Defaults to `q`. */
  param?: string;
  /**
   * The text a row is searched by. Leave it out when the page already
   * filters by this param itself and only wants the box.
   */
  text?: (row: Row) => string;
};

/**
 * Server table for HQ lists. The page sorts `rows` (or each group) with
 * `sortRows` and passes the current `sort` so header links can advance it.
 *
 * Everything past that is opt in, and every piece of state is a query param:
 * - `search` / `filters` add a toolbar and filter `rows` from `query`.
 * - `pageSize` pages the rows from `?page=` and `?size=`.
 * - `columnPicker` adds the Columns menu (kept in this browser).
 * Grouped tables skip search, filters and paging.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  rowHref,
  rowLabel,
  sort,
  basePath,
  groups,
  empty,
  id,
  query,
  search,
  filters,
  pageSize,
  columnPicker,
  density,
  toolbarExtra,
  className,
}: {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  rowHref?: (row: Row) => string;
  /** Accessible name for the row link, for example the client's name. */
  rowLabel?: (row: Row) => string;
  sort?: string;
  basePath?: string;
  groups?: { label: string; rows: Row[] }[];
  empty: React.ReactNode;
  /** Names this table for the Columns menu. Defaults to the path of `basePath`. */
  id?: string;
  /** The page's `searchParams`. Needed for search, filters and paging. */
  query?: RawQuery;
  search?: DataTableSearch<Row> | boolean;
  filters?: FilterDef<Row>[];
  /** Rows per page when `?size=` is absent. Turns paging on. */
  pageSize?: number;
  columnPicker?: boolean;
  /** Show the comfortable/compact switch in the toolbar. On with a toolbar. */
  density?: boolean;
  toolbarExtra?: React.ReactNode;
  className?: string;
}) {
  const grouped = groups !== undefined;
  const base = basePath ?? "";
  const tableId = safeKey(id ?? (pathOf(base).replace(/^\/+/, "") || "table"));
  const searchDef: DataTableSearch<Row> | null =
    search === undefined || search === false ? null : search === true ? {} : search;
  const searchParam = searchDef?.param ?? "q";
  const raw = query ?? {};
  const q = searchDef ? firstParam(raw[searchParam]) : "";
  const filterDefs = grouped ? [] : (filters ?? []);
  const filterValues: Record<string, string> = {};
  for (const filter of filterDefs) {
    const value = firstParam(raw[filter.key]);
    if (value) filterValues[filter.key] = value;
  }
  const paging = pageSize !== undefined && !grouped;
  const size = paging ? parsePageSize(firstParam(raw.size), pageSize) : 0;
  const sizeParam = paging && firstParam(raw.size) && size !== pageSize ? String(size) : undefined;

  // The state every link rebuilds from. `page` is left out on purpose.
  const params: Record<string, string | undefined> = {
    sort: sort || undefined,
    [searchParam]: q || undefined,
    size: sizeParam,
    ...filterValues,
  };

  const hasToolbar = Boolean(searchDef) || filterDefs.length > 0 || Boolean(columnPicker) || Boolean(toolbarExtra);

  let shown = rows;
  const ownFilter = (searchDef?.text && q) || Object.keys(filterValues).length > 0;
  if (!grouped) {
    if (searchDef?.text && q) {
      const text = searchDef.text;
      shown = shown.filter((row) => matchesSearch(text(row), q));
    }
    shown = applyFilters(shown, filterDefs, filterValues);
  }
  const sections = grouped
    ? groups.map((group) => ({ label: group.label, rows: group.rows }))
    : [{ label: null as string | null, rows: shown }];
  const total = sections.reduce((count, section) => count + section.rows.length, 0);

  const paged = paginate(grouped ? [] : shown, paging ? parsePage(firstParam(raw.page)) : 1, paging ? size : Math.max(1, shown.length));
  if (paging) sections[0] = { label: null, rows: paged.rows };

  const clearPatch: Record<string, null> = { [searchParam]: null };
  for (const filter of filterDefs) clearPatch[filter.key] = null;
  const searching = Boolean(q) || Object.keys(filterValues).length > 0;
  const showToolbar = hasToolbar && (rows.length > 0 || searching || grouped);

  const pickable = columns
    .map((column, index) => ({ column, index }))
    .filter(({ column, index }) => index > 0 && column.hideable !== false)
    .map(({ column }) => ({ key: safeKey(column.key), header: column.header }));
  const withPicker = Boolean(columnPicker) && pickable.length > 0;

  if (total === 0) {
    const noMatches = ownFilter && rows.length > 0;
    const body = noMatches ? (
      <Empty className="border border-dashed border-border py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle>No matches</EmptyTitle>
          <EmptyDescription>Nothing fits this search or filter. Try fewer words or clear it.</EmptyDescription>
        </EmptyHeader>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href={buildHref(base || "?", { sort: params.sort, size: params.size }, clearPatch)}>Clear</Link>
        </Button>
      </Empty>
    ) : (
      empty
    );
    if (!showToolbar) return <div data-slot="data-table">{body}</div>;
    return (
      <div data-slot="data-table-root" className={cn("flex flex-col gap-3", className)}>
        {renderToolbar()}
        <div data-slot="data-table">{body}</div>
      </div>
    );
  }

  const parsed = parseSort(sort);
  const showFooter = paging || hasToolbar;

  function renderToolbar() {
    const toolbarFilters: ToolbarFilter[] = filterDefs.map((filter) => ({
      key: filter.key,
      label: filter.label,
      value: filterValues[filter.key] ?? "",
      options: filter.options ?? deriveOptions(rows, filter.get),
    }));
    return (
      <DataTableToolbar
        basePath={base}
        params={params}
        searchParam={searchParam}
        searchLabel={searchDef?.label ?? "Search"}
        showSearch={Boolean(searchDef)}
        q={q}
        filters={toolbarFilters}
        columns={withPicker ? pickable : undefined}
        tableId={tableId}
        density={density ?? true}
        extra={toolbarExtra}
      />
    );
  }

  return (
    <div data-slot="data-table-root" className={cn("flex flex-col gap-3", className)}>
      {showToolbar ? renderToolbar() : null}
      <div
        data-slot="data-table"
        data-dt-id={tableId}
        suppressHydrationWarning
        className="overflow-hidden rounded-lg border border-border"
      >
        {withPicker ? <HiddenColumns tableId={tableId} keys={pickable.map((column) => column.key)} /> : null}
        {rowHref ? <RowClickForwarder /> : null}
        <Table containerClassName="md:max-h-[75dvh] md:overflow-y-auto">
          <TableHeader className="max-md:sr-only">
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => {
                const active = parsed?.key === column.key ? parsed.dir : null;
                const href =
                  column.sortable && basePath !== undefined
                    ? buildHref(base, params, { sort: nextSort(sort, column.key) })
                    : null;
                return (
                  <TableHead
                    key={column.key}
                    scope="col"
                    data-col={safeKey(column.key)}
                    aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}
                    style={column.width ? { width: column.width } : undefined}
                    className={cn(
                      "sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_var(--border)]",
                      column.align === "right" && "text-right",
                    )}
                  >
                    {href ? (
                      <Link
                        href={href}
                        className={cn(
                          "group/sort -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60",
                          active && "text-foreground",
                          column.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {column.header}
                        {active === "asc" ? (
                          <ArrowUpIcon className="size-3 text-primary" aria-hidden />
                        ) : active === "desc" ? (
                          <ArrowDownIcon className="size-3 text-primary" aria-hidden />
                        ) : (
                          <ChevronsUpDownIcon
                            className="size-3 opacity-40 transition-opacity group-hover/sort:opacity-100 group-focus-visible/sort:opacity-100"
                            aria-hidden
                          />
                        )}
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
                      className="eyebrow text-[11px] text-muted-foreground"
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
                    href={rowHref?.(row) || undefined}
                    label={rowLabel?.(row)}
                  />
                ))}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
      {showFooter ? (
        <DataTableFooter
          basePath={base}
          params={params}
          paged={paging ? paged : { ...paged, from: 1, to: total, total, pages: 1 }}
          defaultSize={pageSize ?? 25}
          paginate={paging}
        />
      ) : null}
    </div>
  );
}

/**
 * Hides the columns this browser chose before the table paints. The script
 * runs as the table streams in, so a hidden column never flashes. The rules
 * match `data-hidden` on the table, which the Columns menu keeps current.
 */
function HiddenColumns({ tableId, keys }: { tableId: string; keys: string[] }) {
  const rules = keys
    .map((key) => `[data-dt-id="${tableId}"][data-hidden~="${key}"] [data-col="${key}"]{display:none}`)
    .join("");
  const boot = `(function(){try{var s=document.currentScript,e=s&&s.parentElement;var v=JSON.parse(localStorage.getItem(${JSON.stringify(COLUMNS_KEY_PREFIX + tableId)})||"[]");if(e&&Array.isArray(v)&&v.length)e.setAttribute("data-hidden",v.join(" "))}catch(x){}})();`;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: rules }} />
      <script dangerouslySetInnerHTML={{ __html: boot }} />
    </>
  );
}

function DataRow<Row>({
  row,
  columns,
  href,
  label,
}: {
  row: Row;
  columns: Column<Row>[];
  href?: string;
  label?: string;
}) {
  const { visible, more } = splitMobileColumns(columns);
  return (
    <TableRow
      data-linked={href ? "" : undefined}
      className={cn(
        "relative focus-within:bg-muted/50 max-md:flex max-md:h-auto max-md:flex-col max-md:items-stretch max-md:py-2",
        href && "cursor-pointer",
      )}
    >
      {visible.map((column, index) => (
        <DataCell
          key={column.key}
          row={row}
          column={column}
          href={index === 0 ? href : undefined}
          label={label}
        />
      ))}
      {more.length > 0 ? (
        <TableCell className="p-0 md:hidden">
          <details className="relative z-10 px-2">
            <summary className="cursor-pointer py-1 eyebrow text-[11px] text-muted-foreground">
              More
            </summary>
            <div className="flex flex-col pb-2">
              {more.map((column) => (
                <div
                  key={column.key}
                  data-col={safeKey(column.key)}
                  className="flex items-baseline justify-between gap-3 py-1"
                >
                  <span className="eyebrow text-[11px] text-muted-foreground">
                    {column.header}
                  </span>
                  <CellValue row={row} column={column} />
                </div>
              ))}
            </div>
          </details>
        </TableCell>
      ) : null}
      {more.map((column) => (
        <DataCell key={column.key} row={row} column={column} className="max-md:hidden" />
      ))}
    </TableRow>
  );
}

function DataCell<Row>({
  row,
  column,
  href,
  label,
  className,
}: {
  row: Row;
  column: Column<Row>;
  href?: string;
  label?: string;
  className?: string;
}) {
  return (
    <TableCell
      data-label={column.header}
      data-col={safeKey(column.key)}
      style={column.width ? { width: column.width } : undefined}
      className={cn(
        "max-md:flex max-md:w-full max-md:items-baseline max-md:justify-between max-md:gap-3 max-md:whitespace-normal max-md:py-1",
        column.align === "right" && "text-right tabular-nums",
        className,
      )}
    >
      {href ? (
        <Link
          href={href}
          data-row-link
          aria-label={label ? `Open ${label}` : "Open"}
          className="absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        />
      ) : null}
      <span className="eyebrow text-[11px] text-muted-foreground md:hidden">
        {column.header}
      </span>
      <CellValue row={row} column={column} />
    </TableCell>
  );
}

function CellValue<Row>({ row, column }: { row: Row; column: Column<Row> }) {
  const node = column.cell(row);
  const width = column.truncate === true ? "20rem" : column.truncate || undefined;
  let content = node;
  if (width) {
    content =
      typeof node === "string" ? (
        <TruncatedText maxWidth={width}>{node}</TruncatedText>
      ) : (
        <span className="block truncate" style={{ maxWidth: width }}>
          {node}
        </span>
      );
  }
  return (
    <span
      className={cn(
        "relative z-10 min-w-0 pointer-events-none [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_select]:pointer-events-auto [&_textarea]:pointer-events-auto [&_[data-forward-click]]:pointer-events-auto",
        column.align === "right" && "tabular-nums",
      )}
    >
      {content}
    </span>
  );
}
