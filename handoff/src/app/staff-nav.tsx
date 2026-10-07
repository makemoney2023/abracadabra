"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { navIsActive } from "./staff-nav-match";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/leads", label: "Leads" },
  { href: "/clients", label: "Clients" },
  { href: "/work", label: "Work" },
  { href: "/spaces", label: "Spaces" },
  { href: "/settings/github", label: "Settings" },
] as const;

export function StaffNav() {
  const path = usePathname() || "/";
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu aria-label="Studio">
          {LINKS.map((link) => {
            const active = navIsActive(path, link.href);
            return (
              <SidebarMenuItem key={link.href}>
                <SidebarMenuButton asChild isActive={active}>
                  <Link href={link.href} aria-current={active ? "page" : undefined}>
                    {link.label}
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
