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

type ContextBarValue = {
  labels: Record<string, string>;
  actionSlot: HTMLElement | null;
  setLabel: (path: string, label: string) => void;
  setActionSlot: (slot: HTMLElement | null) => void;
};

const ContextBarContext = React.createContext<ContextBarValue | null>(null);

export function openCommandPalette() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PALETTE_EVENT));
}

export function ContextBarProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const [actionSlot, setActionSlot] = React.useState<HTMLElement | null>(null);
  const setLabel = React.useCallback((path: string, label: string) => {
    setLabels((current) => (current[path] === label ? current : { ...current, [path]: label }));
  }, []);
  const value = React.useMemo(
    () => ({ labels, actionSlot, setLabel, setActionSlot }),
    [labels, actionSlot, setLabel, setActionSlot],
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
