"use client";

import * as React from "react";

import { DensityToggle } from "@/components/density-toggle";
import { DENSITY_EVENT, densityIsCompact } from "@/components/density";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function subscribe(onStoreChange: () => void) {
  window.addEventListener(DENSITY_EVENT, onStoreChange);
  return () => window.removeEventListener(DENSITY_EVENT, onStoreChange);
}

export function AppearancePanel() {
  const compact = React.useSyncExternalStore(subscribe, densityIsCompact, () => false);
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm text-muted-foreground">{compact ? "Rows are compact." : "Rows are comfortable."}</p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline">
            Row height
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DensityToggle />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
