"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

import { breadcrumbsFor } from "@/app/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";

export const PALETTE_EVENT = "hq:palette";
export const ACTION_EVENT = "hq:action";

export type ContextAction = { label: string; run: string };

type ContextBarValue = {
  labels: Record<string, string>;
  actionSlot: HTMLElement | null;
  paletteActions: ContextAction[];
  setLabel: (path: string, label: string) => void;
  setActionSlot: (slot: HTMLElement | null) => void;
  setPaletteActions: (actions: ContextAction[]) => void;
};

function sameActions(left: ContextAction[], right: ContextAction[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((action, index) => action.label === right[index]?.label && action.run === right[index]?.run);
}

const ContextBarContext = React.createContext<ContextBarValue | null>(null);

export function openCommandPalette() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PALETTE_EVENT));
}

export function ContextBarProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const [actionSlot, setActionSlot] = React.useState<HTMLElement | null>(null);
  const [paletteActions, setPaletteActionsState] = React.useState<ContextAction[]>([]);
  const setLabel = React.useCallback((path: string, label: string) => {
    setLabels((current) => (current[path] === label ? current : { ...current, [path]: label }));
  }, []);
  const setPaletteActions = React.useCallback((actions: ContextAction[]) => {
    setPaletteActionsState((current) => (sameActions(current, actions) ? current : actions));
  }, []);
  const value = React.useMemo(
    () => ({ labels, actionSlot, paletteActions, setLabel, setActionSlot, setPaletteActions }),
    [labels, actionSlot, paletteActions, setLabel, setActionSlot, setPaletteActions],
  );
  return <ContextBarContext.Provider value={value}>{children}</ContextBarContext.Provider>;
}

export function useContextBar(): ContextBarValue {
  const value = React.useContext(ContextBarContext);
  if (!value) throw new Error("useContextBar must be used inside ContextBarProvider");
  return value;
}

/** Registers the name of the current record so the breadcrumb can show it. */
export function SetContextLabel({ path, label }: { path: string; label: string }) {
  const { setLabel } = useContextBar();
  React.useEffect(() => {
    setLabel(path, label);
  }, [path, label, setLabel]);
  return null;
}

/** Registers palette actions for this page. `n` runs the first one. */
export function SetPaletteActions({ actions }: { actions: ContextAction[] }) {
  const { setPaletteActions } = useContextBar();
  const serialized = JSON.stringify(actions);
  React.useEffect(() => {
    setPaletteActions(JSON.parse(serialized) as ContextAction[]);
    return () => setPaletteActions([]);
  }, [serialized, setPaletteActions]);
  return null;
}

/** Portals page buttons into the right side of the context bar. */
export function SetContextActions({ children }: { children: React.ReactNode }) {
  const { actionSlot } = useContextBar();
  if (!actionSlot) return null;
  return createPortal(children, actionSlot);
}

export function ContextBar() {
  const pathname = usePathname() || "/";
  const { labels, setActionSlot } = useContextBar();
  const crumbs = breadcrumbsFor(pathname, labels);

  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
      <SidebarTrigger />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList>
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <React.Fragment key={`${crumb.href ?? crumb.label}-${index}`}>
                <BreadcrumbItem>
                  {last || !crumb.href ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {last ? null : <BreadcrumbSeparator />}
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <div ref={setActionSlot} className="flex shrink-0 items-center gap-2" />
      <Button type="button" variant="outline" size="sm" className="gap-1.5" aria-label="Open command palette" onClick={openCommandPalette}>
        <Search className="size-3.5" />
        <kbd className="font-mono text-[11px]">⌘K</kbd>
      </Button>
    </header>
  );
}
