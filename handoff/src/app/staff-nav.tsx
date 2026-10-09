"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  FolderKanban,
  FolderOpen,
  Inbox,
  ListTodo,
  MessageSquare,
  Radar,
  Settings,
  Workflow,
} from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { navIsActive } from "./staff-nav-match";
import { STUDIO_NAV_GROUPS } from "./staff-links";

export const ICONS = {
  "/": CalendarDays,
  "/leads": Inbox,
  "/schema": Radar,
  "/clients": Building2,
  "/work": ListTodo,
  "/projects": FolderKanban,
  "/chat": MessageSquare,
  "/swarm": Workflow,
  "/spaces": FolderOpen,
  "/settings/github": Settings,
} as const;

export const NAV_ICON_HREFS = Object.keys(ICONS);

export type NavBadges = {
  needsYou: number;
  leads: number;
  work: number;
};

function badgeFor(href: string, counts: NavBadges): number {
  if (href === "/") return counts.needsYou;
  if (href === "/leads") return counts.leads;
  if (href === "/work") return counts.work;
  return 0;
}

export function StaffNav({ counts }: { counts: NavBadges }) {
  const path = usePathname() || "/";
  return (
    <>
      {STUDIO_NAV_GROUPS.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel className="font-mono text-[11px] tracking-wide uppercase">
            {group.label}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu aria-label={group.label}>
              {group.items.map((link) => {
                const active = navIsActive(path, link.href);
                const Icon = ICONS[link.href];
                const badge = badgeFor(link.href, counts);
                return (
                  <SidebarMenuItem key={link.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={link.label}>
                      <Link href={link.href} aria-current={active ? "page" : undefined}>
                        <Icon />
                        <span>{link.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {badge > 0 ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
