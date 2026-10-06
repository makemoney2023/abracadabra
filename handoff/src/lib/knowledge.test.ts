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
