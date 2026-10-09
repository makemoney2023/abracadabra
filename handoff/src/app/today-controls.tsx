"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { openCommandPalette } from "@/components/context-bar";
import type { TodayFeed } from "./today-view";

const FEEDS: { value: TodayFeed; label: string }[] = [
  { value: "all", label: "All" },
  { value: "clients", label: "Clients" },
  { value: "leads", label: "Leads" },
  { value: "agent", label: "Agent" },
];

export function TodayFeedToggle({ value }: { value: TodayFeed }) {
  const router = useRouter();
  return (
    <ToggleGroup
      type="single"
      value={value}
      aria-label="Activity"
      onValueChange={(next) => {
        if (next !== "all" && next !== "clients" && next !== "leads" && next !== "agent") return;
        const params = new URLSearchParams(window.location.search);
        if (next === "all") params.delete("feed");
        else params.set("feed", next);
        const query = params.toString();
        router.push(query ? `/?${query}` : "/");
      }}
    >
      {FEEDS.map((feed) => (
        <ToggleGroupItem key={feed.value} value={feed.value}>
          {feed.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function OpenPaletteButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={openCommandPalette} aria-label="Open command palette">
      ⌘K
    </Button>
  );
}
