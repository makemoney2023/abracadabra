import type { OrgKind, StatusHealth } from "@/db/crm";

export type ClientOrg = {
  id: string;
  name: string;
  kind: OrgKind;
};

export type ClientWorkItem = {
  organizationId: string;
  status: string;
  title: string;
  dueAt?: number | null;
  owner?: string | null;
};

export type ClientPlan = {
  organizationId: string;
  health?: StatusHealth | null;
  owner?: string | null;
  nextStep?: string | null;
  lastActivity?: number | null;
};

export type ClientRow = {
  id: string;
  name: string;
  kind: OrgKind;
  health: StatusHealth | null;
  owner: string;
  openWork: number;
  nextStep: string;
  lastActivity: number | null;
};

function text(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/** Newest plan that has a usable string wins. A blank value is skipped. */
function newestText(plans: ClientPlan[], read: (plan: ClientPlan) => string | null | undefined): string {
  let best = "";
  let at = -1;
  for (const plan of plans) {
    const value = text(read(plan));
    if (!value) continue;
    const stamp = plan.lastActivity ?? -1;
    if (stamp >= at) {
      best = value;
      at = stamp;
    }
  }
  return best;
}

function newestHealth(plans: ClientPlan[]): StatusHealth | null {
  let best: StatusHealth | null = null;
  let at = -1;
  for (const plan of plans) {
    if (!plan.health) continue;
    const stamp = plan.lastActivity ?? -1;
    if (stamp >= at) {
      best = plan.health;
      at = stamp;
    }
  }
  return best;
}

function soonestOpen(items: ClientWorkItem[]): ClientWorkItem | undefined {
  return [...items].sort((a, b) => {
    if (a.dueAt == null && b.dueAt == null) return 0;
    if (a.dueAt == null) return 1;
    if (b.dueAt == null) return -1;
    return a.dueAt - b.dueAt;
  })[0];
}

/**
 * One row per organization. Open work ignores done tasks. Health, owner,
 * and next step come from the newest plan that has them. A missing next
 * step or owner falls back to the soonest open task. Rows start busiest
 * first. `q` matches the name, ignoring case.
 */
export function clientRows(
  orgs: ClientOrg[],
  work: ClientWorkItem[],
  plans: ClientPlan[],
  query?: { q?: string },
): ClientRow[] {
  const needle = query?.q?.trim().toLowerCase() ?? "";
  const chosen = needle.length === 0 ? orgs : orgs.filter((org) => org.name.toLowerCase().includes(needle));
  const rows = chosen.map((org) => {
    const open = work.filter((item) => item.organizationId === org.id && item.status !== "done");
    const mine = plans.filter((plan) => plan.organizationId === org.id);
    const next = soonestOpen(open);
    const stamps = mine.flatMap((plan) => (plan.lastActivity == null ? [] : [plan.lastActivity]));
    return {
      id: org.id,
      name: org.name,
      kind: org.kind,
      health: newestHealth(mine),
      owner: newestText(mine, (plan) => plan.owner) || text(next?.owner),
      openWork: open.length,
      nextStep: newestText(mine, (plan) => plan.nextStep) || text(next?.title),
      lastActivity: stamps.length === 0 ? null : Math.max(...stamps),
    };
  });
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.openWork - a.row.openWork || a.index - b.index)
    .map((item) => item.row);
}
