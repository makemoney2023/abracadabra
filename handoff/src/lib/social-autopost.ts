import type { Sql } from "@/db/sql";
import { libraryEligibleSql } from "./project-library";
import type { Caller } from "./authz";
import { commandAuthorized, readCommandGate } from "./social-commands";
import { sendPiece, zonedTimeToUtc } from "./social";
import { WEEKDAY_LABEL } from "./social-plan";
import type { ObjectStore } from "./store/objects";
import type { ZernioClient } from "./zernio";

export type Autopost = {
  enabled: boolean;
  accountIds: string[];
  /** 0 = Sunday ... 6 = Saturday, in the client's time zone. */
  weekdays: number[];
  /** "HH:MM" wall-clock times in the client's time zone. */
  times: string[];
  timezone: string;
  /** When set, at most this many new slots land on one local day. Unset means no cap. */
  dailyCap?: number;
  /** YYYY-MM-DD in the client time zone. Unset or empty means no blackout. */
  blackouts?: string[];
};

export const CADENCE_SENTENCE = "When the client approves a piece, place it in the next available slot.";

export function approvalControlLabel(settings: Autopost): string {
  if (!settings.enabled) return "Approve";
  const days = settings.weekdays.map((day) => WEEKDAY_LABEL[day] ?? String(day)).join(", ");
  return `Approve for ${settings.timezone} on ${days} at ${settings.times.join(", ")}`;
}

export function cadenceFingerprint(settings: Autopost): string {
  return JSON.stringify({
    enabled: settings.enabled,
    weekdays: [...settings.weekdays].sort(),
    times: [...settings.times],
    timezone: settings.timezone,
    dailyCap: settings.dailyCap ?? null,
    blackouts: [...(settings.blackouts ?? [])].sort(),
  });
}

export const DEFAULT_AUTOPOST: Autopost = { enabled: false, accountIds: [], weekdays: [1, 2, 3, 4, 5], times: ["09:00"], timezone: "UTC" };


/** Posting to a client is automatic only for the accounts staff picked, at the client's set times. */
const SYSTEM_CALLER: Caller = { userId: null, staff: { superAdmin: false }, operatorOf: [], memberships: [] };

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTimes(value: string): string[] {
  return [...new Set(value.split(/[\s,]+/).map((part) => part.trim()).filter((part) => TIME.test(part)))].sort();
}

function readLimits(json: string | null | undefined): Pick<Autopost, "dailyCap" | "blackouts"> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as { dailyCap?: unknown; blackouts?: unknown };
    const dailyCap = typeof parsed.dailyCap === "number" && parsed.dailyCap > 0 ? parsed.dailyCap : undefined;
    const blackouts = Array.isArray(parsed.blackouts)
      ? parsed.blackouts.filter((day): day is string => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day))
      : [];
    return {
      ...(dailyCap != null ? { dailyCap } : {}),
      ...(blackouts.length > 0 ? { blackouts } : {}),
    };
  } catch {
    return {};
  }
}

function limitsJson(input: Autopost): string {
  const body: { dailyCap?: number; blackouts?: string[] } = {};
  if (input.dailyCap != null && input.dailyCap > 0) body.dailyCap = input.dailyCap;
  if (input.blackouts && input.blackouts.length > 0) body.blackouts = input.blackouts;
  return JSON.stringify(body);
}

function cadenceActor(caller: Caller): { kind: "staff" | "agent" | "system"; id: string | null } {
  const gate = readCommandGate(caller);
  if (gate) return { kind: gate.kind === "client" ? "system" : gate.kind, id: gate.id };
  return { kind: caller.staff ? "staff" : "system", id: caller.userId };
}

export async function getAutopost(sql: Sql, organizationId: string): Promise<Autopost> {
  const row = await sql.get<{ enabled: number; account_ids: string; weekdays: string; times: string; timezone: string; limits_json: string | null }>(
    "SELECT enabled, account_ids, weekdays, times, timezone, limits_json FROM social_autopost WHERE organization_id = ?",
    [organizationId],
  );
  if (!row) return DEFAULT_AUTOPOST;
  let accountIds: string[] = [];
  try {
    const parsed = JSON.parse(row.account_ids) as unknown;
    if (Array.isArray(parsed)) accountIds = parsed.filter((id): id is string => typeof id === "string");
  } catch {
    accountIds = [];
  }
  return {
    enabled: row.enabled === 1,
    accountIds,
    weekdays: row.weekdays.split(",").map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    times: parseTimes(row.times),
    timezone: row.timezone || "UTC",
    ...readLimits(row.limits_json),
  };
}

export async function saveAutopost(
  sql: Sql,
  caller: Caller,
  organizationId: string,
  input: Autopost,
  now: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!commandAuthorized(caller)) return { ok: false, error: "You can't do that." };
  if (zonedTimeToUtc("2026-01-01T09:00", input.timezone) == null) return { ok: false, error: "Pick a time zone." };
  const accounts = input.accountIds.length
    ? await sql.all<{ id: string }>(
        `SELECT id FROM social_accounts WHERE organization_id = ? AND id IN (${input.accountIds.map(() => "?").join(", ")})`,
        [organizationId, ...input.accountIds],
      )
    : [];
  if (input.enabled && accounts.length === 0) return { ok: false, error: "Pick at least one account." };
  if (input.enabled && (input.weekdays.length === 0 || input.times.length === 0)) {
    return { ok: false, error: "Pick at least one day and one time." };
  }
  await sql.run(
    `INSERT INTO social_autopost (organization_id, enabled, account_ids, weekdays, times, timezone, limits_json, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (organization_id) DO UPDATE SET enabled = excluded.enabled, account_ids = excluded.account_ids,
       weekdays = excluded.weekdays, times = excluded.times, timezone = excluded.timezone, limits_json = excluded.limits_json,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [
      organizationId,
      input.enabled ? 1 : 0,
      JSON.stringify(accounts.map((row) => row.id)),
      [...new Set(input.weekdays)].sort().join(","),
      input.times.join(","),
      input.timezone,
      limitsJson(input),
      caller.userId,
      now,
    ],
  );
  const actor = cadenceActor(caller);
  await sql.run(
    `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, 'social.cadence.updated', ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      organizationId,
      actor.kind,
      actor.id,
      "Updated the publishing cadence.",
      JSON.stringify({ enabled: input.enabled, timezone: input.timezone }),
      now,
    ],
  );
  return { ok: true };
}

function localDay(instant: number, timeZone: string): { date: string; weekday: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: WEEKDAY_LABEL.indexOf(String(parts.weekday)) };
}

/**
 * The next `count` open slots after `now` (at least 5 minutes ahead) on the picked weekdays and times.
 * A slot already holding a post for this client (within a minute) is skipped. Looks ahead at most 120 days.
 */
export function nextSlots(settings: Autopost, taken: number[], now: number, count: number): number[] {
  const slots: number[] = [];
  if (settings.weekdays.length === 0 || settings.times.length === 0 || count <= 0) return slots;
  const busy = [...taken];
  const blackouts = settings.blackouts ?? [];
  const cap = settings.dailyCap;
  for (let day = 0; day < 120 && slots.length < count; day += 1) {
    const { date, weekday } = localDay(now + day * 86_400_000, settings.timezone);
    if (!settings.weekdays.includes(weekday)) continue;
    if (blackouts.includes(date)) continue;
    let used = cap != null ? busy.filter((other) => localDay(other, settings.timezone).date === date).length : 0;
    for (const time of settings.times) {
      if (cap != null && used >= cap) break;
      const at = zonedTimeToUtc(`${date}T${time}`, settings.timezone);
      if (at == null || at < now + 5 * 60_000) continue;
      if (busy.some((other) => Math.abs(other - at) < 60_000)) continue;
      slots.push(at);
      busy.push(at);
      used += 1;
      if (slots.length >= count) break;
    }
  }
  return slots;
}

/**
 * Runs after a client approves pieces. When the client has auto-schedule on, each approved piece that has not gone
 * to those accounts yet is scheduled into the next free slot, as its own post type.
 */
export async function autoScheduleApproved(
  sql: Sql,
  zernio: ZernioClient,
  store: ObjectStore,
  input: { deliverableId: string; itemIds: string[] | null },
  now: number,
): Promise<{ scheduled: number; failed: string[] }> {
  const deliverable = await sql.get<{ organization_id: string; published_version: number | null; kind: string }>(
    "SELECT organization_id, published_version, kind FROM deliverables WHERE id = ?",
    [input.deliverableId],
  );
  const result = { scheduled: 0, failed: [] as string[] };
  if (!deliverable || deliverable.published_version == null || deliverable.kind === "brief" || deliverable.kind === "design_system") {
    return result;
  }
  const settings = await getAutopost(sql, deliverable.organization_id);
  if (!settings.enabled || settings.accountIds.length === 0) return result;
  // A project that opted out of the Library (print, for example) is not social work: never auto-post it.
  const eligible = await sql.get<{ id: string }>(
    `SELECT d.id FROM deliverables d WHERE d.id = ? AND ${libraryEligibleSql("d.project_id", "d.workspace_id")}`,
    [input.deliverableId],
  );
  if (!eligible) return result;
  const approved = await sql.all<{ id: string; title: string }>(
    `SELECT i.id, i.title FROM deliverable_items i
     WHERE i.deliverable_id = ? AND i.version = ? AND i.status = 'approved' AND i.removed_at IS NULL
       AND i.format NOT IN ('page', 'link', 'file')
     AND NOT EXISTS (
       SELECT 1 FROM social_posts p WHERE p.item_id = i.id AND p.version = i.version
       AND p.status IN ('sending', 'scheduled', 'published', 'partial')
     )
     ORDER BY i.sort, i.title`,
    [input.deliverableId, deliverable.published_version],
  );
  const wanted = input.itemIds ? new Set(input.itemIds) : null;
  const pieces = approved.filter((row) => !wanted || wanted.has(row.id));
  if (pieces.length === 0) return result;
  const taken = (
    await sql.all<{ scheduled_for: number }>(
      `SELECT scheduled_for FROM social_posts WHERE organization_id = ? AND status = 'scheduled' AND scheduled_for > ?`,
      [deliverable.organization_id, now],
    )
  ).map((row) => row.scheduled_for);
  const slots = nextSlots(settings, taken, now, pieces.length);
  for (const [index, piece] of pieces.entries()) {
    const at = slots[index];
    if (at == null) {
      result.failed.push(`"${piece.title}": no open slot in the next 120 days.`);
      continue;
    }
    const sent = await sendPiece(
      sql,
      zernio,
      store,
      SYSTEM_CALLER,
      {
        deliverableId: input.deliverableId,
        itemId: piece.id,
        accountIds: settings.accountIds,
        mode: "scheduled",
        postType: null,
        scheduledFor: at,
        timezone: settings.timezone,
      },
      now,
    );
    if (sent.ok) result.scheduled += 1;
    else result.failed.push(sent.error);
  }
  return result;
}
