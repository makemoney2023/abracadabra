import { cache } from "react";
import type { ReactNode } from "react";
import { navCounts } from "@/db/crm";
import { liveStaff, unfiledCount } from "@/lib/agent-admin";
import { legacyStartsAllowed } from "@/lib/agent-mode";
import { requireHqStaffPage } from "@/lib/current";
import { StaffChrome } from "./staff-chrome";

const loadShell = cache(async () => {
  const { sql, caller } = await requireHqStaffPage();
  const now = new Date();
  const base = await navCounts(sql, caller, now);
  const counts = {
    ...base,
    unfiled: (await liveStaff(sql, caller)).ok ? await unfiledCount(sql, now.getTime()) : 0,
    // AGENT_MODE=agents: the old swarm canvas is not offered; /swarm shows a notice instead.
    hidden: legacyStartsAllowed() ? [] : ["/swarm"],
  };
  const row = await sql.get<{ email: string; is_super_admin: number }>(
    "SELECT email, is_super_admin FROM staff WHERE user_id = ? AND revoked_at IS NULL",
    [caller.userId],
  );
  return {
    counts,
    person: {
      email: row?.email ?? "",
      role: row?.is_super_admin === 1 ? ("Admin" as const) : ("Staff" as const),
    },
  };
});

export async function StaffShell({ children }: { children: ReactNode }) {
  const { counts, person } = await loadShell();
  return (
    <StaffChrome counts={counts} person={person}>
      {children}
    </StaffChrome>
  );
}
