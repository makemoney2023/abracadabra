import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { issueDownload } from "@/lib/downloads";
import {
  chunkText,
  issueKnowledgeKey,
  listFileReads,
  principalForKnowledgeKey,
  readSpaceFiles,
  searchSpace,
  wordsFromBytes,
  type Understander,
} from "@/lib/knowledge";
import { previewKind, previewableStatus } from "@/lib/preview";
import { LIMITS } from "@/lib/policy/limits";
import { getCaller } from "@/lib/session";
import { POST as mcp } from "@/app/api/mcp/route";
import { GET as preview } from "@/app/api/files/[fileId]/preview/route";
import { embedFromGatewayBody, gatewayUnderstander, summaryFromChatBody } from "@/lib/ai-gateway";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const BATCH = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";
const PICTURE = "44444444-4444-4444-8444-444444444444";

const owner: Caller = {
  userId: "user-owner",
  staff: null,
  operatorOf: [],
  memberships: [{ workspaceId: WORKSPACE, role: "client_owner" }],
};

const member: Caller = {
  userId: "user-member",
  staff: null,
  operatorOf: [],
  memberships: [{ workspaceId: WORKSPACE, role: "client_member" }],
};

const reader: Understander = {
  async summarize(fileName, text) {
    return `Notes on ${fileName}: ${text.slice(0, 48)}`;
  },
  async embed(texts) {
    return texts.map((text) => [text.length, text.toLowerCase().includes("blue") ? 1 : 0]);
  },
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("preview kinds", () => {
  it("shows pictures, pdfs, and text, and hides active web files", () => {
    expect(previewKind("logo.png")).toBe("image");
    expect(previewKind("notes/brief.PDF")).toBe("pdf");
    expect(previewKind("copy/hello.txt")).toBe("text");
    expect(previewKind("page.html")).toBe("none");
    expect(previewKind("mark.svg")).toBe("none");
    expect(previewableStatus("uploaded")).toBe(true);
    expect(previewableStatus("held")).toBe(true);
    expect(previewableStatus("rejected")).toBe(false);
    expect(previewableStatus("pending")).toBe(false);
  });
});

describe("words and chunks", () => {
  it("reads text and simple PDF words, and splits long text", () => {
    const notes = wordsFromBytes("brief.txt", new TextEncoder().encode("Our brand colors are blue and gold."));
    expect(notes).toEqual({ ok: true, text: "Our brand colors are blue and gold." });
    const pdf = new TextEncoder().encode("stream (Our brand colors are blue and gold.) endstream");
    const fromPdf = wordsFromBytes("brief.pdf", pdf);
    expect(fromPdf.ok).toBe(true);
    if (fromPdf.ok) expect(fromPdf.text).toContain("blue and gold");
    expect(wordsFromBytes("logo.png", new Uint8Array([1, 2, 3])).ok).toBe(false);
    expect(chunkText("a".repeat(1700)).length).toBeGreaterThan(1);
  });
});

describe("space knowledge", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    delete process.env.HANDOFF_OBJECT_PATH;
    delete process.env.HANDOFF_SIGNING_SECRET;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  async function db(): Promise<Sql> {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = mkdtempSync(path.join(tmpdir(), "handoff-knowledge-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    process.env.HANDOFF_OBJECT_PATH = path.join(directory, "objects");
    process.env.HANDOFF_SIGNING_SECRET = "test-signing-secret";
    const sql = await openHandoffDb();
    await migrate(sql);
    return sql;
  }

  async function seed(sql: Sql): Promise<void> {
    const createdAt = Date.now() - 60_000;
    for (const [id, slug] of [
      [WORKSPACE, "strongfoam"],
      [OTHER, "other"],
    ] as const) {
      await sql.run(
        `INSERT INTO workspaces (
          id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
          quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purged_at
        ) VALUES (?, ?, ?, ?, NULL, 'Studio', 'standard', ?, ?, 0, 'active', ?, NULL, NULL)`,
        [id, slug, slug, slug, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, createdAt],
      );
    }
    await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-owner', 'owner@example.com', ?)", [
      createdAt,
    ]);
    await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-member', 'member@example.com', ?)", [
      createdAt,
    ]);
    await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-out', 'out@example.com', ?)", [
      createdAt,
    ]);
    const signedAt = Date.now();
    for (const [id, token] of [
      ["user-owner", "owner-token"],
      ["user-member", "member-token"],
      ["user-out", "out-token"],
    ] as const) {
      await sql.run(
        `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        [`sess-${id}`, id, await sha256Hex(token), signedAt, signedAt + LIMITS.sessionTtlMs],
      );
    }
    await sql.run(
      `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
       VALUES ('mem-owner', ?, 'user-owner', 'owner@example.com', 'client_owner', ?, NULL)`,
      [WORKSPACE, createdAt],
    );
    await sql.run(
      `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at)
       VALUES ('mem-member', ?, 'user-member', 'member@example.com', 'client_member', ?, NULL)`,
      [WORKSPACE, createdAt],
    );
    await sql.run(
      `INSERT INTO batches (
        id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
      ) VALUES (?, ?, NULL, 'user-owner', 'Drop', NULL, ?, ?, NULL, NULL)`,
      [BATCH, WORKSPACE, createdAt, createdAt],
    );
    await sql.run(
      `INSERT INTO files (
        id, batch_id, workspace_id, relative_path, extension, declared_content_type, size_bytes,
        object_key, tag, status, sha256, scan_attempts, created_at
      ) VALUES (?, ?, ?, 'brief.txt', 'txt', 'text/plain', 32, ?, 'copy', 'uploaded', NULL, 0, ?)`,
      [FILE, BATCH, WORKSPACE, `${WORKSPACE}/${BATCH}/${FILE}`, createdAt],
    );
    await sql.run(
      `INSERT INTO files (
        id, batch_id, workspace_id, relative_path, extension, declared_content_type, size_bytes,
        object_key, tag, status, sha256, scan_attempts, created_at
      ) VALUES (?, ?, ?, 'logo.png', 'png', 'image/png', 4, ?, 'brand', 'uploaded', NULL, 0, ?)`,
      [PICTURE, BATCH, WORKSPACE, `${WORKSPACE}/${BATCH}/${PICTURE}`, createdAt],
    );
  }

  it("indexes text through the reader and does not invent a summary when reading is off", async () => {
    const sql = await db();
    await seed(sql);
    const bytes = new Map<string, Uint8Array>([
      [`${WORKSPACE}/${BATCH}/${FILE}`, new TextEncoder().encode("Our brand colors are blue and gold.")],
      [`${WORKSPACE}/${BATCH}/${PICTURE}`, new Uint8Array([1, 2, 3, 4])],
    ]);
    const readBytes = async (key: string) => bytes.get(key) ?? null;
    const waiting = await readSpaceFiles({
      sql,
      caller: owner,
      workspaceId: WORKSPACE,
      now: Date.now(),
      understander: null,
      readBytes,
    });
    expect(waiting.ok).toBe(true);
    if (!waiting.ok) return;
    expect(waiting.waiting).toBe(1);
    const summary = await sql.get<{ summary: string | null; status: string }>(
      "SELECT summary, status FROM file_reads WHERE file_id = ?",
      [FILE],
    );
    expect(summary).toEqual({ summary: null, status: "waiting" });

    const ready = await readSpaceFiles({
      sql,
      caller: owner,
      workspaceId: WORKSPACE,
      now: Date.now(),
      understander: reader,
      readBytes,
    });
    expect(ready.ok).toBe(true);
    if (!ready.ok) return;
    expect(ready.ready).toBe(1);
    expect(ready.skipped).toBe(1);
    const row = await sql.get<{ summary: string; status: string }>(
      "SELECT summary, status FROM file_reads WHERE file_id = ?",
      [FILE],
    );
    expect(row?.status).toBe("ready");
    expect(row?.summary).toContain("brief.txt");
    const found = await searchSpace({
      sql,
      workspaceId: WORKSPACE,
      query: "What blue colors do we use?",
      understander: reader,
    });
    expect(found[0]?.fileName).toBe("brief.txt");
    expect(found[0]?.passage).toContain("blue");
    const other = await searchSpace({
      sql,
      workspaceId: OTHER,
      query: "blue",
      understander: reader,
    });
    expect(other).toEqual([]);
    const refused = await readSpaceFiles({
      sql,
      caller: member,
      workspaceId: WORKSPACE,
      now: Date.now(),
      understander: reader,
      readBytes,
    });
    expect(refused.ok).toBe(false);
  });

  it("hides a deleted file from the reading list and from search", async () => {
    const sql = await db();
    await seed(sql);
    const bytes = new Map<string, Uint8Array>([
      [`${WORKSPACE}/${BATCH}/${FILE}`, new TextEncoder().encode("Our brand colors are blue and gold.")],
    ]);
    await readSpaceFiles({
      sql,
      caller: owner,
      workspaceId: WORKSPACE,
      now: Date.now(),
      understander: reader,
      readBytes: async (key) => bytes.get(key) ?? null,
    });
    await sql.run("UPDATE files SET object_deleted_at = ? WHERE id = ?", [Date.now(), FILE]);
    const listed = await listFileReads(sql, WORKSPACE);
    expect(listed.map((row) => row.name)).not.toContain("brief.txt");
    const found = await searchSpace({
      sql,
      workspaceId: WORKSPACE,
      query: "blue and gold",
      understander: null,
    });
    expect(found).toEqual([]);
  });

  it("keeps download closed while an uploaded file can still be previewed", async () => {
    const sql = await db();
    await seed(sql);
    const { openObjectStore } = await import("@/lib/store/objects");
    const bytes = new Uint8Array([137, 80, 78, 71]);
    await openObjectStore().put(`${WORKSPACE}/${BATCH}/${PICTURE}`, bytes);
    const download = await issueDownload({
      sql,
      caller: await getCaller(sql, "owner-token", Date.now()),
      batchId: BATCH,
      fileId: PICTURE,
      origin: "https://handoff.example",
      now: Date.now(),
    });
    expect(download.ok).toBe(false);
    const shown = await preview(new Request("https://handoff.example/api/files/" + PICTURE + "/preview", {
      headers: { cookie: "handoff_session=owner-token" },
    }), { params: Promise.resolve({ fileId: PICTURE }) });
    expect(shown.status).toBe(200);
    expect(shown.headers.get("content-type")).toBe("image/png");
    expect(shown.headers.get("content-disposition")).toContain("inline");
    expect(new Uint8Array(await shown.arrayBuffer())).toEqual(bytes);
    const hidden = await preview(new Request("https://handoff.example/api/files/" + PICTURE + "/preview", {
      headers: { cookie: "handoff_session=out-token" },
    }), { params: Promise.resolve({ fileId: PICTURE }) });
    expect(hidden.status).toBe(404);
  });

  it("answers a project key only for that space", async () => {
    const sql = await db();
    await seed(sql);
    const bytes = new Map<string, Uint8Array>([
      [`${WORKSPACE}/${BATCH}/${FILE}`, new TextEncoder().encode("Our brand colors are blue and gold.")],
    ]);
    await readSpaceFiles({
      sql,
      caller: owner,
      workspaceId: WORKSPACE,
      now: Date.now(),
      understander: reader,
      readBytes: async (key) => bytes.get(key) ?? null,
    });
    const issued = await issueKnowledgeKey({
      sql,
      caller: owner,
      workspaceId: WORKSPACE,
      now: Date.now(),
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const response = await mcp(
      new Request("https://handoff.example/api/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${issued.token}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "search_files", arguments: { query: "blue" } },
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { result: { content: { text: string }[] } };
    expect(body.result.content[0]?.text).toContain("blue");
    const denied = await mcp(
      new Request("https://handoff.example/api/mcp", {
        method: "POST",
        headers: { authorization: "Bearer hk_not-a-real-key", "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );
    expect(denied.status).toBe(401);
  });

  it("treats a deployment key as the agent and a project key as one space", async () => {
    const sql = await db();
    await seed(sql);
    const issued = await issueKnowledgeKey({
      sql,
      caller: owner,
      workspaceId: WORKSPACE,
      now: Date.now(),
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    await expect(principalForKnowledgeKey(sql, issued.token)).resolves.toEqual({
      kind: "workspace",
      workspaceId: WORKSPACE,
    });

    const agentToken = "hk_agent-deployment-key";
    await sql.run(
      `INSERT INTO knowledge_keys (
        id, workspace_id, token_hash, label, created_at, revoked_at, scopes, can_publish, organization_id
      ) VALUES ('key-agent', ?, ?, 'HQ agent', ?, NULL, 'read,work', 0, NULL)`,
      [WORKSPACE, await sha256Hex(agentToken), Date.now()],
    );
    await expect(principalForKnowledgeKey(sql, agentToken)).resolves.toEqual({
      kind: "agent",
      keyId: "key-agent",
      scopes: ["read", "work"],
    });
    await sql.run("UPDATE knowledge_keys SET revoked_at = ? WHERE id = 'key-agent'", [Date.now()]);
    await expect(principalForKnowledgeKey(sql, agentToken)).resolves.toBeNull();
  });
});

describe("agent read tools", () => {
  let directory = "";
  const org = "org-foam";
  const stranger = "org-stranger";
  const archived = "org-archived";
  const spaceA = "ws-foam-a";
  const spaceB = "ws-foam-b";
  const spaceC = "ws-stranger";
  const agentToken = "hk_agent-mcp-read";
  const spaceToken = "hk_space-mcp-read";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    delete process.env.HANDOFF_OBJECT_PATH;
    delete process.env.HANDOFF_SIGNING_SECRET;
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  async function db(): Promise<Sql> {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = mkdtempSync(path.join(tmpdir(), "handoff-agent-read-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    process.env.HANDOFF_OBJECT_PATH = path.join(directory, "objects");
    process.env.HANDOFF_SIGNING_SECRET = "test-signing-secret";
    const sql = await openHandoffDb();
    await migrate(sql);
    return sql;
  }

  async function seed(sql: Sql): Promise<void> {
    const now = 1_700_000_000_000;
    await sql.run(
      `INSERT INTO organizations (id, name, website, industry, kind, notes, created_at, updated_at, archived_at)
       VALUES (?, 'Foam Co', 'https://foam.example', 'packaging', 'client', 'Prefers email.', ?, ?, NULL)`,
      [org, now, now],
    );
    await sql.run(
      `INSERT INTO organizations (id, name, kind, created_at, updated_at, archived_at)
       VALUES (?, 'Stranger Co', 'client', ?, ?, NULL)`,
      [stranger, now, now],
    );
    await sql.run(
      `INSERT INTO organizations (id, name, kind, created_at, updated_at, archived_at)
       VALUES (?, 'Old Co', 'past_client', ?, ?, ?)`,
      [archived, now, now, now],
    );
    for (const [id, slug, organizationId] of [
      [spaceA, "foam-a", org],
      [spaceB, "foam-b", org],
      [spaceC, "stranger", stranger],
    ] as const) {
      await sql.run(
        `INSERT INTO workspaces (
          id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
          quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purged_at, organization_id
        ) VALUES (?, ?, ?, ?, NULL, 'Studio', 'standard', ?, ?, 0, 'active', ?, NULL, NULL, ?)`,
        [id, slug, slug, slug, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, now, organizationId],
      );
    }
    await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-owner', 'owner@example.com', ?)", [now]);
    for (const [batch, workspace] of [
      ["batch-a", spaceA],
      ["batch-b", spaceB],
      ["batch-c", spaceC],
    ] as const) {
      await sql.run(
        `INSERT INTO batches (
          id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
        ) VALUES (?, ?, NULL, 'user-owner', 'Drop', NULL, ?, ?, NULL, NULL)`,
        [batch, workspace, now, now],
      );
    }
    const files: [string, string, string, string, string][] = [
      ["file-brief", "batch-a", spaceA, "brief.txt", "copy"],
      ["file-logo", "batch-a", spaceA, "logo.png", "brand"],
      ["file-notes", "batch-b", spaceB, "notes.txt", "copy"],
      ["file-secret", "batch-c", spaceC, "secret.txt", "copy"],
    ];
    for (const [id, batch, workspace, name, tag] of files) {
      await sql.run(
        `INSERT INTO files (
          id, batch_id, workspace_id, relative_path, extension, declared_content_type, size_bytes,
          object_key, tag, status, sha256, scan_attempts, created_at
        ) VALUES (?, ?, ?, ?, 'txt', 'text/plain', 8, ?, ?, 'uploaded', NULL, 0, ?)`,
        [id, batch, workspace, name, `${workspace}/${batch}/${id}`, tag, now],
      );
      await sql.run(
        `INSERT INTO file_reads (file_id, workspace_id, status, summary, reason, source_sha, read_at)
         VALUES (?, ?, 'ready', ?, NULL, NULL, ?)`,
        [id, workspace, `Notes on ${name}`, now],
      );
    }
    await sql.run(
      `INSERT INTO knowledge_keys (
        id, workspace_id, token_hash, label, created_at, revoked_at, scopes, can_publish, organization_id
      ) VALUES ('key-agent-read', ?, ?, 'HQ agent', ?, NULL, 'read,work', 0, NULL)`,
      [spaceA, await sha256Hex(agentToken), now],
    );
    await sql.run(
      `INSERT INTO knowledge_keys (
        id, workspace_id, token_hash, label, created_at, revoked_at, scopes, can_publish, organization_id
      ) VALUES ('key-space-read', ?, ?, 'Project key', ?, NULL, 'read', 0, NULL)`,
      [spaceA, await sha256Hex(spaceToken), now],
    );
    await sql.run(
      `INSERT INTO deals (
        id, organization_id, title, stage, source, created_at, updated_at, closed_at
      ) VALUES ('deal-1', ?, 'Website rebuild', 'won', 'inbound', ?, ?, ?)`,
      [org, now, now, now],
    );
    await sql.run(
      `INSERT INTO assessments (
        id, organization_id, answers_json, scores_json, total_score, completed_at, received_at
      ) VALUES (
        'assess-1', ?, ?, ?, 42, ?, ?
      )`,
      [
        org,
        JSON.stringify({ q1: "SECRET_ANSWER_DO_NOT_LEAK" }),
        JSON.stringify({
          overall: { total: 42, band: "forming" },
          readiness: { total: 40 },
          growth: { total: 55 },
          visibility: { total: 30 },
        }),
        now,
        now,
      ],
    );
    await sql.run(
      `INSERT INTO projects (id, organization_id, name, status, due_at, created_at, updated_at)
       VALUES ('project-1', ?, 'Site', 'active', ?, ?, ?)`,
      [org, now + 86_400_000, now, now],
    );
    await sql.run(
      `INSERT INTO milestones (id, project_id, name, due_at, done_at, sort)
       VALUES ('mile-1', 'project-1', 'Launch', ?, NULL, 0)`,
      [now + 86_400_000],
    );
    await sql.run(
      `INSERT INTO repos (
        id, github_repo_id, full_name, organization_id, project_id, default_branch, is_private, owned_by, created_at
      ) VALUES ('repo-1', 101, 'makemoney2023/foam', ?, 'project-1', 'main', 1, 'agency', ?)`,
      [org, now],
    );
    await sql.run(
      `INSERT INTO deliverables (
        id, organization_id, project_id, workspace_id, title, kind, status, version,
        actor_kind, created_at, updated_at, published_version
      ) VALUES (
        'del-brief', ?, 'project-1', ?, 'Client brief', 'brief', 'in_review', 2,
        'staff', ?, ?, NULL
      )`,
      [org, spaceA, now, now],
    );
    await sql.run(
      `INSERT INTO deliverable_items (
        id, deliverable_id, version, format, title, copy_text, media_json, status, sort
      ) VALUES ('item-brief', 'del-brief', 2, 'page', 'brief.md', 'The client sells foam.', '[]', 'pending', 0)`,
    );
    await sql.run(
      `INSERT INTO deliverable_feedback (
        id, deliverable_id, item_id, version, author_kind, decision, body, created_at
      ) VALUES ('fb-1', 'del-brief', 'item-brief', 2, 'client', 'changes', 'Make the headline shorter.', ?)`,
      [now],
    );
    await sql.run(
      `INSERT INTO tasks (
        id, organization_id, project_id, title, status, created_at, updated_at,
        stage, deliverable_id, round, skills_json, created_by_kind
      ) VALUES (
        'task-1', ?, 'project-1', 'Write the homepage', 'todo', ?, ?,
        'describe', 'del-brief', 1, ?, 'agent'
      )`,
      [org, now, now, JSON.stringify({ steps: [{ path: "copywriting", mode: "complete", status: "todo" }] })],
    );
    await sql.run(
      `INSERT INTO activities (id, organization_id, kind, actor_kind, body, data_json, created_at)
       VALUES ('act-1', ?, 'staff.instruction', 'staff', 'Use the gold logo.', ?, ?)`,
      [org, JSON.stringify({ taskId: "task-1" }), now],
    );
    await sql.run(
      `INSERT INTO agent_questions (id, organization_id, task_id, question, asked_at, answered_at)
       VALUES ('q-open', ?, 'task-1', 'Which gold?', ?, NULL)`,
      [org, now],
    );
    await sql.run(
      `INSERT INTO agent_questions (id, organization_id, task_id, question, answer, asked_at, answered_at)
       VALUES ('q-done', ?, 'task-1', 'Logo file?', 'logo.png', ?, ?)`,
      [org, now - 1000, now],
    );
  }

  async function call(token: string, method: string, params?: unknown) {
    const response = await mcp(
      new Request("https://handoff.example/api/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
    return response.json() as Promise<{
      result?: { tools?: { name: string }[]; content?: { text: string }[] };
      error?: { code: number; message: string };
    }>;
  }

  function payload(body: { result?: { content?: { text: string }[] } }): unknown {
    return JSON.parse(body.result?.content?.[0]?.text ?? "");
  }

  it("lets an agent read one live client and keeps survey answers out", async () => {
    const sql = await db();
    await seed(sql);
    const listed = await call(agentToken, "tools/list");
    const names = listed.result?.tools?.map((tool) => tool.name) ?? [];
    expect(names).toEqual(expect.arrayContaining(["client_context", "get_brief", "list_feedback"]));

    await sql.run("UPDATE projects SET description = ? WHERE id = 'project-1'", [
      "Landing page and three ad sizes.",
    ]);
    const context = await call(agentToken, "tools/call", {
      name: "client_context",
      arguments: { organizationId: org },
    });
    const text = context.result?.content?.[0]?.text ?? "";
    expect(text).not.toContain("SECRET_ANSWER_DO_NOT_LEAK");
    expect(text).not.toContain("answers_json");
    const body = payload(context) as {
      organization: { name: string; briefApproval: string };
      deal: { title: string; wonAt: number };
      assessment: { totalScore: number; answerSummary: string };
      project: { milestones: { name: string }[]; description: string | null };
      projects: { id: string; description: string | null }[];
      workspaces: { slug: string; fileCounts: { clean: number } }[];
      repos: { fullName: string }[];
      briefs: { kind: string; version: number }[];
      tasks: { title: string; staffNotes: string[]; skills: { path: string }[] }[];
      openQuestions: { question: string }[];
      answeredSince: { answer: string }[];
    };
    expect(body.organization.name).toBe("Foam Co");
    expect(body.organization.briefApproval).toBe("client");
    expect(body.deal.wonAt).toBe(1_700_000_000_000);
    expect(body.assessment.totalScore).toBe(42);
    expect(body.assessment.answerSummary).toContain("42");
    expect(body.assessment.answerSummary).toContain("forming");
    expect(body.project.milestones[0]?.name).toBe("Launch");
    expect(body.project.description).toBe("Landing page and three ad sizes.");
    expect(body.projects.find((row) => row.id === "project-1")?.description).toBe(
      "Landing page and three ad sizes.",
    );
    expect(body.workspaces.map((space) => space.slug).sort()).toEqual(["foam-a", "foam-b"]);
    expect(body.workspaces.find((space) => space.slug === "foam-a")?.fileCounts.clean).toBe(2);
    expect(body.repos[0]?.fullName).toBe("makemoney2023/foam");
    expect(body.briefs[0]).toMatchObject({ kind: "brief", version: 2 });
    expect(body.tasks[0]?.staffNotes).toEqual(["Use the gold logo."]);
    expect(body.tasks[0]?.skills[0]?.path).toBe("copywriting");
    expect(body.openQuestions[0]?.question).toBe("Which gold?");
    expect(body.answeredSince[0]?.answer).toBe("logo.png");

    const brief = payload(
      await call(agentToken, "tools/call", {
        name: "get_brief",
        arguments: { organizationId: org, kind: "brief" },
      }),
    ) as { body: string; changes: { body: string }[] };
    expect(brief.body).toBe("The client sells foam.");
    expect(brief.changes[0]?.body).toBe("Make the headline shorter.");

    const feedback = payload(
      await call(agentToken, "tools/call", {
        name: "list_feedback",
        arguments: { organizationId: org, deliverableId: "del-brief" },
      }),
    ) as { itemId: string; decision: string }[];
    expect(feedback[0]).toMatchObject({ itemId: "item-brief", decision: "changes" });

    const missing = await call(agentToken, "tools/call", {
      name: "client_context",
      arguments: { organizationId: archived },
    });
    expect(missing.error?.code).toBe(-32602);
  });

  it("refuses a project key that asks for another organization or a work tool", async () => {
    const sql = await db();
    await seed(sql);
    const context = await call(spaceToken, "tools/call", {
      name: "client_context",
      arguments: { organizationId: org },
    });
    expect(context.error?.code).toBe(-32001);
    const crossed = await call(spaceToken, "tools/call", {
      name: "list_files",
      arguments: { organizationId: org },
    });
    expect(crossed.error?.code).toBe(-32001);
    const work = await call(spaceToken, "tools/call", {
      name: "save_brief",
      arguments: { organizationId: org },
    });
    expect(work.error?.code).toBe(-32001);
    const deleted = await call(spaceToken, "tools/call", {
      name: "delete_task",
      arguments: { organizationId: org, taskId: "task-1", requestId: "req-del-space" },
    });
    expect(deleted.error?.code).toBe(-32001);
    const own = await call(spaceToken, "tools/call", { name: "list_files", arguments: {} });
    const text = own.result?.content?.[0]?.text ?? "";
    expect(text).toContain("brief.txt");
    expect(text).toContain("logo.png");
    expect(text).not.toContain("notes.txt");
    expect(text).not.toContain("secret.txt");
  });

  it("lists every space of the organization and honors a tag", async () => {
    const sql = await db();
    await seed(sql);
    const all = payload(
      await call(agentToken, "tools/call", {
        name: "list_files",
        arguments: { organizationId: org },
      }),
    ) as { name: string; tag: string; summary: string; relativePath: string }[];
    expect(all.map((row) => row.name).sort()).toEqual(["brief.txt", "logo.png", "notes.txt"]);
    expect(all.every((row) => row.summary.startsWith("Notes on"))).toBe(true);
    expect(all.find((row) => row.name === "brief.txt")?.relativePath).toBe("brief.txt");

    const brand = payload(
      await call(agentToken, "tools/call", {
        name: "list_files",
        arguments: { organizationId: org, tag: "brand" },
      }),
    ) as { name: string; tag: string }[];
    expect(brand).toEqual([{ name: "logo.png", tag: "brand", summary: "Notes on logo.png", relativePath: "logo.png", status: "ready" }]);

    const otherSpace = await call(agentToken, "tools/call", {
      name: "list_files",
      arguments: { organizationId: org, workspaceId: spaceC },
    });
    expect(otherSpace.error?.code).toBe(-32001);

    const taggedSpace = payload(
      await call(spaceToken, "tools/call", {
        name: "list_files",
        arguments: { tag: "brand" },
      }),
    );
    const taggedText = JSON.stringify(taggedSpace);
    expect(taggedText).toContain("logo.png");
    expect(taggedText).not.toContain("brief.txt");
  });
});

describe("agent work tools", () => {
  let directory = "";
  const org = "org-work";
  const stranger = "org-work-stranger";
  const space = "ws-work";
  const otherSpace = "ws-work-stranger";
  const agentToken = "hk_agent-mcp-work";

  afterEach(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = "";
  });

  async function db(): Promise<Sql> {
    if (directory) rmSync(directory, { recursive: true, force: true });
    directory = mkdtempSync(path.join(tmpdir(), "handoff-agent-work-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    process.env.HANDOFF_OBJECT_PATH = path.join(directory, "objects");
    process.env.HANDOFF_SIGNING_SECRET = "test-signing-secret";
    const sql = await openHandoffDb();
    await migrate(sql);
    return sql;
  }

  async function seed(sql: Sql): Promise<void> {
    const now = 1_700_000_000_000;
    for (const [id, name] of [
      [org, "Foam Co"],
      [stranger, "Stranger Co"],
    ] as const) {
      await sql.run(
        `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES (?, ?, 'client', ?, ?)`,
        [id, name, now, now],
      );
    }
    for (const [id, slug, organizationId] of [
      [space, "foam-work", org],
      [otherSpace, "stranger-work", stranger],
    ] as const) {
      await sql.run(
        `INSERT INTO workspaces (
          id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
          quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purged_at, organization_id
        ) VALUES (?, ?, ?, ?, NULL, 'Studio', 'standard', ?, ?, 0, 'active', ?, NULL, NULL, ?)`,
        [id, slug, slug, slug, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, now, organizationId],
      );
    }
    await sql.run(
      `INSERT INTO projects (id, organization_id, name, status, created_at, updated_at)
       VALUES ('project-work', ?, 'Site', 'active', ?, ?)`,
      [org, now, now],
    );
    await sql.run(
      `INSERT INTO projects (id, organization_id, name, status, created_at, updated_at)
       VALUES ('project-stranger', ?, 'Other site', 'active', ?, ?)`,
      [stranger, now, now],
    );
    await sql.run(
      `INSERT INTO repos (
        id, github_repo_id, full_name, organization_id, project_id, default_branch, is_private, owned_by, created_at
      ) VALUES ('repo-work', 202, 'makemoney2023/foam', ?, 'project-work', 'main', 1, 'agency', ?)`,
      [org, now],
    );
    await sql.run(
      `INSERT INTO knowledge_keys (
        id, workspace_id, token_hash, label, created_at, revoked_at, scopes, can_publish, organization_id
      ) VALUES ('key-agent-work', ?, ?, 'HQ agent', ?, NULL, 'read,work', 0, NULL)`,
      [space, await sha256Hex(agentToken), now],
    );
  }

  async function call(method: string, params?: unknown) {
    const response = await mcp(
      new Request("http://handoff.test/api/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${agentToken}`, "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
    return response.json() as Promise<{
      result?: { tools?: { name: string }[]; content?: { text?: string }[] };
      error?: { code: number };
    }>;
  }

  function payload(body: { result?: { content?: { text?: string }[] } }): unknown {
    return JSON.parse(body.result?.content?.[0]?.text ?? "");
  }

  it("saves one draft brief and repeats the same request", async () => {
    const sql = await db();
    await seed(sql);
    const args = {
      organizationId: org,
      kind: "brief",
      title: "Foam brief",
      bodyMarkdown: "# Foam\nThey sell foam.",
      sourcesJson: [{ fileId: "file-1", summary: "Logo notes" }],
      requestId: "req-brief-1",
    };
    const first = payload(await call("tools/call", { name: "save_brief", arguments: args })) as { deliverableId: string };
    const second = payload(await call("tools/call", { name: "save_brief", arguments: { ...args, title: "Changed" } })) as {
      deliverableId: string;
    };
    expect(second.deliverableId).toBe(first.deliverableId);
    const count = await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM deliverables WHERE organization_id = ? AND kind = 'brief'", [org]);
    expect(count?.n).toBe(1);
    const row = await sql.get<{ status: string; actor_kind: string }>(
      "SELECT status, actor_kind FROM deliverables WHERE id = ?",
      [first.deliverableId],
    );
    expect(row).toEqual({ status: "draft", actor_kind: "agent" });
    const item = await sql.get<{ title: string; copy_text: string }>(
      "SELECT title, copy_text FROM deliverable_items WHERE deliverable_id = ?",
      [first.deliverableId],
    );
    expect(item).toEqual({ title: "brief.md", copy_text: "# Foam\nThey sell foam." });
    const activity = await sql.get<{ kind: string; actor_kind: string; actor_id: string }>(
      "SELECT kind, actor_kind, actor_id FROM activities WHERE organization_id = ? AND kind = 'agent.brief_drafted'",
      [org],
    );
    expect(activity).toEqual({ kind: "agent.brief_drafted", actor_kind: "agent", actor_id: "key-agent-work" });
  });

  it("refuses a task aimed at another client's project", async () => {
    const sql = await db();
    await seed(sql);
    const body = await call("tools/call", {
      name: "create_task",
      arguments: {
        organizationId: org,
        title: "Build the stranger site",
        projectId: "project-stranger",
        stage: "describe",
        skills: [],
        requestId: "req-task-bad",
      },
    });
    expect(body.error?.code).toBe(-32602);
    const count = await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE title = 'Build the stranger site'");
    expect(count?.n).toBe(0);
  });

  it("updates a task, asks staff, posts status, and lists this client's repos", async () => {
    const sql = await db();
    await seed(sql);
    const created = payload(
      await call("tools/call", {
        name: "create_task",
        arguments: {
          organizationId: org,
          title: "Write the homepage",
          projectId: "project-work",
          stage: "describe",
          skills: [{ path: "copywriting", mode: "complete" }],
          requestId: "req-task-1",
        },
      }),
    ) as { taskId: string };
    const task = await sql.get<{ created_by_kind: string; stage: string; actor_kind: string }>(
      `SELECT t.created_by_kind, t.stage, a.actor_kind
       FROM tasks t JOIN activities a ON a.organization_id = t.organization_id
       WHERE t.id = ? AND a.kind = 'agent.task_created'`,
      [created.taskId],
    );
    expect(task).toEqual({ created_by_kind: "agent", stage: "describe", actor_kind: "agent" });

    await call("tools/call", {
      name: "update_task",
      arguments: { organizationId: org, taskId: created.taskId, stage: "engineer", status: "doing", requestId: "req-task-2" },
    });
    const moved = await sql.get<{ stage: string; status: string }>("SELECT stage, status FROM tasks WHERE id = ?", [created.taskId]);
    expect(moved).toEqual({ stage: "engineer", status: "doing" });
    const runs = await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM cloud_runs");
    expect(runs?.n).toBe(0);

    await call("tools/call", {
      name: "ask_staff",
      arguments: { organizationId: org, taskId: created.taskId, question: "Which gold?", requestId: "req-ask-1" },
    });
    const blocked = await sql.get<{ status: string; blocked_reason: string }>(
      "SELECT status, blocked_reason FROM tasks WHERE id = ?",
      [created.taskId],
    );
    expect(blocked).toEqual({ status: "blocked", blocked_reason: "waiting_on_staff" });

    const internal = payload(
      await call("tools/call", {
        name: "post_status_update",
        arguments: {
          organizationId: org,
          projectId: "project-work",
          health: "on_track",
          audience: "internal",
          body: "Brief is drafted.",
          requestId: "req-status-1",
        },
      }),
    ) as { state: string };
    const client = payload(
      await call("tools/call", {
        name: "post_status_update",
        arguments: {
          organizationId: org,
          projectId: "project-work",
          health: "on_track",
          audience: "client",
          body: "We started the brief.",
          requestId: "req-status-2",
        },
      }),
    ) as { state: string };
    expect(internal.state).toBe("published");
    expect(client.state).toBe("draft");

    const repos = payload(await call("tools/call", { name: "list_repos", arguments: { organizationId: org, requestId: "req-repos-1" } })) as {
      fullName: string;
    }[];
    expect(repos.map((repo) => repo.fullName)).toEqual(["makemoney2023/foam"]);

    const made = payload(
      await call("tools/call", {
        name: "create_deliverable",
        arguments: {
          organizationId: org,
          title: "Homepage copy",
          kind: "document",
          projectId: "project-work",
          workspaceId: space,
          requestId: "req-del-1",
        },
      }),
    ) as { deliverableId: string };
    await call("tools/call", {
      name: "add_deliverable_item",
      arguments: {
        organizationId: org,
        deliverableId: made.deliverableId,
        path: "copy.md",
        bodyMarkdown: "The headline.",
        requestId: "req-item-1",
      },
    });
    const copy = await sql.get<{ title: string; copy_text: string }>(
      "SELECT title, copy_text FROM deliverable_items WHERE deliverable_id = ?",
      [made.deliverableId],
    );
    expect(copy).toEqual({ title: "copy.md", copy_text: "The headline." });

    await call("tools/call", {
      name: "add_note",
      arguments: { organizationId: org, taskId: created.taskId, body: "Waiting on the gold.", requestId: "req-note-1" },
    });
    const note = await sql.get<{ kind: string; actor_kind: string }>(
      "SELECT kind, actor_kind FROM activities WHERE organization_id = ? AND kind = 'agent.note'",
      [org],
    );
    expect(note).toEqual({ kind: "agent.note", actor_kind: "agent" });
  });

  it("keeps finished skill steps and links the task to its draft", async () => {
    const sql = await db();
    await seed(sql);
    const made = payload(
      await call("tools/call", {
        name: "create_deliverable",
        arguments: {
          organizationId: org,
          title: "Homepage",
          kind: "website",
          projectId: "project-work",
          workspaceId: space,
          requestId: "req-del-link",
        },
      }),
    ) as { deliverableId: string };
    const created = payload(
      await call("tools/call", {
        name: "create_task",
        arguments: {
          organizationId: org,
          title: "Write the homepage",
          projectId: "project-work",
          stage: "describe",
          deliverableId: made.deliverableId,
          skills: [
            { path: "copywriting", mode: "complete", status: "done" },
            { path: "landing-page-design", mode: "plan", status: "todo" },
          ],
          requestId: "req-task-link",
        },
      }),
    ) as { taskId: string };
    await call("tools/call", {
      name: "update_task",
      arguments: {
        organizationId: org,
        taskId: created.taskId,
        skills: [
          { path: "copywriting", mode: "complete", status: "done" },
          { path: "landing-page-design", mode: "plan", status: "todo" },
        ],
        note: "Finished copywriting.",
        requestId: "req-task-link-step",
      },
    });
    await call("tools/call", {
      name: "add_note",
      arguments: {
        organizationId: org,
        taskId: created.taskId,
        body: "Planned 1 task for Foam Co.",
        kind: "plan",
        requestId: "req-plan-note",
      },
    });
    const row = await sql.get<{ deliverable_id: string; skills_json: string }>(
      "SELECT deliverable_id, skills_json FROM tasks WHERE id = ?",
      [created.taskId],
    );
    expect(row?.deliverable_id).toBe(made.deliverableId);
    expect(JSON.parse(row?.skills_json ?? "{}")).toEqual({
      steps: [
        { path: "copywriting", mode: "complete", status: "done" },
        { path: "landing-page-design", mode: "plan", status: "todo" },
      ],
      current: 1,
    });
    const skill = await sql.get<{ kind: string }>(
      "SELECT kind FROM activities WHERE organization_id = ? AND kind = 'agent.skill_done'",
      [org],
    );
    expect(skill?.kind).toBe("agent.skill_done");
    const plan = await sql.get<{ kind: string }>(
      "SELECT kind FROM activities WHERE organization_id = ? AND kind = 'agent.plan_written'",
      [org],
    );
    expect(plan?.kind).toBe("agent.plan_written");
  });

  it("deletes a task and a project for this client only", async () => {
    const sql = await db();
    await seed(sql);
    const listed = await call("tools/list");
    const names = listed.result?.tools?.map((tool) => tool.name) ?? [];
    expect(names).toEqual(expect.arrayContaining(["delete_task", "delete_project"]));
    const created = payload(
      await call("tools/call", {
        name: "create_task",
        arguments: {
          organizationId: org,
          title: "Write the homepage",
          projectId: "project-work",
          stage: "describe",
          skills: [],
          requestId: "req-task-del",
        },
      }),
    ) as { taskId: string };
    const args = { organizationId: org, taskId: created.taskId, requestId: "req-del-task" };
    const first = payload(await call("tools/call", { name: "delete_task", arguments: args })) as { id: string; title: string };
    const second = payload(await call("tools/call", { name: "delete_task", arguments: { ...args, title: "Changed" } })) as {
      id: string;
    };
    expect(second.id).toBe(first.id);
    expect(first.title).toBe("Write the homepage");
    expect(await sql.get("SELECT id FROM tasks WHERE id = ?", [created.taskId])).toBeUndefined();
    const activity = await sql.get<{ kind: string; actor_kind: string }>(
      "SELECT kind, actor_kind FROM activities WHERE organization_id = ? AND kind = 'agent.task_deleted'",
      [org],
    );
    expect(activity).toEqual({ kind: "agent.task_deleted", actor_kind: "agent" });

    const refused = await call("tools/call", {
      name: "delete_project",
      arguments: { organizationId: org, projectId: "project-stranger", requestId: "req-del-stranger" },
    });
    expect(refused.error?.code).toBe(-32602);
    expect(await sql.get("SELECT id FROM projects WHERE id = 'project-stranger'")).toBeTruthy();

    const removed = payload(
      await call("tools/call", {
        name: "delete_project",
        arguments: { organizationId: org, projectId: "project-work", requestId: "req-del-project" },
      }),
    ) as { id: string; name: string; tasksRemoved: number };
    expect(removed).toMatchObject({ id: "project-work", name: "Site", tasksRemoved: 0 });
    expect(await sql.get("SELECT id FROM projects WHERE id = 'project-work'")).toBeUndefined();
    expect(await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE id = ?", [space])).toEqual({ id: space });
    const projectActivity = await sql.get<{ kind: string; actor_kind: string }>(
      "SELECT kind, actor_kind FROM activities WHERE organization_id = ? AND kind = 'agent.project_deleted'",
      [org],
    );
    expect(projectActivity).toEqual({ kind: "agent.project_deleted", actor_kind: "agent" });
  });
});

describe("AI Gateway parsing", () => {
  it("reads embeddings and a chat summary from the gateway envelope", () => {
    expect(
      embedFromGatewayBody({
        success: true,
        result: { data: [[0.1, 0.2]], shape: [1, 2] },
      }),
    ).toEqual([[0.1, 0.2]]);
    expect(
      summaryFromChatBody({
        choices: [{ message: { content: "The file lists blue and gold." } }],
      }),
    ).toBe("The file lists blue and gold.");
    expect(
      summaryFromChatBody({
        result: { choices: [{ message: { content: "Blue and gold in note.txt." } }] },
      }),
    ).toBe("Blue and gold in note.txt.");
  });

  it("sends Workers AI calls through the gateway id header", async () => {
    const calls: { url: string; gateway: string | null; body: unknown }[] = [];
    const understander = gatewayUnderstander({
      accountId: "account-1",
      token: "token-1",
      gatewayId: "handoff",
      fetchImpl: async (url, init) => {
        const headers = new Headers(init?.headers);
        calls.push({
          url: String(url),
          gateway: headers.get("cf-aig-gateway-id"),
          body: JSON.parse(String(init?.body)),
        });
        const target = String(url);
        if (target.includes("/ai/run/")) {
          return Response.json({ success: true, result: { data: [[1, 0]], shape: [1, 2] } });
        }
        return Response.json({ choices: [{ message: { content: "A short note." } }] });
      },
    });
    await expect(understander.summarize("brief.txt", "hello")).resolves.toBe("A short note.");
    await expect(understander.embed(["hello"])).resolves.toEqual([[1, 0]]);
    expect(calls.every((call) => call.gateway === "handoff")).toBe(true);
    expect(calls.some((call) => call.url.includes("/ai/v1/chat/completions"))).toBe(true);
    const chat = calls.find((call) => call.url.includes("/ai/v1/chat/completions"));
    expect(chat?.body).toMatchObject({ model: "@cf/meta/llama-3.2-3b-instruct" });
    expect(calls.some((call) => call.url.includes("/ai/run/@cf/baai/bge-base-en-v1.5"))).toBe(true);
    expect(calls.some((call) => call.url.includes("api.cloudflare.com/client/v4/accounts/account-1"))).toBe(true);
  });
});
