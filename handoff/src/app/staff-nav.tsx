"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Building2,
  CalendarDays,
  FolderKanban,
  FolderInput,
  FolderOpen,
  Inbox,
  ListTodo,
  MessageSquare,
  Plug,
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
  "/agents": Bot,
  "/unfiled": FolderInput,
  "/spaces": FolderOpen,
  "/settings/github": Settings,
  "/mcp": Plug,
} as const;

export const NAV_ICON_HREFS = Object.keys(ICONS);

export function visibleNavGroups<G extends { label: string; items: readonly { href: string }[] }>(
  groups: readonly G[],
  hidden: readonly string[],
): G[] {
  if (hidden.length === 0) return [...groups];
  return groups.map((group) => ({ ...group, items: group.items.filter((item) => !hidden.includes(item.href)) }));
}

export type NavBadges = {
  needsYou: number;
  leads: number;
  work: number;
  unfiled: number;
  /** Links not shown, e.g. /swarm while AGENT_MODE is agents. */
  hidden?: readonly string[];
};

function badgeFor(href: string, counts: NavBadges): number {
  if (href === "/") return counts.needsYou;
  if (href === "/leads") return counts.leads;
  if (href === "/work") return counts.work;
  if (href === "/unfiled") return counts.unfiled;
  return 0;
}

export function StaffNav({ counts }: { counts: NavBadges }) {
  const path = usePathname() || "/";
  return (
    <>
      {visibleNavGroups(STUDIO_NAV_GROUPS, counts.hidden ?? []).map((group) => (
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
