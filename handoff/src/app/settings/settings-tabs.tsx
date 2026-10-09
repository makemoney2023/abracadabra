"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { SETTINGS_TABS, settingsTab } from "./tabs";

export function SettingsTabs() {
  const path = usePathname() || "/settings/github";
  const current = settingsTab(path);
  return (
    <Tabs value={current}>
      <TabsList>
        {SETTINGS_TABS.map((tab) => (
          <TabsTrigger key={tab.href} value={tab.href} asChild>
            <Link href={tab.href}>{tab.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
