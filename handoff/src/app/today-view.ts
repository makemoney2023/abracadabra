import type { DealStage, StatusHealth, TodayBoard, WorkTask } from "@/db/crm";
import { DEAL_STAGES } from "@/db/crm";
import { workHref } from "@/app/work/query";
import type { StatusTone } from "@/lib/status-token";
import { eventNeeds, reviewNeeds, TODAY_ZONE, torontoHour, wakeNeeds, type NeedsAlert } from "./today-feed";

const WEEK = 7 * 24 * 60 * 60 * 1000;

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
  /** Why an alert is here (wake failures, failed deploy, inquiry, message, stale review). */
  reason?: NeedsAlert["reason"] | "request_overdue" | "next_step";
};

export type TodayMetric = {
  label: string;
  value: number;
  tone: StatusTone;
  href: string;
};

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
      value: late.length + blockedOpen.length + board.workRequests.length + alertItems(board, now).length + laterItems(board).length,
      tone: "late",
      href: "/work",
    },
    { label: "Late", value: late.length, tone: "late", href: workHref({ late: true }) },
    { label: "Blocked", value: blocked.length, tone: "blocked", href: workHref({ blocked: true }) },
    { label: "Due this week", value: dueWeek.length, tone: "waiting", href: workHref({ week: true }) },
    { label: "Active clients", value: activeClients, tone: "active", href: "/clients" },
  ];
}

function alertItem(alert: NeedsAlert): TodayItem {
  return {
    id: alert.id,
    title: alert.title,
    body: alert.body,
    href: alert.href,
    at: alert.at,
    client: alert.client,
    tone: alert.tone === "late" ? "late" : "waiting",
    source: alert.reason === "wake" || alert.reason === "review" ? "agent" : "client",
    reason: alert.reason,
  };
}

/** Alerts that are not tasks: wakes, failed deploys, inquiries and messages, stale review, overdue asks and next steps. */
function alertItems(board: TodayBoard, now: number): TodayItem[] {
  const fromEvents = eventNeeds(board.events, now);
  const deploys = fromEvents.filter((alert) => alert.reason === "deploy");
  const contact = fromEvents.filter((alert) => alert.reason !== "deploy");
  return [
    ...wakeNeeds(board.wakeAlerts).map(alertItem),
    ...deploys.map(alertItem),
    ...contact.map(alertItem),
    ...reviewNeeds(board.reviewWaiting, now).map(alertItem),
  ];
}

function laterItems(board: TodayBoard): TodayItem[] {
  return [
    ...board.waitingSpaces.map((space) => ({
      id: `request:${space.id}:${space.requestTitle}`,
      title: `Files overdue: ${space.requestTitle}`,
      href: `/w/${space.slug}`,
      at: space.dueOn,
      client: space.displayName,
      tone: "waiting" as const,
      source: "client" as const,
      reason: "request_overdue" as const,
    })),
    ...board.stalledDeals.map((deal) => ({
      id: `deal:${deal.id}`,
      title: `Next step overdue: ${deal.nextStep ?? deal.title}`,
      href: `/clients/${deal.organizationId}`,
      at: deal.nextStepAt ?? undefined,
      client: deal.organizationName,
      tone: "waiting" as const,
      source: "lead" as const,
      reason: "next_step" as const,
    })),
  ];
}

export function needsYou(board: TodayBoard, max = 8, now = Date.now()): TodayItem[] {
  const tasks = openTasks(board);
  const late = tasks
    .filter((task) => isLate(task, now))
    .sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0));
  const blocked = tasks.filter((task) => task.status === "blocked" && !isLate(task, now));
  const rows: TodayItem[] = [
    ...alertItems(board, now),
    ...late.map((task) => taskItem(task, "late")),
    ...blocked.map((task) => taskItem(task, "blocked")),
    ...laterItems(board),
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

/** Every Needs you item, uncapped (the metric and the "more" link). */
export function needsCount(board: TodayBoard, now = Date.now()): number {
  return needsYou(board, Number.MAX_SAFE_INTEGER, now).length;
}

export function greeting(now: Date, name?: string): string {
  const hour = torontoHour(now.getTime());
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
  timeZone: TODAY_ZONE,
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
