"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CalendarDays, FolderOpen, Inbox, ListTodo, MessageSquare, Radar, Settings, Workflow } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { navIsActive } from "./staff-nav-match";
import { STUDIO_NAV } from "./staff-links";

const ICONS = {
  "/": CalendarDays,
  "/leads": Inbox,
  "/schema": Radar,
  "/clients": Building2,
  "/work": ListTodo,
  "/chat": MessageSquare,
  "/swarm": Workflow,
  "/spaces": FolderOpen,
  "/settings/github": Settings,
} as const;

export function StaffNav() {
  const path = usePathname() || "/";
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Studio</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu aria-label="Studio">
          {STUDIO_NAV.map((link) => {
            const active = navIsActive(path, link.href);
            const Icon = ICONS[link.href];
            return (
              <SidebarMenuItem key={link.href}>
                <SidebarMenuButton asChild isActive={active} tooltip={link.label}>
                  <Link href={link.href} aria-current={active ? "page" : undefined}>
                    <Icon />
                    <span>{link.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
