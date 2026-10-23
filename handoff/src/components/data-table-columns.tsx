"use client";

import * as React from "react";
import { Columns3Icon } from "lucide-react";

import { COLUMNS_KEY_PREFIX, parseHiddenColumns } from "@/components/data-table-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const EVENT = "hq:columns";

function read(tableId: string): string {
  try {
    return localStorage.getItem(COLUMNS_KEY_PREFIX + tableId) ?? "";
  } catch {
    return "";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Marks the table so a CSS rule can hide the columns. Mirrors the boot script. */
function mark(tableId: string, hidden: string[]) {
  const el = document.querySelector<HTMLElement>(`[data-dt-id="${CSS.escape(tableId)}"]`);
  if (!el) return;
  if (hidden.length > 0) el.setAttribute("data-hidden", hidden.join(" "));
  else el.removeAttribute("data-hidden");
}

/**
 * The Columns menu. The choice is kept in this browser (localStorage). The
 * table's own boot script reads it before first paint, so a hidden column
 * never flashes.
 */
export function DataTableColumns({
  tableId,
  columns,
}: {
  tableId: string;
  columns: { key: string; header: string }[];
}) {
  const raw = React.useSyncExternalStore(
    subscribe,
    () => read(tableId),
    () => "",
  );
  const keys = columns.map((column) => column.key);
  const hidden = parseHiddenColumns(raw, keys);
  const hiddenList = hidden.join(" ");

  // A soft navigation can build a fresh table element. Mark it again.
  React.useEffect(() => {
    mark(tableId, hiddenList ? hiddenList.split(" ") : []);
  }, [tableId, hiddenList]);

  function save(next: string[]) {
    try {
      if (next.length > 0) localStorage.setItem(COLUMNS_KEY_PREFIX + tableId, JSON.stringify(next));
      else localStorage.removeItem(COLUMNS_KEY_PREFIX + tableId);
    } catch {
      // Private browsing can reject storage writes.
    }
    mark(tableId, next);
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" aria-label="Show or hide columns">
          <Columns3Icon aria-hidden />
          Columns
          {hidden.length > 0 ? (
            <span className="tabular-nums text-muted-foreground">{keys.length - hidden.length}/{keys.length}</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            checked={!hidden.includes(column.key)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) =>
              save(checked ? hidden.filter((key) => key !== column.key) : [...hidden, column.key])
            }
          >
            {column.header}
          </DropdownMenuCheckboxItem>
        ))}
        {hidden.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => save([])}>Show all columns</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
