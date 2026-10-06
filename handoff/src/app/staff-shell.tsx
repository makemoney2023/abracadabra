import type { ReactNode } from "react";
import { StaffNav } from "./staff-nav";

export function StaffShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-4 border-b border-border px-6 py-6 md:w-52 md:border-r md:border-b-0">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <StaffNav />
      </aside>
      {children}
    </div>
  );
}
