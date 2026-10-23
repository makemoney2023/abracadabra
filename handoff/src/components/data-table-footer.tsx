import * as React from "react";
import Link from "next/link";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

import {
  PAGE_SIZES,
  buildHref,
  pageSizeChoices,
  pageWindow,
  rangeLabel,
  type Paged,
} from "@/components/data-table-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

/**
 * Under a table: the row range, a rows-per-page menu, and page links. Every
 * control is a link that keeps the table's other params.
 */
export function DataTableFooter({
  basePath,
  params,
  paged,
  defaultSize,
  paginate,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  paged: Paged<unknown>;
  defaultSize: number;
  /** False shows the row count only. */
  paginate: boolean;
}) {
  const href = (patch: Record<string, string | null>) => buildHref(basePath, params, patch);
  const pageHref = (page: number) => href({ page: page > 1 ? String(page) : null });

  return (
    <div
      data-slot="data-table-footer"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-muted-foreground"
    >
      <p aria-live="polite" className="tabular-nums">
        {rangeLabel(paged.from, paged.to, paged.total)}
      </p>
      {paginate ? (
        <div className="flex flex-wrap items-center gap-3">
          {paged.total > PAGE_SIZES[0] || paged.size !== defaultSize ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="gap-1.5" aria-label="Rows per page">
                <span className="font-normal text-muted-foreground">Rows</span>
                <span className="tabular-nums">{paged.size}</span>
                <ChevronDownIcon aria-hidden className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-28">
              {pageSizeChoices(defaultSize).map((size) => (
                <DropdownMenuItem key={size} asChild>
                  <Link href={href({ size: size === defaultSize ? null : String(size) })}>
                    <span className="flex-1 tabular-nums">{size} per page</span>
                    {size === paged.size ? <CheckIcon aria-hidden /> : null}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          ) : null}
          {paged.pages > 1 ? (
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href={pageHref(paged.page - 1)}
                    aria-disabled={paged.page <= 1}
                    tabIndex={paged.page <= 1 ? -1 : undefined}
                    className={cn(paged.page <= 1 && "pointer-events-none opacity-50")}
                  />
                </PaginationItem>
                <PaginationItem className="px-2 tabular-nums sm:hidden">
                  {paged.page} / {paged.pages}
                </PaginationItem>
                {pageWindow(paged.page, paged.pages).map((item, index) => (
                  <PaginationItem key={item === "gap" ? `gap-${index}` : item} className="max-sm:hidden">
                    {item === "gap" ? (
                      <PaginationEllipsis />
                    ) : (
                      <PaginationLink
                        href={pageHref(item)}
                        isActive={item === paged.page}
                        aria-label={`Page ${item}`}
                        className="size-8 tabular-nums"
                      >
                        {item}
                      </PaginationLink>
                    )}
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    href={pageHref(paged.page + 1)}
                    aria-disabled={paged.page >= paged.pages}
                    tabIndex={paged.page >= paged.pages ? -1 : undefined}
                    className={cn(paged.page >= paged.pages && "pointer-events-none opacity-50")}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
