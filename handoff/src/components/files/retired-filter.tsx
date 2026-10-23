"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** Query value that turns the filter on. Pages read it with `showRetired`. */
export const RETIRED_PARAM = "retired";

export function showRetired(value: string | string[] | undefined): boolean {
  return value === "1";
}

/** "Show retired (2)" or "Show retired", for the count line next to the switch. */
export function retiredLabel(count: number): string {
  return count > 0 ? `Show retired (${count})` : "Show retired";
}

/**
 * Retired files (superseded or withdrawn agent filings) are hidden from Files by default. Staff flip this to see them.
 * The switch only rewrites ?retired=1 and keeps every other query value, so it works on any Files list.
 */
export function RetiredFilter({ count, checked }: { count: number; checked: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const id = "files-show-retired";
  function change(next: boolean) {
    const params = new URLSearchParams(search?.toString() ?? "");
    if (next) params.set(RETIRED_PARAM, "1");
    else params.delete(RETIRED_PARAM);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <Switch id={id} checked={checked} onCheckedChange={change} aria-describedby={`${id}-help`} />
      <Label htmlFor={id}>{retiredLabel(count)}</Label>
      <span id={`${id}-help`} className="sr-only">
        Retired files were replaced or withdrawn. They are hidden by default.
      </span>
    </div>
  );
}
