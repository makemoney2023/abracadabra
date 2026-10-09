"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { ACTION_EVENT, useContextBar, type ContextAction } from "@/components/context-bar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const SHORTCUTS_EVENT = "hq:shortcuts";

export function openShortcutSheet() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SHORTCUTS_EVENT));
}

const GO: Record<string, string> = {
  t: "/",
  l: "/leads",
  c: "/clients",
  w: "/work",
  h: "/chat",
  s: "/swarm",
};

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "g then t", label: "Today" },
  { keys: "g then l", label: "Leads" },
  { keys: "g then c", label: "Clients" },
  { keys: "g then w", label: "Work" },
  { keys: "g then h", label: "Chat" },
  { keys: "g then s", label: "Swarm" },
  { keys: "/", label: "Search this page" },
  { keys: "?", label: "Shortcuts" },
  { keys: "n", label: "New" },
  { keys: "⌘K", label: "Command palette" },
];

function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const { paletteActions } = useContextBar();
  const actions = React.useRef<ContextAction[]>(paletteActions);
  const [help, setHelp] = React.useState(false);
  const chord = React.useRef(false);

  React.useEffect(() => {
    actions.current = paletteActions;
  }, [paletteActions]);

  React.useEffect(() => {
    let timer = 0;
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (typingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (chord.current) {
        chord.current = false;
        window.clearTimeout(timer);
        const href = GO[key];
        if (!href) return;
        event.preventDefault();
        router.push(href);
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setHelp(true);
        return;
      }
      if (key === "/") {
        event.preventDefault();
        document.querySelector<HTMLElement>("[data-hq-search]")?.focus();
        return;
      }
      if (key === "n") {
        const first = actions.current[0];
        if (!first) return;
        event.preventDefault();
        window.dispatchEvent(new CustomEvent(ACTION_EVENT, { detail: first.run }));
        return;
      }
      if (key === "g") {
        chord.current = true;
        timer = window.setTimeout(() => {
          chord.current = false;
        }, 1000);
      }
    }
    function onHelp() {
      setHelp(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(SHORTCUTS_EVENT, onHelp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(SHORTCUTS_EVENT, onHelp);
      window.clearTimeout(timer);
    };
  }, [router]);

  return (
    <Dialog open={help} onOpenChange={setHelp}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Shortcuts</DialogTitle>
          <DialogDescription>These keys work when you are not typing in a field.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.keys} className="flex items-center justify-between gap-4 text-sm">
              <span>{shortcut.label}</span>
              <kbd className="font-mono text-[11px] text-muted-foreground">{shortcut.keys}</kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
