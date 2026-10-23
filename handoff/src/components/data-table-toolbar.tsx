import * as React from "react";
import Link from "next/link";
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";

import { DataTableColumns } from "@/components/data-table-columns";
import { DataTableDensity } from "@/components/data-table-density";
import { buildHref, hiddenFields, pathOf, type FilterOption } from "@/components/data-table-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ToolbarFilter = {
  key: string;
  label: string;
  value: string;
  options: FilterOption[];
};

/**
 * The strip above a table: search, filter menus, a clear link, then the
 * Columns menu and the density switch. Search is a plain GET form and every
 * filter option is a link, so it all works as server-rendered URL state.
 */
export function DataTableToolbar({
  basePath,
  params,
  searchParam,
  searchLabel,
  showSearch,
  q,
  filters,
  columns,
  tableId,
  density,
  extra,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  searchParam: string;
  searchLabel: string;
  showSearch: boolean;
  q: string;
  filters: ToolbarFilter[];
  /** Set to show the Columns menu. */
  columns?: { key: string; header: string }[];
  tableId?: string;
  density: boolean;
  extra?: React.ReactNode;
}) {
  const active = filters.filter((filter) => filter.value);
  const clearPatch: Record<string, null> = { [searchParam]: null };
  for (const filter of filters) clearPatch[filter.key] = null;
  const dirty = Boolean(q) || active.length > 0;

  return (
    <div data-slot="data-table-toolbar" className="flex flex-wrap items-center gap-2">
      {showSearch ? (
        <form
          action={pathOf(basePath) || "/"}
          role="search"
          className="relative flex min-w-48 flex-1 items-center sm:max-w-xs"
        >
          {hiddenFields(basePath, params, [searchParam, "page"]).map((field) => (
            <input key={field.name} type="hidden" name={field.name} value={field.value} />
          ))}
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
          />
          <Input
            name={searchParam}
            defaultValue={q}
            placeholder={searchLabel}
            aria-label={searchLabel}
            data-hq-search
            className={cn("h-8 pl-8", q && "pr-8")}
          />
          {q ? (
            <Link
              href={buildHref(basePath, params, { [searchParam]: null })}
              aria-label="Clear search"
              className="absolute right-1.5 inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            >
              <XIcon className="size-3.5" aria-hidden />
            </Link>
          ) : null}
          <button type="submit" className="sr-only">
            Search
          </button>
        </form>
      ) : null}
      {filters.map((filter) => {
        const current = filter.options.find((option) => option.value === filter.value);
        return (
          <DropdownMenu key={filter.key}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Filter by ${filter.label.toLowerCase()}`}
                className={cn("gap-1.5", filter.value && "border-primary/60 text-foreground")}
              >
                {filter.label}
                {filter.value ? (
                  <span className="max-w-32 truncate font-normal text-primary">{current?.label ?? filter.value}</span>
                ) : null}
                <ChevronDownIcon aria-hidden className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 min-w-44 overflow-y-auto">
              <DropdownMenuItem asChild>
                <Link href={buildHref(basePath, params, { [filter.key]: null })}>
                  <span className="flex-1">All</span>
                  {!filter.value ? <CheckIcon aria-hidden /> : null}
                </Link>
              </DropdownMenuItem>
              {filter.options.map((option) => (
                <DropdownMenuItem key={option.value} asChild>
                  <Link href={buildHref(basePath, params, { [filter.key]: option.value })}>
                    <span className="flex-1 truncate">{option.label}</span>
                    {option.count !== undefined ? (
                      <span className="text-xs tabular-nums text-muted-foreground">{option.count}</span>
                    ) : null}
                    {option.value === filter.value ? <CheckIcon aria-hidden /> : null}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
      {dirty && filters.length > 0 ? (
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href={buildHref(basePath, params, clearPatch)}>
            Reset
            <XIcon aria-hidden />
          </Link>
        </Button>
      ) : null}
      {extra}
      <div className="ml-auto flex items-center gap-2">
        {columns && tableId ? <DataTableColumns tableId={tableId} columns={columns} /> : null}
        {density ? <DataTableDensity /> : null}
      </div>
    </div>
  );
}
