import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { GET as previewGet } from "@/app/api/files/[fileId]/preview/route";
import { GET as mediaGet } from "@/app/api/deliverables/[deliverableId]/items/[itemId]/media/[role]/route";
import { localObjectStore, type ObjectStore } from "@/lib/store/objects";
import { LIMITS } from "@/lib/policy/limits";
import { agentForToken, fileAgentWork, registerClientAgent, type AgentPrincipal } from "./agent-work-filing";
import { clientServicesReview } from "./task-review";
import { dataUrl, fakeClip } from "./test-clips";
import { listAgentSocialPieces } from "./social-queries";

const NOW = Date.now() - 120_000;
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const CLIP = fakeClip("mp4", 4096);

let directory = "";
let sql: Sql;
let store: ObjectStore;
let agent: AgentPrincipal;
let spaceId = "";
let taskId = "";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "video-playback-"));
  process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
  process.env.HANDOFF_OBJECT_PATH = path.join(directory, "objects");
  process.env.HANDOFF_SIGNING_SECRET = "test-signing-secret";
  sql = await openHandoffDb();
  await migrate(sql);
  store = localObjectStore(process.env.HANDOFF_OBJECT_PATH);
  const org = crypto.randomUUID();
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, 'Acme', 'acme.example', 'client', ?, ?)", [org, NOW, NOW]);
  const projectId = crypto.randomUUID();
  await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES (?, ?, 'Social media', 'active', ?, ?)", [projectId, org, NOW, NOW]);
  spaceId = crypto.randomUUID();
  await sql.run(
    `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id)
     VALUES (?, 'acme', 'acme', 'Acme', 'Abra-ca-dabra', 'standard', ?, ?, 0, 'active', ?, ?, ?)`,
    [spaceId, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, NOW, org, projectId],
  );
  for (const [id, email] of [["user-staff", "staff@abra.example"], ["user-client", "client@acme.example"], ["user-out", "out@elsewhere.example"]] as const) {
    await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [id, email, NOW]);
    await sql.run(
      "INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)",
      [`sess-${id}`, id, await sha256Hex(`${id}-token`), Date.now(), Date.now() + LIMITS.sessionTtlMs],
    );
  }
  await sql.run("INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('user-staff', 'staff@abra.example', 1, ?, NULL)", [NOW]);
  await sql.run(
    "INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at) VALUES ('m1', ?, 'user-client', 'client@acme.example', 'client_owner', ?, NULL)",
    [spaceId, NOW],
  );
  const made = await registerClientAgent(sql, { agentId: "acme-lead", label: "Acme lead", organizationId: org, role: "lead", actor: "test", now: NOW });
  if (!made.ok || !made.token) throw new Error("register failed");
  agent = (await agentForToken(sql, `Bearer ${made.token}`))!;
  taskId = crypto.randomUUID();
  await sql.run("INSERT INTO tasks (id, project_id, organization_id, title, status, created_at, updated_at) VALUES (?, ?, ?, 'Schema video', 'doing', ?, ?)", [taskId, projectId, org, NOW, NOW]);
});

afterEach(() => {
  delete process.env.HANDOFF_SQLITE_PATH;
  delete process.env.HANDOFF_OBJECT_PATH;
  delete process.env.HANDOFF_SIGNING_SECRET;
  delete process.env.AGENT_WORK_MAX_MB;
  if (directory) rmSync(directory, { recursive: true, force: true });
});

async function fileClip(extra: Record<string, unknown> = {}) {
  const result = await fileAgentWork(sql, store, agent, {
    external_id: `clip-${crypto.randomUUID()}`,
    title: "Schema video",
    kind: "design",
    summary: "A 30 second vertical clip.",
    task_id: taskId,
    folder: "Social/Schema",
    attachments: [
      { name: "schema-video.mp4", body: dataUrl("video/mp4", CLIP) },
      { name: "schema-video-poster.png", body: PNG },
    ],
    ...extra,
  }, NOW + 10);
  return result;
}

const cookie = (user: string) => ({ cookie: `handoff_session=${user}-token` });

function previewOf(fileId: string, headers: Record<string, string>) {
  return previewGet(new Request(`https://hq.example/api/files/${fileId}/preview`, { headers }), { params: Promise.resolve({ fileId }) });
}

async function clipRow() {
  const row = await sql.get<{ id: string; relative_path: string; extension: string; declared_content_type: string; size_bytes: number; object_key: string }>(
    "SELECT id, relative_path, extension, declared_content_type, size_bytes, object_key FROM files WHERE relative_path LIKE '%.mp4'",
  );
  if (!row) throw new Error("no clip stored");
  return row;
}

describe("filing a clip", () => {
  it("stores an MP4 data URL as a real file in the object store, not as text", async () => {
    const result = await fileClip();
    expect(result).toMatchObject({ ok: true, state: "filed", held: true });
    const row = await clipRow();
    expect(row).toMatchObject({ relative_path: "Social/Schema/schema-video.mp4", extension: "mp4", declared_content_type: "video/mp4", size_bytes: 4096 });
    expect(await store.read(row.object_key)).toEqual(CLIP);
    const stored = await sql.all<{ relative_path: string }>("SELECT relative_path FROM files ORDER BY relative_path");
    expect(stored.map((file) => file.relative_path)).toEqual([
      "Social/Schema/Schema video - summary.md", "Social/Schema/schema-video-poster.png", "Social/Schema/schema-video.mp4",
    ]);
  });

  it("names a WebM and a MOV from their bytes", async () => {
    const result = await fileAgentWork(sql, store, agent, {
      external_id: "two-clips", title: "Clips", kind: "design", summary: "Two", task_id: taskId, folder: "Clips",
      attachments: [{ name: "a.mp4", body: dataUrl("video/mp4", fakeClip("webm")) }, { name: "b", body: dataUrl("video/quicktime", fakeClip("mov")) }],
    }, NOW + 10);
    expect(result.ok).toBe(true);
    const rows = await sql.all<{ relative_path: string; declared_content_type: string }>("SELECT relative_path, declared_content_type FROM files WHERE relative_path NOT LIKE '%.md' ORDER BY relative_path");
    expect(rows).toEqual([
      { relative_path: "Clips/a.webm", declared_content_type: "video/webm" },
      { relative_path: "Clips/b.mov", declared_content_type: "video/quicktime" },
    ]);
  });

  it("refuses a fake clip, an unsupported type and a clip over the size limit", async () => {
    const fake = await fileAgentWork(sql, store, agent, {
      external_id: "fake", title: "Fake", summary: "x", attachments: [{ name: "x.mp4", body: dataUrl("video/mp4", new TextEncoder().encode("<html>this is not a clip at all</html>")) }],
    }, NOW);
    expect(fake).toMatchObject({ ok: false, error: "invalid", message: expect.stringContaining("not a real MP4, WebM or MOV") });
    const other = await fileAgentWork(sql, store, agent, {
      external_id: "mkv", title: "Mkv", summary: "x", attachments: [{ name: "x.mkv", body: dataUrl("video/x-matroska", fakeClip("webm")) }],
    }, NOW);
    expect(other).toMatchObject({ ok: false, error: "invalid", message: expect.stringContaining("not supported") });
    process.env.AGENT_WORK_MAX_MB = "1";
    const big = await fileAgentWork(sql, store, agent, {
      external_id: "big", title: "Big", summary: "x", attachments: [{ name: "x.mp4", body: dataUrl("video/mp4", fakeClip("mp4", 1024 * 1024 + 10)) }],
    }, NOW);
    expect(big).toMatchObject({ ok: false, error: "too_big" });
    expect(await sql.get("SELECT id FROM files")).toBeUndefined();
  });

  it("links the poster to the clip and shows one piece with the poster inside it", async () => {
    await fileClip();
    const clip = await clipRow();
    const link = await sql.get<{ poster_file_id: string }>("SELECT poster_file_id FROM file_posters WHERE file_id = ?", [clip.id]);
    const poster = await sql.get<{ id: string }>("SELECT id FROM files WHERE relative_path LIKE '%poster.png'");
    expect(link?.poster_file_id).toBe(poster?.id);
    const items = await sql.all<{ title: string; format: string; media_json: string }>("SELECT title, format, media_json FROM deliverable_items ORDER BY sort");
    expect(items.map((item) => [item.title, item.format])).toEqual([["Schema video", "page"], ["schema-video.mp4", "file"]]);
    const media = JSON.parse(items[1]!.media_json) as { role: string; content_type: string }[];
    expect(media.map((entry) => [entry.role, entry.content_type])).toEqual([["main", "video/mp4"], ["poster", "image/png"]]);
    // A clip filed as design work is a file piece, like a PDF: it never becomes a social piece by itself.
    expect(await sql.all("SELECT id FROM social_posts")).toEqual([]);
    const listed = await listAgentSocialPieces(sql, agent, { client: "acme.example" }, NOW);
    expect(listed).toMatchObject({ ok: true, pieces: [] });
  });
});

describe("filing a clip into a social pack", () => {
  async function pieces() {
    const listed = await listAgentSocialPieces(sql, agent, { client: "acme.example" }, NOW);
    if (!listed.ok) throw new Error("list failed");
    return listed.pieces;
  }

  it("files the clip as one video piece, with its poster inside it and the caption on it", async () => {
    const result = await fileClip({
      kind: "copy",
      summary: "## schema-video.mp4\n\n**Caption:**\nThe full caption.\n\n**Alt text:** A vertical clip.",
    });
    expect(result).toMatchObject({ ok: true, state: "filed", held: true });
    const items = await sql.all<{ title: string; format: string; status: string; copy_text: string | null; media_json: string }>(
      "SELECT title, format, status, copy_text, media_json FROM deliverable_items ORDER BY sort",
    );
    expect(items.map((item) => [item.title, item.format, item.status])).toEqual([
      ["Schema video", "page", "pending"],
      ["schema-video.mp4", "video", "pending"],
    ]);
    expect(items[1]!.copy_text).toBe("The full caption.");
    const media = JSON.parse(items[1]!.media_json) as { role: string; content_type: string }[];
    expect(media.map((entry) => [entry.role, entry.content_type])).toEqual([["main", "video/mp4"], ["poster", "image/png"]]);
    // The poster is not a piece of its own, so approving the video cannot post a still picture.
    expect(items.some((item) => item.format === "static")).toBe(false);
    const listed = await pieces();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ title: "schema-video.mp4", format: "video", approved: false, postType: "reel", state: "held" });
    expect(listed[0]!.media).toMatchObject({ count: 1, kinds: ["video"] });
    // Nothing is approved or scheduled by filing.
    expect(await sql.all("SELECT id FROM social_posts")).toEqual([]);
  });

  it("keeps the clip a video piece when the pack is filed again as a new version", async () => {
    await fileClip({ kind: "copy", external_id: "round-1" });
    await fileClip({ kind: "design", external_id: "round-2", supersedes: [] });
    const formats = await sql.all<{ version: number; title: string; format: string }>(
      "SELECT version, title, format FROM deliverable_items WHERE title = 'schema-video.mp4' ORDER BY version",
    );
    expect(formats.length).toBeGreaterThan(0);
    expect(formats.every((row) => row.format === "video")).toBe(true);
  });
});

describe("playing a filed clip", () => {
  it("streams the preview with Range support to staff, and hides it from outsiders and from the client until approved", async () => {
    await fileClip();
    const clip = await clipRow();

    const whole = await previewOf(clip.id, cookie("user-staff"));
    expect(whole.status).toBe(200);
    expect(whole.headers.get("content-type")).toBe("video/mp4");
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    expect(whole.headers.get("content-length")).toBe("4096");
    expect(new Uint8Array(await whole.arrayBuffer())).toEqual(CLIP);

    const part = await previewOf(clip.id, { ...cookie("user-staff"), range: "bytes=1000-1999" });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 1000-1999/4096");
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(CLIP.slice(1000, 2000));
    expect((await previewOf(clip.id, { ...cookie("user-staff"), range: "bytes=9999-" })).status).toBe(416);

    expect((await previewOf(clip.id, {})).status).toBe(404);
    expect((await previewOf(clip.id, cookie("user-out"))).status).toBe(404);
    // Held work is not for the client yet.
    expect((await previewOf(clip.id, cookie("user-client"))).status).toBe(404);

    const approved = await clientServicesReview(sql, { taskId, action: "approve", now: NOW + 20 });
    expect(approved.ok).toBe(true);
    const asClient = await previewOf(clip.id, { ...cookie("user-client"), range: "bytes=0-1" });
    expect(asClient.status).toBe(206);
    expect(asClient.headers.get("content-range")).toBe("bytes 0-1/4096");
    expect((await previewOf(clip.id, cookie("user-out"))).status).toBe(404);
  });

  it("does not play a renamed file as video", async () => {
    await fileClip();
    const clip = await clipRow();
    await sql.run("UPDATE files SET relative_path = 'Social/Schema/page.html' WHERE id = ?", [clip.id]);
    expect((await previewOf(clip.id, cookie("user-staff"))).status).toBe(404);
  });

  it("serves the finished-work clip and its poster by piece, with Range", async () => {
    await fileClip();
    const item = await sql.get<{ id: string; deliverable_id: string }>("SELECT id, deliverable_id FROM deliverable_items WHERE title = 'schema-video.mp4'");
    if (!item) throw new Error("no piece");
    const media = (role: string, headers: Record<string, string>) =>
      mediaGet(new Request("https://hq.example/m", { headers }), { params: Promise.resolve({ deliverableId: item.deliverable_id, itemId: item.id, role }) });
    const part = await media("main", { ...cookie("user-staff"), range: "bytes=4000-" });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-type")).toBe("video/mp4");
    expect(part.headers.get("content-range")).toBe("bytes 4000-4095/4096");
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(CLIP.slice(4000));
    const poster = await media("poster", cookie("user-staff"));
    expect(poster.status).toBe(200);
    expect(poster.headers.get("content-type")).toBe("image/png");
    expect((await media("main", cookie("user-out"))).status).toBe(404);
    expect((await media("main", cookie("user-client"))).status).toBe(404);
  });
});
