"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CalendarDays, FolderOpen, Inbox, ListTodo, MessageSquare, Settings } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { navIsActive } from "./staff-nav-match";

const LINKS = [
  { href: "/", label: "Today", icon: CalendarDays },
  { href: "/leads", label: "Leads", icon: Inbox },
  { href: "/clients", label: "Clients", icon: Building2 },
  { href: "/work", label: "Work", icon: ListTodo },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/spaces", label: "Spaces", icon: FolderOpen },
  { href: "/settings/github", label: "Settings", icon: Settings },
] as const;

export function StaffNav() {
  const path = usePathname() || "/";
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Studio</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu aria-label="Studio">
          {LINKS.map((link) => {
            const active = navIsActive(path, link.href);
            const Icon = link.icon;
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
