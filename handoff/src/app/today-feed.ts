/**
 * Today feed: Needs you alerts, the Agent work strip, and the FYI list (one row per scan, PR, card or burst).
 * Pure functions over rows from todayFor(). Times are grouped by the Toronto day.
 */
import type { FeedEvent, NewLeadRow, ReviewWaiting, WakeAlert } from "@/db/crm";
import { BOARD_COLUMN_LABEL, toColumn, type BoardColumn } from "@/lib/board-model";

export type { FeedEvent } from "@/db/crm";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const WEEK = 7 * 24 * HOUR;

/** Same client and kind inside this gap fold into one row. */
export const BURST_MS = 2 * HOUR;
/** A card waiting on Client Services longer than this is in Needs you. Client Services checks every 30 minutes. */
export const REVIEW_WAIT_MS = 4 * HOUR;
/** Rows shown before Show more. */
export const FEED_PAGE = 25;
export const TODAY_ZONE = "America/Toronto";

export type FeedType = "agent" | "leads" | "clients" | "system";
export type FeedFilter = "all" | FeedType;
export const FEED_FILTERS: { value: FeedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "agent", label: "Agent" },
  { value: "leads", label: "Leads" },
  { value: "clients", label: "Clients" },
  { value: "system", label: "GitHub" },
];

type Scope = { client: string; organizationId: string; parentOrganizationId: string | null };

export type FeedRow = Scope & {
  /** Every client in a burst and their groups, so a company filter still finds a group row. */
  members?: string[];
  id: string;
  at: number;
  title: string;
  body?: string;
  href: string;
  type: FeedType;
  count: number;
  failed?: boolean;
};

export type NeedsAlert = Scope & {
  id: string;
  at: number;
  title: string;
  body?: string;
  href: string;
  reason: "inquiry" | "message" | "deploy" | "wake" | "review";
  tone: "late" | "waiting";
};

export type AgentWorkRow = Scope & {
  id: string;
  at: number;
  title: string;
  body?: string;
  href: string;
  decision: "filed" | "waiting" | "approved" | "sent_back" | "handoff";
};

// ---------------------------------------------------------------- Toronto time

const DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: TODAY_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const HOUR_OF = new Intl.DateTimeFormat("en-US", { timeZone: TODAY_ZONE, hour: "numeric", hourCycle: "h23" });

function dayKey(ms: number): string {
  return DAY_KEY.format(ms);
}

function previousDay(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) - 1));
  return date.toISOString().slice(0, 10);
}

export function dayGroup(at: number, now: number): "Today" | "Yesterday" | "Earlier" {
  const today = dayKey(now);
  const key = dayKey(at);
  if (key === today) return "Today";
  if (key === previousDay(today)) return "Yesterday";
  return "Earlier";
}

export function torontoHour(ms: number): number {
  return Number(HOUR_OF.format(ms)) % 24;
}

// ---------------------------------------------------------------- event helpers

const HIDDEN = new Set([
  "agent.swarm_run",
  "task_deleted",
  "agent.task_deleted",
  "agent.project_deleted",
  "staff.workflow",
  "staff.workflow_group",
  "staff.brief_addendum",
  "staff.brief_changes",
  "agent.task_brief",
  "context_changed",
  "email",
  "agent.wake_failed",
]);

const AGENT_WORK = new Set([
  "client_agent.work_filed",
  "client_agent.review_waiting",
  "client_agent.handoff",
  "client_services.task_review",
  "staff.task_review",
  "client_agent.task_review",
]);

const BOARD_MOVES = new Set([
  "agent.task_stage",
  "staff.task_stage",
  "client_services.task_stage",
  "client_agent.board",
  "github.task_stage",
  "github.card_note",
  "client_agent.board_refused",
]);

const LABELS: Record<string, [string, string]> = {
  "lead.prospected": ["New prospect", "new prospects"],
  "lead.enriched": ["Lead enriched", "leads enriched"],
  "lead.contacted": ["Lead contacted", "leads contacted"],
  "lead.scoring_failed": ["Lead scoring failed", "lead scoring failures"],
  "org.reopened": ["Client reopened", "clients reopened"],
  "client_agent.assigned": ["Agent assigned", "agent assignments"],
  "client_agent.unassigned": ["Agent unassigned", "agent removals"],
  "client_agent.work_unfiled": ["Agent work unfiled", "unfiled agent results"],
  "client_agent.work_failed": ["Agent filing failed", "failed agent filings"],
  "client_agent.work_discarded": ["Agent work discarded", "discarded agent results"],
  "agent.reply": ["Agent replied", "agent replies"],
  "agent.question": ["Agent asked a question", "agent questions"],
  "agent.note": ["Agent note", "agent notes"],
  "client.message": ["Client message", "client messages"],
  "project_inquiry": ["Website inquiry", "website inquiries"],
  note: ["Note", "notes"],
  stage_change: ["Deal moved", "deal moves"],
};

/** Kinds whose body already reads as a sentence. */
const BODY_IS_TITLE = new Set([
  "note",
  "client_agent.assigned",
  "client_agent.unassigned",
  "client_agent.work_unfiled",
  "client_agent.work_discarded",
  "agent.note",
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clip(value: string, max = 160): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function curly(value: string): string {
  return value.replace(/"([^"]*)"/g, "\u201c$1\u201d");
}

function hidden(event: FeedEvent): boolean {
  if (HIDDEN.has(event.kind) || event.kind.startsWith("pipeline.")) return true;
  if (event.kind === "note" && !text(event.body)) return true;
  return false;
}

export function feedType(kind: string): FeedType {
  if (kind === "deploy" || kind === "push" || kind.startsWith("pr_")) return "system";
  if (kind === "schema.scan" || kind.startsWith("lead.") || kind === "org.reopened" || kind === "stage_change") return "leads";
  if (kind.startsWith("client_agent.") || kind.startsWith("agent.") || BOARD_MOVES.has(kind) || kind.startsWith("client_services.")) {
    return "agent";
  }
  return "clients";
}

function scope(event: FeedEvent): Scope {
  return {
    client: event.organizationName,
    organizationId: event.organizationId,
    parentOrganizationId: event.parentOrganizationId,
  };
}

function clientHref(event: { organizationId: string }): string {
  return `/clients/${event.organizationId}`;
}

function taskHref(event: FeedEvent): string {
  return event.projectId ? `/projects/${event.projectId}` : `/clients/${event.organizationId}?tab=work`;
}

function deployFailed(event: FeedEvent): boolean {
  return event.kind === "deploy" && (/\bfail/i.test(text(event.body)) || /fail/i.test(text(event.data.state)));
}

function repoOf(event: FeedEvent): string {
  return text(event.data.repo);
}

function shortRepo(repo: string): string {
  return repo.split("/").pop() || repo;
}

function answered(event: FeedEvent, events: FeedEvent[]): boolean {
  return events.some(
    (other) =>
      other.id !== event.id &&
      other.organizationId === event.organizationId &&
      (other.actorKind === "staff" || other.actorKind === "agent") &&
      other.createdAt >= event.createdAt,
  );
}

// ---------------------------------------------------------------- Needs you

/** Unanswered inquiries and client messages from the last week, and failed deploys not yet followed by a good one. */
export function eventNeeds(events: FeedEvent[], now: number): NeedsAlert[] {
  const recent = events.filter((event) => event.createdAt >= now - WEEK);
  const out: NeedsAlert[] = [];
  const failedRepos = new Set<string>();
  for (const event of recent) {
    if ((event.kind === "project_inquiry" || event.kind === "client.message") && !answered(event, recent)) {
      const inquiry = event.kind === "project_inquiry";
      const body = clip(text(event.body) || (inquiry ? "Asked about a project." : "New message."), 120);
      out.push({
        ...scope(event),
        id: event.id,
        at: event.createdAt,
        title: `${inquiry ? "Website inquiry" : "Client message"}: ${body}`,
        href: clientHref(event),
        reason: inquiry ? "inquiry" : "message",
        tone: "waiting",
      });
    }
    if (deployFailed(event)) {
      const repo = repoOf(event);
      if (failedRepos.has(repo)) continue;
      const fixed = recent.some(
        (other) => other.kind === "deploy" && repoOf(other) === repo && other.createdAt > event.createdAt && !deployFailed(other),
      );
      if (fixed) continue;
      failedRepos.add(repo);
      out.push({
        ...scope(event),
        id: event.id,
        at: event.createdAt,
        title: `Deploy failed${repo ? `: ${repo}` : ""}`,
        body: text(event.data.url) || undefined,
        href: clientHref(event),
        reason: "deploy",
        tone: "late",
      });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

/** One alert per client whose agent wakes keep failing. */
export function wakeNeeds(alerts: WakeAlert[]): NeedsAlert[] {
  return alerts.map((alert) => ({
    client: alert.organizationName,
    organizationId: alert.organizationId,
    parentOrganizationId: alert.parentOrganizationId,
    id: `wake:${alert.organizationId}`,
    at: alert.lastAt,
    title: `Agent isn\u2019t waking: ${alert.failures} failed wake${alert.failures === 1 ? "" : "s"}`,
    body: alert.lastError ? `Last: ${alert.lastError}` : undefined,
    href: `/clients/${alert.organizationId}`,
    reason: "wake",
    tone: "late",
  }));
}

/** Cards waiting on Client Services longer than the limit. */
export function reviewNeeds(rows: ReviewWaiting[], now: number, waitMs = REVIEW_WAIT_MS): NeedsAlert[] {
  return rows
    .filter((row) => row.since <= now - waitMs)
    .map((row) => ({
      client: row.organizationName,
      organizationId: row.organizationId,
      parentOrganizationId: row.parentOrganizationId,
      id: `review:${row.taskId}`,
      at: row.since,
      title: `\u201c${row.title}\u201d waiting on Client Services`,
      href: row.projectId ? `/projects/${row.projectId}` : `/clients/${row.organizationId}?tab=work`,
      reason: "review" as const,
      tone: "waiting" as const,
    }));
}

// ---------------------------------------------------------------- Agent work

function quotedTitle(body: string): string {
  const match = body.match(/"([^"]+)"/);
  return match?.[1] ?? "";
}

export function agentWork(events: FeedEvent[]): AgentWorkRow[] {
  const rows: AgentWorkRow[] = [];
  for (const event of events) {
    if (!AGENT_WORK.has(event.kind)) continue;
    const body = text(event.body);
    const base = { ...scope(event), id: event.id, at: event.createdAt, href: taskHref(event) };
    if (event.kind === "client_services.task_review" || event.kind === "staff.task_review" || event.kind === "client_agent.task_review") {
      const decision = text(event.data.decision);
      const title = event.taskTitle || quotedTitle(body) || "a card";
      const approved = decision === "approve";
      const note = text(event.data.note);
      const override = event.kind === "staff.task_review"
        ? "Admin override"
        : event.kind === "client_agent.task_review"
          ? `Approved by agent ${text(event.data.agent_id) || "unknown"}`
          : "";
      rows.push({
        ...base,
        decision: approved ? "approved" : "sent_back",
        title: `${approved ? "Approved" : "Sent back"} \u201c${title}\u201d`,
        body: [override, note].filter(Boolean).join(": ") || undefined,
      });
      continue;
    }
    const decision =
      event.kind === "client_agent.review_waiting" ? "waiting" : event.kind === "client_agent.handoff" ? "handoff" : "filed";
    rows.push({ ...base, decision, title: clip(curly(body || "Agent work filed")) });
  }
  return rows.sort((a, b) => b.at - a.at);
}

export function agentWorkStats(
  events: FeedEvent[],
  waiting: number,
): { waiting: number; filed: number; approved: number; sentBack: number } {
  let filed = 0;
  let approved = 0;
  let sentBack = 0;
  for (const event of events) {
    if (event.kind === "client_agent.work_filed") filed += 1;
    if (event.kind === "client_services.task_review" || event.kind === "staff.task_review" || event.kind === "client_agent.task_review") {
      if (text(event.data.decision) === "approve") approved += 1;
      else sentBack += 1;
    }
  }
  return { waiting, filed, approved, sentBack };
}

// ---------------------------------------------------------------- FYI

type Member = { event: FeedEvent; key: string };
type Group = { key: string; members: FeedEvent[] };

function scanKey(event: FeedEvent): string {
  return text(event.data.scanId) || event.id;
}

/** Newest event per scan only. */
function collapseScans(events: FeedEvent[]): FeedEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (event.kind !== "schema.scan") return true;
    const key = scanKey(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function prKey(event: FeedEvent): string {
  return `pr:${repoOf(event)}#${String(event.data.number ?? "")}`;
}

function groupKey(event: FeedEvent, events: FeedEvent[]): string {
  if (event.kind === "pr_opened" || event.kind === "pr_merged") return prKey(event);
  if (event.kind === "push") {
    const merge = events.find(
      (other) =>
        other.kind === "pr_merged" && repoOf(other) === repoOf(event) && Math.abs(other.createdAt - event.createdAt) <= 2 * MINUTE,
    );
    if (merge) return prKey(merge);
  }
  if (BOARD_MOVES.has(event.kind)) return `board:${event.taskId || text(event.data.taskId) || text(event.data.task_id) || event.id}`;
  // A holding group's companies burst together (LioCorr and its four companies set up at once).
  return `kind:${event.parentOrganizationId ?? event.organizationId}:${event.kind}`;
}

function groupBursts(members: Member[]): Group[] {
  const groups: Group[] = [];
  const open = new Map<string, { group: Group; oldest: number }>();
  for (const { event, key } of members) {
    const current = open.get(key);
    const unlimited = key.startsWith("pr:");
    if (current && (unlimited || current.oldest - event.createdAt <= BURST_MS)) {
      current.group.members.push(event);
      current.oldest = event.createdAt;
      continue;
    }
    const group = { key, members: [event] };
    groups.push(group);
    open.set(key, { group, oldest: event.createdAt });
  }
  return groups;
}

function moveColumn(event: FeedEvent): BoardColumn | null {
  const fromData = toColumn(event.data.column);
  if (fromData) return fromData;
  if (event.kind === "client_agent.board") {
    const action = text(event.data.action);
    if (action === "review") return "review";
    if (action === "start") return "doing";
    if (action === "pause") return "todo";
    const to = toColumn(event.data.to);
    if (to) return to;
  }
  const said = text(event.body).match(/moved to ([^.]+)\./i)?.[1];
  if (said) {
    const label = Object.entries(BOARD_COLUMN_LABEL).find(([, value]) => value.toLowerCase() === said.trim().toLowerCase());
    if (label) return label[0] as BoardColumn;
    return toColumn(said);
  }
  return null;
}

function stripActor(body: string): string {
  return body.replace(/^[^:"]{1,60}: (?=["\u201c]|Note|Started|Paused|Blocked|Added|Moved)/, "");
}

function boardRow(group: Group): Pick<FeedRow, "title" | "body"> {
  const ordered = [...group.members].reverse();
  const newest = group.members[0]!;
  const taskTitle = group.members.map((event) => event.taskTitle || text(event.data.task_title)).find(Boolean) || "";
  const path: BoardColumn[] = [];
  for (const event of ordered) {
    const column = moveColumn(event);
    if (column && path[path.length - 1] !== column) path.push(column);
  }
  if (path.length > 0 && taskTitle) {
    const last = path[path.length - 1]!;
    return {
      title: `\u201c${taskTitle}\u201d moved to ${BOARD_COLUMN_LABEL[last]}`,
      body: path.length > 1 ? path.map((column) => BOARD_COLUMN_LABEL[column]).join(" → ") : undefined,
    };
  }
  const said = curly(stripActor(text(newest.body)));
  return {
    title: clip(said || (taskTitle ? `\u201c${taskTitle}\u201d updated` : "Board update")),
    body: group.members.length > 1 ? `${group.members.length} updates` : undefined,
  };
}

function scanTitle(event: FeedEvent): Pick<FeedRow, "title" | "body" | "failed"> {
  const status = text(event.data.status) || "update";
  const domain = text(event.data.domain);
  const score = event.data.score;
  const failed = status === "failed";
  return {
    title: `Schema scan ${status}${domain ? ` for ${domain}` : ""}`,
    body: typeof score === "number" ? `Score ${score}` : failed ? clip(text(event.body).replace(/^Schema scan failed for [^.]+\.\s*/, "")) || undefined : undefined,
    failed,
  };
}

function single(event: FeedEvent): Pick<FeedRow, "title" | "body"> {
  const body = text(event.body);
  if (BODY_IS_TITLE.has(event.kind)) return { title: clip(curly(body)) };
  if (event.kind === "stage_change") return { title: clip(`Deal ${body.charAt(0).toLowerCase()}${body.slice(1)}`) };
  const label = LABELS[event.kind]?.[0];
  if (label) return { title: label, body: body && body !== label ? clip(curly(body)) : undefined };
  return { title: clip(curly(body || event.kind)) };
}

function render(group: Group): Omit<FeedRow, keyof Scope | "id" | "at" | "href" | "type" | "count"> {
  const newest = group.members[0]!;
  const count = group.members.length;
  if (group.key.startsWith("pr:")) {
    const pr = group.members.find((event) => event.kind !== "push") ?? newest;
    const words: string[] = [];
    for (const event of [...group.members].reverse()) {
      const word = event.kind === "pr_opened" ? "opened" : event.kind === "pr_merged" ? "merged" : "pushed";
      if (!words.includes(word)) words.push(word);
    }
    const number = String(pr.data.number ?? "");
    const title = text(pr.data.title);
    return { title: clip(`PR #${number}${title ? ` ${title}` : ""}`), body: `${words.join(" → ")} · ${repoOf(pr)}` };
  }
  if (group.key.startsWith("board:")) return boardRow(group);
  if (newest.kind === "deploy") {
    const failed = group.members.filter(deployFailed).length;
    if (count === 1) return { title: failed ? "Deploy failed" : "Deploy succeeded", body: repoOf(newest) || undefined, failed: failed > 0 };
    return {
      title: `${count} deploys to ${shortRepo(repoOf(newest))}`,
      body: failed ? `${failed} failed` : "all succeeded",
      failed: failed > 0,
    };
  }
  if (newest.kind === "schema.scan") {
    if (count === 1) return scanTitle(newest);
    const domains = [...new Set(group.members.map((event) => text(event.data.domain)).filter(Boolean))];
    return { title: `${count} schema scans`, body: domains.join(", ") || undefined };
  }
  if (count === 1) return single(newest);
  const plural = LABELS[newest.kind]?.[1] ?? "updates";
  if (newest.kind === "note") return { title: single(newest).title, body: `+${count - 1} more ${count === 2 ? "note" : plural}` };
  return { title: `${count} ${plural}`, body: single(newest).body ?? single(newest).title };
}

/** The client a row names: one client, or the holding group when the burst spans its companies. */
function rowScope(group: Group): Scope {
  const newest = group.members[0]!;
  const orgs = new Set(group.members.map((event) => event.organizationId));
  if (orgs.size > 1 && newest.parentOrganizationId) {
    const name = newest.parentOrganizationName || group.members.find((event) => event.organizationId === newest.parentOrganizationId)?.organizationName;
    return {
      client: `${name ?? newest.organizationName} (group)`,
      organizationId: newest.parentOrganizationId,
      parentOrganizationId: null,
    };
  }
  if (orgs.size > 1) {
    const parent = group.members.find((event) => !event.parentOrganizationId);
    if (parent) return { client: `${parent.organizationName} (group)`, organizationId: parent.organizationId, parentOrganizationId: null };
  }
  return scope(newest);
}

/**
 * FYI rows, newest first: one row per scan, PR, card, or same-kind burst on a client.
 * Needs-you and Agent-work events are left out.
 */
export function fyiRows(events: FeedEvent[], leads: NewLeadRow[], now: number, exclude: Set<string> = new Set()): FeedRow[] {
  const visible = collapseScans(
    [...events]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((event) => !hidden(event) && !AGENT_WORK.has(event.kind) && !exclude.has(event.id)),
  );
  const members = visible.map((event) => ({ event, key: groupKey(event, visible) }));
  const rows: FeedRow[] = groupBursts(members).map((group) => {
    const newest = group.members[0]!;
    const members = new Set<string>();
    for (const event of group.members) {
      members.add(event.organizationId);
      if (event.parentOrganizationId) members.add(event.parentOrganizationId);
    }
    return {
      ...rowScope(group),
      ...render(group),
      members: [...members],
      id: newest.id,
      at: newest.createdAt,
      href: BOARD_MOVES.has(newest.kind) ? taskHref(newest) : clientHref(newest),
      type: feedType(newest.kind),
      count: group.members.length,
    };
  });
  for (const lead of leads) {
    if (lead.createdAt < now - WEEK) continue;
    rows.push({
      client: lead.organizationName,
      organizationId: lead.organizationId,
      parentOrganizationId: lead.parentOrganizationId,
      id: `lead:${lead.id}`,
      at: lead.createdAt,
      title: clip(`New lead: ${lead.title}`),
      href: `/clients/${lead.organizationId}`,
      type: "leads",
      count: 1,
    });
  }
  return rows.sort((a, b) => b.at - a.at);
}

// ---------------------------------------------------------------- filters, paging, unread

export function inScope(row: Scope & { members?: string[] }, client: string | null | undefined): boolean {
  if (!client) return true;
  return row.organizationId === client || row.parentOrganizationId === client || Boolean(row.members?.includes(client));
}

export function filterFeed<T extends Scope & { type?: FeedType; members?: string[] }>(
  rows: T[],
  filter: { type?: FeedFilter; client?: string | null },
): T[] {
  return rows.filter(
    (row) => (!filter.type || filter.type === "all" || row.type === filter.type) && inScope(row, filter.client),
  );
}

export function pageRows<T>(rows: T[], limit: number): { rows: T[]; more: number } {
  return { rows: rows.slice(0, limit), more: Math.max(0, rows.length - limit) };
}

export function unreadCount(rows: { at: number }[], seenAt: number | null): number {
  if (seenAt === null) return 0;
  return rows.filter((row) => row.at > seenAt).length;
}

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function feedQuery(params: Params): { type: FeedFilter; client: string | null; limit: number } {
  const rawType = first(params.type) ?? first(params.feed);
  const type = FEED_FILTERS.some((item) => item.value === rawType) ? (rawType as FeedFilter) : "all";
  const client = first(params.client)?.trim() || null;
  const parsed = Number.parseInt(first(params.limit) ?? "", 10);
  const limit = Number.isFinite(parsed) && parsed >= FEED_PAGE ? Math.min(parsed, 500) : FEED_PAGE;
  return { type, client: client && /^[\w-]{1,64}$/.test(client) ? client : null, limit };
}

export type ClientChoice = { id: string; label: string; depth: 0 | 1 };

/** Client picker: a holding group first, labeled as a group, with its companies under it. */
export function clientChoices(orgs: { id: string; name: string; parentId: string | null }[]): ClientChoice[] {
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const ids = new Set(orgs.map((org) => org.id));
  const top = orgs.filter((org) => !org.parentId || !ids.has(org.parentId)).sort(byName);
  const out: ClientChoice[] = [];
  for (const org of top) {
    const children = orgs.filter((child) => child.parentId === org.id).sort(byName);
    out.push({ id: org.id, label: children.length > 0 ? `${org.name} (group)` : org.name, depth: 0 });
    for (const child of children) out.push({ id: child.id, label: child.name, depth: 1 });
  }
  return out;
}
