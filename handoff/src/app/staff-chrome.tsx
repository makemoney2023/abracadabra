"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { ContextBar, ContextBarProvider } from "@/components/context-bar";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { Toaster } from "@/components/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserMenu, type HqPerson } from "@/components/user-menu";
import { StaffNav, type NavBadges } from "./staff-nav";

export function StaffChrome({
  children,
  counts,
  person,
}: {
  children: ReactNode;
  counts: NavBadges;
  person: HqPerson;
}) {
  return (
    <TooltipProvider>
    <SidebarProvider>
      <ContextBarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <Link href="/" className="flex items-baseline gap-1.5 px-2">
            <span className="font-mono text-xs tracking-wide text-optic">Handoff</span>
            <span className="font-mono text-xs tracking-wide text-muted-foreground">HQ</span>
          </Link>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <StaffNav counts={counts} />
        </SidebarContent>
        <SidebarFooter>
          <UserMenu person={person} />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <ContextBar />
        {children}
      </SidebarInset>
      <Toaster />
      <CommandPalette />
      <KeyboardShortcuts />
      </ContextBarProvider>
    </SidebarProvider>
    </TooltipProvider>
  );
}
