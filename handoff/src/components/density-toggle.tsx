"use client";

import * as React from "react";

import { DENSITY_EVENT, applyDensity, densityIsCompact } from "@/components/density";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

function subscribe(onStoreChange: () => void) {
  window.addEventListener(DENSITY_EVENT, onStoreChange);
  return () => window.removeEventListener(DENSITY_EVENT, onStoreChange);
}

export function DensityToggle() {
  const compact = React.useSyncExternalStore(subscribe, densityIsCompact, () => false);

  return (
    <DropdownMenuItem
      onSelect={(event) => {
        event.preventDefault();
        applyDensity(!compact);
      }}
    >
      {compact ? "Comfortable rows" : "Compact rows"}
    </DropdownMenuItem>
  );
}
