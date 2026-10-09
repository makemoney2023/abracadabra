import type { Sql } from "./sql";

export type WorkRequest = {
  id: string;
  organization_id: string;
  channel: string;
  thread_id: string;
  sender: string;
  body: string;
  state: string;
  piece_title: string | null;
  goal: string | null;
  due_text: string | null;
  question_count: number;
  decided_by: string | null;
  decided_at: number | null;
  decline_reason: string | null;
  brief_version: number | null;
  created_at: number;
  updated_at: number;
};

export type WorkRequestState = "clarifying" | "proposed" | "approved" | "declined";

const REQUEST_COLUMNS = `id, organization_id, channel, thread_id, sender, body, state,
  piece_title, goal, due_text, question_count, decided_by, decided_at, decline_reason, brief_version,
  created_at, updated_at`;

export async function lookupSenders(sql: Sql, email: string): Promise<{ id: string; name: string; kind: string }[]> {
  const address = email.trim().toLowerCase();
  if (!address) return [];
  const contacts = await sql.all<{ id: string; name: string; kind: string }>(
    `SELECT DISTINCT o.id, o.name, o.kind FROM contacts c
     JOIN organizations o ON o.id = c.organization_id
     WHERE lower(c.email) = ? AND o.archived_at IS NULL`,
    [address],
  );
  const members = await sql.all<{ id: string; name: string; kind: string }>(
    `SELECT DISTINCT o.id, o.name, o.kind FROM memberships m
     JOIN workspaces w ON w.id = m.workspace_id
     JOIN organizations o ON o.id = w.organization_id
     WHERE lower(m.email) = ? AND m.revoked_at IS NULL AND o.archived_at IS NULL`,
    [address],
  );
  const byId = new Map<string, { id: string; name: string; kind: string }>();
  for (const row of [...contacts, ...members]) byId.set(row.id, row);
  return [...byId.values()];
}

export async function organizationForSenderThread(sql: Sql, threadId: string, sender: string): Promise<string | null> {
  const row = await sql.get<{ organization_id: string }>(
    `SELECT organization_id FROM work_requests
     WHERE thread_id = ? AND lower(sender) = ? AND state IN ('clarifying', 'proposed')
     ORDER BY updated_at DESC LIMIT 1`,
    [threadId, sender.trim().toLowerCase()],
  );
  return row?.organization_id ?? null;
}

export async function lookupSender(sql: Sql, email: string): Promise<string | null> {
  const address = email.trim().toLowerCase();
  if (!address) return null;
  const contact = await sql.get<{ organization_id: string }>(
    `SELECT organization_id FROM contacts
     WHERE lower(email) = ? AND organization_id IS NOT NULL LIMIT 1`,
    [address],
  );
  if (contact?.organization_id) return contact.organization_id;
  const member = await sql.get<{ organization_id: string }>(
    `SELECT w.organization_id AS organization_id
     FROM memberships m
     JOIN workspaces w ON w.id = m.workspace_id
     WHERE lower(m.email) = ? AND m.revoked_at IS NULL AND w.organization_id IS NOT NULL
     LIMIT 1`,
    [address],
  );
  return member?.organization_id ?? null;
}

const HOUR = 60 * 60 * 1000;

async function openRequest(sql: Sql, organizationId: string, threadId: string): Promise<WorkRequest | null> {
  return (
    (await sql.get<WorkRequest>(
      `SELECT ${REQUEST_COLUMNS} FROM work_requests
       WHERE organization_id = ? AND thread_id = ? AND state IN ('clarifying', 'proposed')
       ORDER BY created_at DESC LIMIT 1`,
      [organizationId, threadId],
    )) ?? null
  );
}

/** Replies sent on this thread in the last hour, and the open request so far. */
export async function threadState(
  sql: Sql,
  organizationId: string,
  threadId: string,
  now: number,
): Promise<{ replies: number; questionCount: number; text: string }> {
  const row = await sql.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM activities
     WHERE organization_id = ? AND kind = 'agent.reply' AND created_at > ?
       AND json_extract(data_json, '$.threadId') = ?`,
    [organizationId, now - HOUR, threadId],
  );
  const open = await openRequest(sql, organizationId, threadId);
  return { replies: row?.n ?? 0, questionCount: open?.question_count ?? 0, text: open?.body ?? "" };
}

/** Adds a client message to the thread's open request, or opens one. Writes the message and any reply to the timeline. */
export async function recordThreadMessage(
  sql: Sql,
  input: {
    organizationId: string;
    channel: "email" | "slack" | "hq_chat";
    threadId: string;
    sender: string;
    body: string;
    state: "clarifying" | "proposed";
    goal?: string | null;
    dueText?: string | null;
    asked?: boolean;
    replyBody?: string;
  },
  now: number,
): Promise<string> {
  const open = await openRequest(sql, input.organizationId, input.threadId);
  const asked = input.asked ? 1 : 0;
  let id: string;
  if (open) {
    id = open.id;
    await sql.run(
      `UPDATE work_requests
       SET body = ?, state = ?, goal = COALESCE(?, goal), due_text = COALESCE(?, due_text),
           question_count = question_count + ?, updated_at = ?
       WHERE id = ?`,
      [`${open.body}\n\n${input.body}`, input.state, input.goal ?? null, input.dueText ?? null, asked, now, id],
    );
  } else {
    id = crypto.randomUUID();
    await sql.run(
      `INSERT INTO work_requests (
        id, organization_id, channel, thread_id, sender, body, state,
        piece_title, goal, due_text, question_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      [
        id,
        input.organizationId,
        input.channel,
        input.threadId,
        input.sender,
        input.body,
        input.state,
        input.goal ?? null,
        input.dueText ?? null,
        asked,
        now,
        now,
      ],
    );
  }
  const data = JSON.stringify({ threadId: input.threadId, channel: input.channel, requestId: id });
  await sql.run(
    `INSERT INTO activities (
      id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
    ) VALUES (?, ?, 'client.message', 'system', NULL, ?, ?, ?)`,
    [crypto.randomUUID(), input.organizationId, input.body, data, now],
  );
  if (input.replyBody) {
    await sql.run(
      `INSERT INTO activities (
        id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
      ) VALUES (?, ?, 'agent.reply', 'agent', 'client-desk', ?, ?, ?)`,
      [crypto.randomUUID(), input.organizationId, input.replyBody, data, now],
    );
  }
  return id;
}

export async function recordUnknownSender(sql: Sql, input: { organizationId: string; sender: string }, now: number): Promise<void> {
  await sql.run(
    `INSERT INTO activities (
      id, organization_id, kind, actor_kind, actor_id, body, created_at
    ) VALUES (?, ?, 'agent.note', 'agent', 'client-desk', ?, ?)`,
    [crypto.randomUUID(), input.organizationId, input.sender, now],
  );
}

export type ThreadMessage = {
  id: string;
  kind: string;
  body: string | null;
  actorKind: string;
  createdAt: number;
};

export type ClientThread = WorkRequest & { messages: ThreadMessage[] };

/** Threads for one client, newest first, each with its timeline messages in order. */
export async function listClientThreads(sql: Sql, organizationId: string): Promise<ClientThread[]> {
  const requests = await listWorkRequests(sql, organizationId);
  const threads: ClientThread[] = [];
  for (const request of requests) {
    const messages = await sql.all<ThreadMessage>(
      `SELECT id, kind, body, actor_kind AS actorKind, created_at AS createdAt
       FROM activities
       WHERE organization_id = ? AND json_extract(data_json, '$.threadId') = ?
       ORDER BY created_at, rowid`,
      [organizationId, request.thread_id],
    );
    threads.push({ ...request, messages });
  }
  return threads;
}

/** A staff reply on the client's own channel. Sending the mail or Slack post is the caller's job. */
export async function recordStaffReply(
  sql: Sql,
  input: { organizationId: string; userId: string; threadId: string; channel: string; body: string },
  now: number,
): Promise<void> {
  const body = input.body.trim();
  if (!body) return;
  await sql.run(
    `INSERT INTO activities (
      id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
    ) VALUES (?, ?, 'staff.reply', 'staff', ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.organizationId,
      input.userId,
      body,
      JSON.stringify({ threadId: input.threadId, channel: input.channel, via: "hq" }),
      now,
    ],
  );
}

export async function listWorkRequests(sql: Sql, organizationId: string): Promise<WorkRequest[]> {
  return sql.all<WorkRequest>(
    `SELECT ${REQUEST_COLUMNS} FROM work_requests WHERE organization_id = ? ORDER BY updated_at DESC`,
    [organizationId],
  );
}

export async function workRequestById(sql: Sql, id: string): Promise<WorkRequest | null> {
  return (await sql.get<WorkRequest>(`SELECT ${REQUEST_COLUMNS} FROM work_requests WHERE id = ?`, [id])) ?? null;
}

export async function setWorkRequestState(
  sql: Sql,
  id: string,
  decision: {
    state: WorkRequestState;
    decidedBy?: string;
    declineReason?: string;
    pieceTitle?: string;
    briefVersion?: number;
  },
  now: number,
): Promise<void> {
  const decided = decision.state === "approved" || decision.state === "declined";
  await sql.run(
    `UPDATE work_requests
     SET state = ?, decided_by = ?, decided_at = ?, decline_reason = ?,
         piece_title = COALESCE(?, piece_title), brief_version = COALESCE(?, brief_version), updated_at = ?
     WHERE id = ?`,
    [
      decision.state,
      decided ? (decision.decidedBy ?? null) : null,
      decided ? now : null,
      decision.declineReason ?? null,
      decision.pieceTitle ?? null,
      decision.briefVersion ?? null,
      now,
      id,
    ],
  );
}

export async function linkSlackChannel(sql: Sql, channelId: string, organizationId: string, now: number): Promise<void> {
  await sql.run(
    `INSERT INTO slack_channel_links (channel_id, organization_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT(channel_id) DO UPDATE SET organization_id = excluded.organization_id`,
    [channelId, organizationId, now],
  );
}

/** A staff post in a client channel. Logged, and not answered. */
export async function recordStaffChannelNote(
  sql: Sql,
  input: { organizationId: string; threadId: string; sender: string; body: string },
  now: number,
): Promise<void> {
  await sql.run(
    `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, 'client.message', 'system', NULL, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.organizationId,
      input.body,
      JSON.stringify({ threadId: input.threadId, channel: "slack", staff: true }),
      now,
    ],
  );
}

/** One note the first time an unlinked Slack channel writes. Later posts stay quiet. */
export async function noteUnlinkedChannel(sql: Sql, channelId: string, now: number): Promise<boolean> {
  const prior = await sql.get<{ id: string }>(
    `SELECT id FROM activities
     WHERE kind = 'agent.note' AND json_extract(data_json, '$.unlinkedChannel') = ? LIMIT 1`,
    [channelId],
  );
  if (prior) return false;
  await sql.run(
    `INSERT INTO activities (id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, 'agent.note', 'agent', 'client-desk', ?, ?, ?)`,
    [crypto.randomUUID(), channelId, JSON.stringify({ unlinkedChannel: channelId }), now],
  );
  return true;
}

export type DeskContext = {
  name: string;
  brief: string;
  status: string;
  requests: { body: string; state: string; goal: string | null; due: string | null }[];
  messages: { kind: string; body: string }[];
};

const EMPTY_DESK: DeskContext = { name: "", brief: "", status: "", requests: [], messages: [] };

/** Published work for one client. A missing organization looks like an empty desk. */
export async function deskContext(sql: Sql, organizationId: string, threadId: string): Promise<DeskContext> {
  const org = await sql.get<{ name: string }>("SELECT name FROM organizations WHERE id = ?", [organizationId]);
  if (!org) return EMPTY_DESK;
  const brief = await sql.get<{ copy_text: string | null }>(
    `SELECT di.copy_text
     FROM deliverables d
     JOIN deliverable_items di ON di.deliverable_id = d.id AND di.version = d.published_version
     WHERE d.organization_id = ? AND d.kind = 'brief' AND d.published_version IS NOT NULL
       AND di.title = 'brief.md'
     ORDER BY d.published_at DESC
     LIMIT 1`,
    [organizationId],
  );
  const status = await sql.get<{ body: string }>(
    `SELECT body FROM status_updates
     WHERE organization_id = ? AND audience = 'client' AND state = 'published'
     ORDER BY published_at DESC
     LIMIT 1`,
    [organizationId],
  );
  const requests = await sql.all<{ body: string; state: string; goal: string | null; due_text: string | null }>(
    `SELECT body, state, goal, due_text FROM work_requests
     WHERE organization_id = ? AND state IN ('clarifying', 'proposed')
     ORDER BY updated_at, rowid`,
    [organizationId],
  );
  const messages = await sql.all<{ kind: string; body: string | null }>(
    `SELECT kind, body FROM activities
     WHERE organization_id = ? AND json_extract(data_json, '$.threadId') = ?
     ORDER BY created_at, rowid`,
    [organizationId, threadId],
  );
  return {
    name: org.name,
    brief: brief?.copy_text ?? "",
    status: status?.body ?? "",
    requests: requests.map((row) => ({ body: row.body, state: row.state, goal: row.goal, due: row.due_text })),
    messages: messages.flatMap((row) => (row.body ? [{ kind: row.kind, body: row.body }] : [])),
  };
}

export async function organizationForSlackChannel(sql: Sql, channelId: string): Promise<string | null> {
  const row = await sql.get<{ organization_id: string }>(
    "SELECT organization_id FROM slack_channel_links WHERE channel_id = ?",
    [channelId],
  );
  return row?.organization_id ?? null;
}
