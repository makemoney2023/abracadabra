"use client";

import * as React from "react";
import { Rows3Icon, Rows4Icon } from "lucide-react";

import { DENSITY_EVENT, applyDensity, densityIsCompact } from "@/components/density";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

function subscribe(onStoreChange: () => void) {
  window.addEventListener(DENSITY_EVENT, onStoreChange);
  return () => window.removeEventListener(DENSITY_EVENT, onStoreChange);
}

/** Comfortable or compact rows. Same switch as the user menu. */
export function DataTableDensity() {
  const compact = React.useSyncExternalStore(subscribe, densityIsCompact, () => false);
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={compact ? "compact" : "comfortable"}
      onValueChange={(value) => {
        if (value) applyDensity(value === "compact");
      }}
      aria-label="Row density"
    >
      <ToggleGroupItem value="comfortable" aria-label="Comfortable rows" title="Comfortable rows">
        <Rows3Icon aria-hidden />
      </ToggleGroupItem>
      <ToggleGroupItem value="compact" aria-label="Compact rows" title="Compact rows">
        <Rows4Icon aria-hidden />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
