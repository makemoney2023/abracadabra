import type { DealStage, StatusHealth, TodayBoard, WorkTask } from "@/db/crm";
import { DEAL_STAGES } from "@/db/crm";
import { workHref } from "@/app/work/query";
import type { StatusTone } from "@/lib/status-token";

const WEEK = 7 * 24 * 60 * 60 * 1000;

export type TodayFeed = "all" | "clients" | "leads" | "agent";

export type TodayItem = {
  id: string;
  title: string;
  href?: string;
  at?: number;
  client?: string;
  body?: string;
  tone: StatusTone;
  source: "task" | "client" | "lead" | "agent";
  /** Work request that still needs an approve or decline. */
  request?: boolean;
  /** Swarm or schema run, not an agent note. */
  run?: boolean;
};

export type TodayMetric = {
  label: string;
  value: number;
  tone: StatusTone;
  href: string;
};

const FEEDS = new Set<TodayFeed>(["all", "clients", "leads", "agent"]);

function openTasks(board: TodayBoard): WorkTask[] {
  return board.tasks.filter((task) => task.status !== "done");
}

function isLate(task: WorkTask, now: number): boolean {
  return task.due_at !== null && task.due_at < now;
}

function taskHref(task: WorkTask): string {
  if (task.project_id) return `/projects/${task.project_id}`;
  return `/clients/${task.organization_id}?tab=work`;
}

function taskItem(task: WorkTask, tone: "late" | "blocked"): TodayItem {
  return {
    id: task.id,
    title: task.title,
    href: taskHref(task),
    at: task.due_at ?? undefined,
    client: task.organization_name,
    tone,
    source: "task",
  };
}

function agentTitle(kind: string, status: string): string {
  if (kind === "agent.wake_failed") return "Agent did not wake";
  if (kind === "schema.scan") {
    if (status === "queued") return "Schema scan queued";
    if (status === "not_started") return "Schema scan did not start";
    return status ? `Schema scan ${status}` : "Schema scan";
  }
  return status ? `Swarm ${status}` : "Swarm run";
}

function agentBody(title: string, body: string | null): string | undefined {
  if (!body || body === title) return undefined;
  if (body.startsWith(`${title}.`) || body.startsWith(`${title} `)) {
    const rest = body.slice(title.length).replace(/^[\s.:]+/, "");
    return rest || undefined;
  }
  return body;
}

export function todayMetrics(board: TodayBoard, now: number, activeClients = 0): TodayMetric[] {
  const tasks = openTasks(board);
  const late = tasks.filter((task) => isLate(task, now));
  const blocked = tasks.filter((task) => task.status === "blocked");
  const blockedOpen = blocked.filter((task) => !isLate(task, now));
  const dueWeek = tasks.filter(
    (task) => task.due_at !== null && task.due_at >= now && task.due_at <= now + WEEK,
  );
  return [
    {
      label: "Needs you",
      value: late.length + blockedOpen.length + board.workRequests.length,
      tone: "late",
      href: "/work",
    },
    { label: "Late", value: late.length, tone: "late", href: workHref({ late: true }) },
    { label: "Blocked", value: blocked.length, tone: "blocked", href: workHref({ blocked: true }) },
    { label: "Due this week", value: dueWeek.length, tone: "waiting", href: workHref({ week: true }) },
    { label: "Active clients", value: activeClients, tone: "active", href: "/clients" },
  ];
}

export function needsYou(board: TodayBoard, max = 8, now = Date.now()): TodayItem[] {
  const tasks = openTasks(board);
  const late = tasks
    .filter((task) => isLate(task, now))
    .sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0));
  const blocked = tasks.filter((task) => task.status === "blocked" && !isLate(task, now));
  const rows: TodayItem[] = [
    ...late.map((task) => taskItem(task, "late")),
    ...blocked.map((task) => taskItem(task, "blocked")),
    ...board.workRequests.map((request) => ({
      id: request.id,
      title: request.body,
      href: `/clients/${request.organizationId}`,
      client: request.organizationName,
      tone: "waiting" as const,
      source: "client" as const,
      request: true,
    })),
  ];
  return rows.slice(0, Math.max(0, max));
}

export function activityItems(board: TodayBoard): TodayItem[] {
  const items: TodayItem[] = [];
  for (const row of board.agentActivity) {
    const title = agentTitle(row.kind, row.status);
    items.push({
      id: row.id,
      title,
      body: agentBody(title, row.body),
      at: row.createdAt,
      client: row.organizationName || undefined,
      href: row.organizationId ? `/clients/${row.organizationId}` : undefined,
      tone: "active",
      source: "agent",
      run: true,
    });
  }
  for (const note of board.agentNotes) {
    items.push({
      id: `note:${note.id}`,
      title: note.body?.trim() || "Agent note",
      at: note.createdAt,
      client: note.organizationName || undefined,
      href: note.organizationId ? `/clients/${note.organizationId}` : undefined,
      tone: "neutral",
      source: "agent",
    });
  }
  for (const lead of board.newLeads) {
    items.push({
      id: lead.id,
      title: lead.title,
      client: lead.organizationName,
      href: `/clients/${lead.organizationId}`,
      tone: "waiting",
      source: "lead",
    });
  }
  const leadIds = new Set(board.newLeads.map((lead) => lead.id));
  for (const deal of board.stalledDeals) {
    if (leadIds.has(deal.id)) continue;
    items.push({
      id: `deal:${deal.id}`,
      title: deal.title,
      client: deal.organizationName,
      href: "/leads",
      body: deal.nextStep ?? undefined,
      at: deal.nextStepAt ?? undefined,
      tone: "waiting",
      source: "lead",
    });
  }
  for (const call of board.calls) {
    items.push({
      id: `call:${call.id}`,
      title: "Call",
      client: call.organizationName,
      href: `/clients/${call.organizationId}`,
      at: call.startsAt,
      tone: "active",
      source: "client",
    });
  }
  for (const space of board.waitingSpaces) {
    items.push({
      id: `${space.id}:${space.requestTitle}`,
      title: space.requestTitle,
      client: space.displayName,
      href: `/w/${space.slug}`,
      tone: "waiting",
      source: "client",
    });
  }
  for (const invoice of board.invoices) {
    items.push({
      id: `invoice:${invoice.id}`,
      title: invoice.number,
      client: invoice.organizationName,
      at: invoice.dueAt,
      tone: "waiting",
      source: "client",
    });
  }
  return items.sort((a, b) => (b.at ?? -1) - (a.at ?? -1));
}

export function timelineFilter(items: TodayItem[], filter: TodayFeed): TodayItem[] {
  if (filter === "all") return items;
  if (filter === "agent") return items.filter((item) => item.source === "agent");
  if (filter === "leads") return items.filter((item) => item.source === "lead");
  return items.filter((item) => item.source === "client" || item.source === "task");
}

export function todayFeed(value: string | string[] | undefined): TodayFeed {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && FEEDS.has(raw as TodayFeed)) return raw as TodayFeed;
  return "all";
}

export function greeting(now: Date, name?: string): string {
  const hour = now.getUTCHours();
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = name?.trim().split(/\s+/).filter(Boolean)[0];
  return first ? `${part}, ${first}` : part;
}

/** First name from a staff email, for the Today greeting. */
export function greetingName(email: string | null | undefined): string | undefined {
  const local = (email ?? "").split("@")[0] ?? "";
  const token = local.split(/[^A-Za-z]+/).find((part) => part.length > 0);
  if (!token) return undefined;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

const KICKER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function todayKicker(now: Date): string {
  return KICKER.format(now);
}

export function pipelineCounts(deals: { stage: string }[]): { stage: DealStage; count: number }[] {
  const counts = new Map<string, number>();
  for (const deal of deals) counts.set(deal.stage, (counts.get(deal.stage) ?? 0) + 1);
  return DEAL_STAGES.map((stage) => ({ stage, count: counts.get(stage) ?? 0 }));
}

const HEALTHY = new Set<string>(["on_track", "done"]);

export function clientsAtRisk<T extends { health: string }>(rows: T[]): T[] {
  return rows.filter((row) => !HEALTHY.has(row.health));
}

export type ClientHealth = { id: string; name: string; health: StatusHealth };
