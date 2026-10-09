"use client";

import { signOut } from "@/app/sign-out-action";
import { DensityToggle } from "@/components/density-toggle";
import { openShortcutSheet } from "@/components/keyboard-shortcuts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";

export type HqPerson = {
  email: string;
  role: "Admin" | "Staff";
};

export function UserMenu({ person }: { person: HqPerson }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[11px]">
            {initials(person.email)}
          </span>
          <span className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-sm">{person.email}</span>
            <span className="block text-xs text-muted-foreground">{person.role}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DensityToggle />
        <DropdownMenuItem onSelect={() => openShortcutSheet()}>Shortcuts</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action={signOut}>
            <button type="submit" className="w-full text-left">
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
