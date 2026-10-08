"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CHECK_NAV, checkNavIsActive } from "@/lib/check-nav";

export function CheckMenu({ fontClass }: { fontClass: string }) {
  const path = usePathname() || "";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="studio-cta" aria-label="Open menu">
        Menu
      </SheetTrigger>
      <SheetContent
        side="left"
        className={`check-studio check-drawer ${fontClass} gap-8 border-[var(--sc-hairline)] bg-[var(--sc-canvas)] p-6 text-[var(--sc-ink)]`}
      >
        <SheetHeader className="p-0">
          <p className="studio-kicker">Abracadabra</p>
          <SheetTitle className="font-heading text-3xl text-[var(--sc-ink)]">Menu</SheetTitle>
        </SheetHeader>
        <nav aria-label="Check" className="flex flex-col gap-2">
          {CHECK_NAV.map((item) => {
            const active = checkNavIsActive(path, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="studio-cta justify-start no-underline"
                style={active ? { borderColor: "var(--sc-accent)", color: "var(--sc-accent)" } : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  setOpen(false);
                  router.push(item.href);
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
