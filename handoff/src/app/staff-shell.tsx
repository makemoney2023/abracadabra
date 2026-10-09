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
} from "@/components/ui/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { ContextBar, ContextBarProvider } from "@/components/context-bar";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { Toaster } from "@/components/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StaffNav } from "./staff-nav";

export function StaffShell({ children }: { children: ReactNode }) {
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
          <StaffNav />
        </SidebarContent>
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
