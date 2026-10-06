"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
    <nav aria-label="Studio" className="flex flex-row flex-wrap gap-x-4 gap-y-2 text-sm md:flex-col md:gap-1">
      {LINKS.map((link) => {
        const active = navIsActive(path, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={active ? "font-medium" : "text-muted-foreground"}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
