"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";

import { STUDIO_NAV } from "@/app/staff-links";
import { ACTION_EVENT, PALETTE_EVENT, useContextBar } from "@/components/context-bar";
import { paletteItems, pushRecent, type PaletteItem, type RecentItem } from "@/components/palette-items";

const RECENT_KEY = "hq:recent:v1";

let clientsRequest: Promise<{ id: string; name: string }[]> | null = null;

function readRecent(): RecentItem[] {
  try {
    const raw = sessionStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const label = "label" in entry ? entry.label : "";
      const href = "href" in entry ? entry.href : "";
      if (typeof label !== "string" || typeof href !== "string" || !label || !href) return [];
      return [{ label, href }];
    });
  } catch {
    return [];
  }
}

function writeRecent(list: RecentItem[]) {
  try {
    sessionStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Private browsing can reject storage writes.
  }
}

async function loadClients(): Promise<{ id: string; name: string }[]> {
  const response = await fetch("/api/hq/palette");
  if (!response.ok) return [];
  const body = (await response.json()) as { clients?: unknown };
  if (!Array.isArray(body.clients)) return [];
  return body.clients.flatMap((client) => {
    if (!client || typeof client !== "object") return [];
    const id = "id" in client ? client.id : "";
    const name = "name" in client ? client.name : "";
    if (typeof id !== "string" || typeof name !== "string" || !id || !name) return [];
    return [{ id, name }];
  });
}

function clientsOnce(): Promise<{ id: string; name: string }[]> {
  if (!clientsRequest) {
    clientsRequest = loadClients().catch(() => {
      clientsRequest = null;
      return [];
    });
  }
  return clientsRequest;
}

export function CommandPalette() {
  const router = useRouter();
  const { paletteActions } = useContextBar();
  const [open, setOpen] = React.useState(false);
  const [clients, setClients] = React.useState<{ id: string; name: string }[]>([]);
  const [recent, setRecent] = React.useState<RecentItem[]>([]);
  const openRef = React.useRef(false);

  React.useEffect(() => {
    openRef.current = open;
  }, [open]);

  function setPaletteOpen(next: boolean) {
    if (next) setRecent(readRecent());
    setOpen(next);
  }

  React.useEffect(() => {
    function onPalette() {
      setRecent(readRecent());
      setOpen(true);
    }
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const next = !openRef.current;
        if (next) setRecent(readRecent());
        setOpen(next);
      }
    }
    window.addEventListener(PALETTE_EVENT, onPalette);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(PALETTE_EVENT, onPalette);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    let cancel = false;
    clientsOnce().then((rows) => {
      if (!cancel) setClients(rows);
    });
    return () => {
      cancel = true;
    };
  }, [open]);

  const items = paletteItems({
    nav: STUDIO_NAV.map((item) => ({ label: item.label, href: item.href })),
    recent,
    clients,
    actions: paletteActions,
  });
  const groups = ["Go to", "Recent", "Clients", "Actions"] as const;

  function choose(item: PaletteItem) {
    setOpen(false);
    if (item.href) {
      if (item.group !== "Go to") writeRecent(pushRecent(readRecent(), { label: item.label, href: item.href }));
      router.push(item.href);
      return;
    }
    if (item.run) window.dispatchEvent(new CustomEvent(ACTION_EVENT, { detail: item.run }));
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setPaletteOpen}
      label="Command palette"
      overlayClassName="fixed inset-0 z-50 bg-black/10"
      contentClassName="fixed top-[20%] left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
    >
      <Command.Input
        placeholder="Jump to a page or client"
        className="h-11 w-full border-b border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing matches.</Command.Empty>
        {groups.map((group) => {
          const rows = items.filter((item) => item.group === group);
          if (rows.length === 0) return null;
          return (
            <Command.Group key={group} heading={group} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase">
              {rows.map((item) => (
                <Command.Item
                  key={`${item.group}:${item.href ?? item.run}`}
                  value={`${item.group} ${item.label}`}
                  onSelect={() => choose(item)}
                  className="cursor-pointer rounded-md px-2 py-1.5 text-sm data-[selected=true]:bg-muted"
                >
                  {item.label}
                </Command.Item>
              ))}
            </Command.Group>
          );
        })}
      </Command.List>
    </Command.Dialog>
  );
}
