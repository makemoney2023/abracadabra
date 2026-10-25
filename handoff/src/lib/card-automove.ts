import type { Sql } from "@/db/sql";
import { nextColumnPosition } from "@/lib/task-position";

/**
 * Keeps board cards in step with the work, without an agent having to remember:
 * - A merged GitHub pull request that names a card moves that card to Waiting on Client Services (never to Done:
 *   Client Services still approves it). A card that is done or already waiting gets a note instead.
 * - Failed filings and refused board changes from the agent API are written on the card's timeline, so they never
 *   vanish silently.
 * Filing a deliverable (agent-filing-review recordFiling) and Client Services asking for changes (client-work
 * reviewDeliverable) move cards in their own modules.
 */

const FULL_ID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** A short id only counts right after the word "card" (e.g. "HQ card: 62409040", branch "card-62409040-hero"). */
const SHORT_ID = /(?:^|[^a-z0-9])card[\s:#_-]*([0-9a-f]{8})(?![0-9a-f])/gi;
const MAX_REFS = 20;

export type CardRefs = { ids: string[]; prefixes: string[] };

/** Card ids a pull request names in its body or branch: full ids anywhere, 8-character ids after "card". */
export function cardRefsFromPull(body: unknown, branch: unknown): CardRefs {
  const text = [typeof body === "string" ? body.slice(0, 65_536) : "", typeof branch === "string" ? branch.slice(0, 255) : ""].join("\n");
  const ids: string[] = [];
  for (const match of text.matchAll(FULL_ID)) {
    const id = match[0].toLowerCase();
    if (!ids.includes(id)) ids.push(id);
  }
  const prefixes: string[] = [];
  for (const match of text.matchAll(SHORT_ID)) {
    const prefix = (match[1] ?? "").toLowerCase();
    if (!prefix || prefixes.includes(prefix) || ids.some((id) => id.startsWith(prefix))) continue;
    prefixes.push(prefix);
  }
  return { ids: ids.slice(0, MAX_REFS), prefixes: prefixes.slice(0, MAX_REFS) };
}

type CardRow = {
  id: string;
  title: string;
  organization_id: string;
  project_id: string | null;
  status: string;
  review_requested_at: number | null;
};

const CARD_FIELDS = "id, title, organization_id, project_id, status, review_requested_at";

/** The cards of this client the refs name. A short id must match exactly one card of the client. */
async function cardsFor(sql: Sql, organizationId: string, refs: CardRefs): Promise<CardRow[]> {
  const found = new Map<string, CardRow>();
  for (const id of refs.ids) {
    const row = await sql.get<CardRow>(`SELECT ${CARD_FIELDS} FROM tasks WHERE id = ? AND organization_id = ?`, [id, organizationId]);
    if (row) found.set(row.id, row);
  }
  for (const prefix of refs.prefixes) {
    const rows = await sql.all<CardRow>(
      `SELECT ${CARD_FIELDS} FROM tasks WHERE organization_id = ? AND substr(lower(id), 1, 8) = ? LIMIT 2`,
      [organizationId, prefix],
    );
    if (rows.length === 1 && rows[0]) found.set(rows[0].id, rows[0]);
  }
  return [...found.values()];
}

export type MergedPull = {
  organizationId: string;
  repo: string;
  number: number;
  title: string;
  url: string | null;
  author: string;
  body: unknown;
  branch: unknown;
  now: number;
};

async function writeCardActivity(
  sql: Sql,
  card: CardRow,
  input: { kind: string; body: string; data: Record<string, unknown>; now: number },
): Promise<void> {
  await sql.run(
    `INSERT INTO activities (id, organization_id, project_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, ?, ?, 'system', 'github', ?, ?, ?)`,
    [crypto.randomUUID(), card.organization_id, card.project_id, input.kind, input.body.slice(0, 2000), JSON.stringify(input.data), input.now],
  );
}

/**
 * A merged pull request of a linked repo moves each card it names (same client as the repo) to Waiting on Client
 * Services with the note "PR #N merged: <link>". Done cards are not reopened and waiting cards keep their ask time;
 * both get a note. Returns the ids moved and noted.
 */
export async function moveCardsForMergedPull(sql: Sql, pull: MergedPull): Promise<{ moved: string[]; noted: string[] }> {
  const refs = cardRefsFromPull(pull.body, pull.branch);
  if (refs.ids.length === 0 && refs.prefixes.length === 0) return { moved: [], noted: [] };
  const cards = await cardsFor(sql, pull.organizationId, refs);
  const note = `PR #${pull.number} merged${pull.url ? `: ${pull.url}` : ` in ${pull.repo}`}`;
  const detail = `"${pull.title}" in ${pull.repo} by ${pull.author}`;
  const data = { pr_number: pull.number, repo: pull.repo, title: pull.title, author: pull.author, ...(pull.url ? { url: pull.url } : {}) };
  const moved: string[] = [];
  const noted: string[] = [];
  for (const card of cards) {
    const waiting = card.status !== "done" && card.review_requested_at != null;
    if (card.status === "done" || waiting) {
      await writeCardActivity(sql, card, {
        kind: "github.card_note",
        body: `${note} (${detail}). The card ${card.status === "done" ? "is already done" : "is already waiting on Client Services"}.`,
        data: { taskId: card.id, ...data },
        now: pull.now,
      });
      noted.push(card.id);
      continue;
    }
    const position = await nextColumnPosition(sql, { organizationId: card.organization_id, projectId: card.project_id, column: "review" });
    await sql.run(
      `UPDATE tasks SET status = 'doing', review_requested_at = ?, review_note = ?, blocked_reason = NULL, done_at = NULL,
                        position = ?, updated_at = ?
       WHERE id = ? AND status != 'done' AND review_requested_at IS NULL`,
      [pull.now, `${note}. Ready for Client Services to approve.`.slice(0, 2000), position, pull.now, card.id],
    );
    await writeCardActivity(sql, card, {
      kind: "github.task_stage",
      body: `Moved to Waiting on Client Services. ${note} (${detail}).`,
      data: { taskId: card.id, stage: "review", column: "review", ...data },
      now: pull.now,
    });
    moved.push(card.id);
  }
  return { moved, noted };
}

// ---------- Failures on the card ----------

/** Error text safe to keep: one line, no long blobs. Never carries request bodies or tokens (callers pass error messages only). */
export function failureText(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
  return raw.replace(/\s+/g, " ").replace(/Bearer\s+\S+/gi, "Bearer [hidden]").trim().slice(0, 300) || "Unknown error";
}

/**
 * Writes a failed agent action on the card's timeline (kind client_agent.work_failed or client_agent.board_refused).
 * Only for a card of a client this agent is assigned to, so nothing lands on another client's timeline.
 */
export async function recordCardFailure(
  sql: Sql,
  input: {
    taskId: string;
    agent: { agentId: string; label: string; assignments: { organizationId: string }[] };
    kind: "client_agent.work_failed" | "client_agent.board_refused";
    body: string;
    data: Record<string, unknown>;
    now: number;
  },
): Promise<string | null> {
  const card = await sql.get<{ id: string; title: string; organization_id: string | null; project_id: string | null }>(
    "SELECT id, title, organization_id, project_id FROM tasks WHERE id = ?",
    [input.taskId],
  );
  if (!card?.organization_id || !input.agent.assignments.some((row) => row.organizationId === card.organization_id)) return null;
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO activities (id, organization_id, project_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, ?, ?, 'agent', ?, ?, ?, ?)`,
    [
      id,
      card.organization_id,
      card.project_id,
      input.kind,
      input.agent.agentId,
      `${input.agent.label}: ${input.body}`.slice(0, 2000),
      JSON.stringify({ task_id: card.id, task_title: card.title, agent_id: input.agent.agentId, ...input.data }),
      input.now,
    ],
  );
  return id;
}
