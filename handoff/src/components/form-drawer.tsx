"use client";

import * as React from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type DrawerReport = { ok: boolean };

const FormDrawerContext = React.createContext<{ report: (result: DrawerReport) => void } | null>(null);

/** Null outside a drawer. Action forms call `report` so a success closes the sheet. */
export function useFormDrawer() {
  return React.useContext(FormDrawerContext);
}

/**
 * Right-hand sheet for create and edit forms. Stays open on
 * `{ ok: false }` and closes when a child reports `{ ok: true }`.
 */
export function FormDrawer({
  trigger,
  title,
  description,
  children,
}: {
  trigger: React.ReactElement;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const report = React.useCallback((result: DrawerReport) => {
    if (result.ok) setOpen(false);
  }, []);
  const value = React.useMemo(() => ({ report }), [report]);

  return (
    <FormDrawerContext.Provider value={value}>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent className="w-full data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="pr-8 font-heading">{title}</SheetTitle>
            {description ? <SheetDescription>{description}</SheetDescription> : null}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        </SheetContent>
      </Sheet>
    </FormDrawerContext.Provider>
  );
}
