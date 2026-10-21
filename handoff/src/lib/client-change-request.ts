import type { Sql } from "@/db/sql";
import { dispatchTask, leadAgentFor, liveClientAgent } from "@/lib/agent-dispatch";
import { attachCardSkills, cardSkillPacks } from "@/lib/skill-packs";
import { nextColumnPosition } from "@/lib/task-position";

/** Activity kind for a client's "Ask for changes". The Client Services updates feed carries it. */
export const CLIENT_CHANGES_KIND = "client.changes_requested";

const NOTE_MAX = 2000;

function clientOrigin(): string {
  const raw = typeof process !== "undefined" ? process.env?.HANDOFF_APP_ORIGIN : "";
  return (raw || "https://handoff.abra-ca-dabra.app").replace(/\/$/, "");
}

export type ChangeRequestInput = {
  deliverableId: string;
  itemId: string | null;
  version: number;
  /** The deliverable_feedback row the client's note was stored in. */
  feedbackId: string | null;
  note: string;
  author: { kind: "client" | "staff"; id: string };
  now: number;
};

export type ChangeRequestResult = {
  taskId: string;
  /** False when the note went onto a change card that was still open. */
  created: boolean;
  agentId: string | null;
  activityId: string;
};

/**
 * A client asked for changes on finished work (AGENT_MODE=agents). Opens a To do card on the client's agent board in
 * the deliverable's project, owned by the original card's agent while that agent is live on the client, else the
 * lead. The card carries the note, the piece it is about, and the link. It is handed to that agent the same way
 * board work is (client_agent.dispatch, read with GET /api/agent-work?dispatches=1). A second ask while that card is
 * still open adds the note to it and hands it again instead of opening another. Briefs and design systems are left
 * to their own flow. Returns null when there is nothing to open.
 */
export async function openClientChangeRequest(sql: Sql, input: ChangeRequestInput): Promise<ChangeRequestResult | null> {
  const note = input.note.trim().slice(0, NOTE_MAX);
  if (!note) return null;
  const deliverable = await sql.get<{
    id: string; title: string; kind: string; organization_id: string; project_id: string | null; workspace_id: string;
  }>(
    "SELECT id, title, kind, organization_id, project_id, workspace_id FROM deliverables WHERE id = ?",
    [input.deliverableId],
  );
  if (!deliverable || deliverable.kind === "brief" || deliverable.kind === "design_system") return null;
  const space = await sql.get<{ slug: string; project_id: string | null }>(
    "SELECT slug, project_id FROM workspaces WHERE id = ?",
    [deliverable.workspace_id],
  );
  const item = input.itemId
    ? await sql.get<{ title: string }>("SELECT title FROM deliverable_items WHERE id = ? AND deliverable_id = ?", [
        input.itemId,
        deliverable.id,
      ])
    : undefined;
  const link = space ? `${clientOrigin()}/w/${space.slug}/work/${deliverable.id}` : null;
  const about = item?.title ? ` on "${item.title}"` : "";
  const who = input.author.kind === "client" ? "The client" : "The studio";
  const cardNote = `${who} asked for changes${about} (v${input.version}): ${note}${link ? `\nOpen it: ${link}` : ""}`;

  // The latest card that built this piece: its owner and skill packs carry over.
  const source = await sql.get<{ id: string; project_id: string | null; round: number; assignee_agent_id: string | null }>(
    "SELECT id, project_id, round, assignee_agent_id FROM tasks WHERE deliverable_id = ? ORDER BY round DESC, created_at DESC LIMIT 1",
    [deliverable.id],
  );
  // A change card from an earlier ask that nobody has finished or sent to review yet.
  const open = await sql.get<{ id: string; project_id: string | null; review_note: string | null }>(
    `SELECT t.id, t.project_id, t.review_note FROM tasks t
     WHERE t.deliverable_id = ? AND t.status != 'done' AND t.review_requested_at IS NULL
       AND EXISTS (
         SELECT 1 FROM activities a
         WHERE a.kind = ? AND a.organization_id = t.organization_id AND json_extract(a.data_json, '$.task_id') = t.id
       )
     ORDER BY t.created_at DESC LIMIT 1`,
    [deliverable.id, CLIENT_CHANGES_KIND],
  );

  let taskId: string;
  let projectId: string | null;
  const created = !open;
  if (open) {
    taskId = open.id;
    projectId = open.project_id;
    const merged = [open.review_note, cardNote].filter(Boolean).join("\n\n").slice(-4000);
    await sql.run("UPDATE tasks SET review_note = ?, updated_at = ? WHERE id = ?", [merged, input.now, taskId]);
  } else {
    taskId = crypto.randomUUID();
    const title = `Changes requested: ${deliverable.title}`.slice(0, 200);
    projectId = deliverable.project_id ?? space?.project_id ?? source?.project_id ?? null;
    const owner = source?.assignee_agent_id
      ? await liveClientAgent(sql, deliverable.organization_id, source.assignee_agent_id)
      : null;
    const assignee = owner?.id ?? (await leadAgentFor(sql, deliverable.organization_id));
    const position = await nextColumnPosition(sql, { organizationId: deliverable.organization_id, projectId, column: "todo" });
    await sql.run(
      `INSERT INTO tasks (
         id, project_id, organization_id, title, status, created_at, updated_at, stage, deliverable_id, round,
         skills_json, created_by_kind, position, assignee_agent_id, review_note
       ) VALUES (?, ?, ?, ?, 'todo', ?, ?, 'describe', ?, ?, '[]', 'agent', ?, ?, ?)`,
      [
        taskId, projectId, deliverable.organization_id, title, input.now, input.now, deliverable.id,
        (source?.round ?? 0) + 1, position, assignee, cardNote.slice(0, 4000),
      ],
    );
    if (source) {
      const packs = await cardSkillPacks(sql, source.id);
      if (packs.length) {
        await attachCardSkills(sql, { taskId, prefixes: packs, actor: { kind: "system", id: "client-review" }, now: input.now });
      }
    }
  }

  const dispatched = await dispatchTask(sql, {
    organizationId: deliverable.organization_id,
    projectId,
    taskId,
    // dispatchTask already says "Changes requested", so it gets the piece's title, not the card's.
    title: deliverable.title,
    reason: "changes",
    deliverableId: deliverable.id,
    note: cardNote,
    actor: { kind: "system", id: "client-review" },
    now: input.now,
  });

  const activityId = crypto.randomUUID();
  await sql.run(
    `INSERT INTO activities (id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      activityId,
      deliverable.organization_id,
      projectId,
      deliverable.workspace_id,
      CLIENT_CHANGES_KIND,
      input.author.kind === "client" ? "system" : "staff",
      input.author.id,
      `${who} asked for changes on "${deliverable.title}"${about}: ${note}`.slice(0, 2000),
      JSON.stringify({
        deliverable_id: deliverable.id,
        version: input.version,
        item_id: input.itemId,
        item_title: item?.title ?? null,
        feedback_id: input.feedbackId,
        task_id: taskId,
        created,
        to: dispatched.agentId,
        dispatch_id: dispatched.activityId,
        author_kind: input.author.kind,
        note,
        url: link,
      }),
      input.now,
    ],
  );
  return { taskId, created, agentId: dispatched.agentId, activityId };
}
