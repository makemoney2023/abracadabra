export type PaletteGroup = "Go to" | "Recent" | "Clients" | "Actions";

export type PaletteItem = {
  group: PaletteGroup;
  label: string;
  href?: string;
  run?: string;
};

export type RecentItem = { label: string; href: string };

const GROUPS: PaletteGroup[] = ["Go to", "Recent", "Clients", "Actions"];
const RECENT_LIMIT = 8;

/** Dedupes by href, moves the latest visit to the front, and keeps eight. */
export function pushRecent(list: RecentItem[], item: RecentItem): RecentItem[] {
  return [item, ...list.filter((entry) => entry.href !== item.href)].slice(0, RECENT_LIMIT);
}

/** Palette rows in group order. Empty groups are left out. */
export function paletteItems(input: {
  nav: readonly { label: string; href: string }[];
  recent: RecentItem[];
  clients: { id: string; name: string }[];
  actions: { label: string; run: string }[];
}): PaletteItem[] {
  const grouped: Record<PaletteGroup, PaletteItem[]> = {
    "Go to": input.nav.map((item) => ({ group: "Go to", label: item.label, href: item.href })),
    Recent: input.recent.map((item) => ({ group: "Recent", label: item.label, href: item.href })),
    Clients: input.clients.map((client) => ({
      group: "Clients",
      label: client.name,
      href: `/clients/${client.id}`,
    })),
    Actions: input.actions.map((action) => ({ group: "Actions", label: action.label, run: action.run })),
  };
  return GROUPS.flatMap((group) => grouped[group]);
}
