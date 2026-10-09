"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SPACES_TABS, spacesTab } from "./tabs";

export function SpacesTabs() {
  const path = usePathname() || "/spaces";
  const current = spacesTab(path);
  return (
    <Tabs value={current}>
      <TabsList>
        {SPACES_TABS.map((tab) => (
          <TabsTrigger key={tab.href} value={tab.href} asChild>
            <Link href={tab.href}>{tab.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
