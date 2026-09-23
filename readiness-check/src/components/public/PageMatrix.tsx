"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type PageMatrixRow = {
  url: string;
  pageType: string;
  fetchStatus: string;
  hasJsonLd: boolean;
  schemaTypes: string[];
};

export type PageMatrixProps = {
  pages: PageMatrixRow[];
};

export function PageMatrix({ pages }: PageMatrixProps) {
  return (
    <section className="space-y-3 animate-in fade-in duration-500">
      <h3 className="font-heading text-2xl tracking-tight">Page matrix</h3>
      <p className="text-sm text-muted-foreground">
        Priority pages checked for fetch status and JSON-LD coverage.
      </p>
      {pages.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pages recorded for this scan.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Fetch</TableHead>
              <TableHead>Schema</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.map((page) => (
              <TableRow key={page.url}>
                <TableCell className="max-w-[220px] truncate font-mono text-xs sm:max-w-md">
                  {page.url}
                </TableCell>
                <TableCell className="capitalize">{page.pageType}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-md capitalize">
                    {page.fetchStatus}
                  </Badge>
                </TableCell>
                <TableCell>
                  {page.hasJsonLd ? (
                    <span className="text-xs">
                      {page.schemaTypes.length > 0
                        ? page.schemaTypes.slice(0, 3).join(", ")
                        : "JSON-LD"}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
