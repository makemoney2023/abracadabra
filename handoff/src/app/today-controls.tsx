"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { openCommandPalette } from "@/components/context-bar";
import { FEED_FILTERS, type ClientChoice, type FeedFilter } from "./today-feed";

function pushParams(router: ReturnType<typeof useRouter>, change: (params: URLSearchParams) => void) {
  const params = new URLSearchParams(window.location.search);
  params.delete("feed");
  params.delete("limit");
  change(params);
  const query = params.toString();
  router.push(query ? `/?${query}` : "/", { scroll: false });
}

/** Type chips and a client picker (a holding group includes its companies). */
export function TodayFeedFilters({
  type,
  client,
  choices,
}: {
  type: FeedFilter;
  client: string | null;
  choices: ClientChoice[];
}) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Client"
        className="h-8 rounded-md border border-border bg-background px-2 text-sm"
        value={client ?? ""}
        onChange={(event) => {
          const next = event.target.value;
          pushParams(router, (params) => {
            if (next) params.set("client", next);
            else params.delete("client");
          });
        }}
      >
        <option value="">All clients</option>
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.depth === 1 ? `\u00a0\u00a0\u2014 ${choice.label}` : choice.label}
          </option>
        ))}
      </select>
      <ToggleGroup
        type="single"
        value={type}
        aria-label="Activity type"
        onValueChange={(next) => {
          if (!FEED_FILTERS.some((item) => item.value === next)) return;
          pushParams(router, (params) => {
            if (next === "all") params.delete("type");
            else params.set("type", next);
          });
        }}
      >
        {FEED_FILTERS.map((feed) => (
          <ToggleGroupItem key={feed.value} value={feed.value}>
            {feed.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export function OpenPaletteButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={openCommandPalette} aria-label="Open command palette">
      ⌘K
    </Button>
  );
}
