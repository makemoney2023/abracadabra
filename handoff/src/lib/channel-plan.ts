import type { Sql } from "@/db/sql";

export type ChannelAction = {
  title: string;
  assignee: string | null;
  due: string | null;
  skill: string | null;
};

export type ChannelPlan = {
  actions: ChannelAction[];
  brief: string | null;
  rules: string | null;
};

const MAX_ACTIONS = 8;
const MAX_TITLE = 200;
const MAX_BRIEF = 2_000;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function clip(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, max);
  return text || null;
}

/** One task line: title, person, date, skill path. Blank slots can be left empty. */
export function actionFromLine(line: string): ChannelAction | null {
  const parts = line.split("|").map((part) => part.trim());
  const title = parts[0]?.slice(0, MAX_TITLE) ?? "";
  if (!title) return null;
  return {
    title,
    assignee: parts[1] ? parts[1].slice(0, 200) : null,
    due: parts[2] ? parts[2].slice(0, 40) : null,
    skill: skillPath(parts[3] ?? ""),
  };
}

function skillPath(value: string): string | null {
  const path = value.trim().slice(0, 300);
  if (!path || !path.includes("/")) return null;
  return path;
}

/** A calendar day, or the next named weekday in UTC, including today. */
export function dueMillis(value: string, now: number): number | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (iso) {
    const month = Number(iso[2]) - 1;
    const day = Number(iso[3]);
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    return Date.UTC(Number(iso[1]), month, day);
  }
  const weekday = WEEKDAYS.indexOf(value.trim().toLowerCase());
  if (weekday < 0) return null;
  const current = new Date(now);
  const delta = (weekday - current.getUTCDay() + 7) % 7;
  return Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + delta);
}

/** Task titles, a brief sentence, and standing rules. Blank lines and other shapes are dropped. */
export function normalizeChannelPlan(input: { actions?: unknown; brief?: unknown; rules?: unknown }): ChannelPlan {
  const raw = Array.isArray(input.actions) ? input.actions : [];
  const actions: ChannelAction[] = [];
  for (const item of raw) {
    if (actions.length >= MAX_ACTIONS) break;
    if (!item || typeof item !== "object" || !("title" in item)) continue;
    const title = typeof item.title === "string" ? item.title.trim().slice(0, MAX_TITLE) : "";
    if (!title) continue;
    const row = item as { assignee?: unknown; due?: unknown; skill?: unknown };
    actions.push({
      title,
      assignee: clip(row.assignee, 200),
      due: clip(row.due, 40),
      skill: skillPath(typeof row.skill === "string" ? row.skill : ""),
    });
  }
  const brief = typeof input.brief === "string" ? input.brief.trim().slice(0, MAX_BRIEF) : "";
  const rules = typeof input.rules === "string" ? input.rules.trim().slice(0, MAX_BRIEF) : "";
  return { actions, brief: brief || null, rules: rules || null };
}

/** Adds a sentence and any new rules. A rule already under ## Rules is left once. */
export function mergeBrief(markdown: string, note: string | null, rules: string | null): string {
  let next = markdown.trim();
  if (note && !next.includes(note)) next = next ? `${next}\n\n${note}` : note;
  const incoming = (rules ?? "")
    .split("\n")
    .map((line) => line.replace(/^[-*\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_ACTIONS);
  const fresh = incoming.filter((line) => !rulesFromBrief(next).includes(line));
  if (fresh.length === 0) return next;
  const block = fresh.map((line) => `- ${line}`).join("\n");
  if (!next.includes("## Rules")) return next ? `${next}\n\n## Rules\n${block}\n` : `## Rules\n${block}\n`;
  return next.replace("## Rules\n", `## Rules\n${block}\n`);
}

/** Lines under ## Rules, without the leading dash. */
export function rulesFromBrief(markdown: string): string[] {
  const match = markdown.match(/## Rules\n([\s\S]*?)(?=\n## |$)/);
  if (!match) return [];
  return match[1]
    .split("\n")
    .map((line) => line.replace(/^-\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Writes each action as an open task on the client, and appends the brief sentence
 * to the current brief. A lead with no brief keeps the sentence on the timeline.
 */
export async function applyChannelPlan(
  sql: Sql,
  input: {
    organizationId: string;
    actions: Array<Pick<ChannelAction, "title"> & Partial<Omit<ChannelAction, "title">>>;
    brief: string | null;
    rules?: string | null;
    attribution?: { actorKind: "agent" | "staff"; actorId: string; via: string; createdBy: "agent" | "staff" };
  },
  now: number,
): Promise<{ taskIds: string[]; briefUpdated: boolean; unassigned: string[] }> {
  const plan = normalizeChannelPlan(input);
  const who = input.attribution ?? { actorKind: "agent" as const, actorId: "client-desk", via: "channel", createdBy: "agent" as const };
  if (!input.organizationId || (plan.actions.length === 0 && !plan.brief && !plan.rules)) {
    return { taskIds: [], briefUpdated: false, unassigned: [] };
  }
  const org = await sql.get<{ id: string }>("SELECT id FROM organizations WHERE id = ? AND archived_at IS NULL", [
    input.organizationId,
  ]);
  if (!org) return { taskIds: [], briefUpdated: false, unassigned: [] };
  const people = await sql.all<{ user_id: string; email: string }>(
    "SELECT user_id, email FROM staff WHERE revoked_at IS NULL",
  );
  const taskIds: string[] = [];
  const unassigned: string[] = [];
  await sql.exec("BEGIN");
  try {
    for (const action of plan.actions) {
      const assignee = matchStaff(people, action.assignee);
      if (action.assignee && !assignee) unassigned.push(action.assignee);
      const dueAt = action.due ? dueMillis(action.due, now) : null;
      const skills = action.skill
        ? JSON.stringify({ steps: [{ path: action.skill, mode: "complete", status: "todo" }], current: 0 })
        : null;
      const id = crypto.randomUUID();
      await sql.run(
        `INSERT INTO tasks (
           id, project_id, milestone_id, organization_id, title, status, assignee_user_id,
           due_at, created_at, updated_at, done_at, created_by_kind, skills_json
         ) VALUES (?, NULL, NULL, ?, ?, 'todo', ?, ?, ?, ?, NULL, ?, ?)`,
        [id, input.organizationId, action.title, assignee, dueAt, now, now, who.createdBy, skills],
      );
      await sql.run(
        `INSERT INTO activities (
           id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
         ) VALUES (?, ?, 'task', ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          input.organizationId,
          who.actorKind,
          who.actorId,
          action.title,
          JSON.stringify({ taskId: id, via: who.via }),
          now,
        ],
      );
      taskIds.push(id);
    }
    const briefUpdated = plan.brief || plan.rules ? await writeBrief(sql, input.organizationId, plan.brief, plan.rules, now, who) : false;
    await sql.exec("COMMIT");
    return { taskIds, briefUpdated, unassigned };
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
}

function matchStaff(people: { user_id: string; email: string }[], name: string | null): string | null {
  if (!name) return null;
  const folded = name.trim().toLowerCase();
  const exact = people.find((person) => person.email === folded);
  if (exact) return exact.user_id;
  const local = people.filter((person) => person.email.split("@")[0] === folded);
  return local.length === 1 ? local[0]!.user_id : null;
}

async function writeBrief(
  sql: Sql,
  organizationId: string,
  note: string | null,
  rules: string | null,
  now: number,
  who: { actorKind: "agent" | "staff"; actorId: string; via: string },
): Promise<boolean> {
  const existing = await sql.get<{ id: string; version: number; title: string }>(
    `SELECT id, version, title FROM deliverables
     WHERE organization_id = ? AND kind = 'brief' AND status != 'archived'
     ORDER BY updated_at DESC LIMIT 1`,
    [organizationId],
  );
  if (existing) {
    const item = await sql.get<{ copy_text: string | null }>(
      `SELECT copy_text FROM deliverable_items
       WHERE deliverable_id = ? AND version = ? AND title = 'brief.md'
       ORDER BY sort LIMIT 1`,
      [existing.id, existing.version],
    );
    const body = mergeBrief(item?.copy_text ?? "", note, rules);
    const version = existing.version + 1;
    await sql.run("UPDATE deliverables SET version = ?, status = 'draft', updated_at = ? WHERE id = ?", [
      version,
      now,
      existing.id,
    ]);
    await sql.run(
      `INSERT INTO deliverable_items (
         id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
       ) VALUES (?, ?, ?, NULL, 'page', NULL, 'brief.md', ?, '[]', NULL, 'pending', 0)`,
      [crypto.randomUUID(), existing.id, version, body],
    );
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
       ) VALUES (?, ?, 'agent.brief_updated', ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        organizationId,
        who.actorKind,
        who.actorId,
        [note, rules].filter(Boolean).join("\n"),
        JSON.stringify({ deliverableId: existing.id, version, via: who.via }),
        now,
      ],
    );
    return true;
  }
  await sql.run(
    `INSERT INTO activities (
       id, organization_id, kind, actor_kind, actor_id, body, created_at
     ) VALUES (?, ?, 'agent.brief_change', ?, ?, ?, ?)`,
    [crypto.randomUUID(), organizationId, who.actorKind, who.actorId, [note, rules].filter(Boolean).join("\n"), now],
  );
  return false;
}
