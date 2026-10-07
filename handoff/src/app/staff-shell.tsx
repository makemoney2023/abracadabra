"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StaffNav } from "./staff-nav";

export function StaffShell({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <Link href="/" className="px-2 font-mono text-xs tracking-wide text-optic">
            Handoff
          </Link>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <StaffNav />
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
          <SidebarTrigger />
          <span className="font-mono text-xs tracking-wide text-optic">Handoff</span>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
    </TooltipProvider>
  );
}
