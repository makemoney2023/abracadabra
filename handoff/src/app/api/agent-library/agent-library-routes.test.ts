import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postWork } from "@/app/api/agent-work/[id]/route";
import { GET as getLibrary } from "@/app/api/agent-library/route";
import { POST as postFiles } from "@/app/api/agent-library/files/route";
import { POST as postShares } from "@/app/api/agent-library/shares/route";
import { POST as postShelf } from "@/app/api/agent-library/shelf/route";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { agentForToken, registerClientAgent } from "@/lib/agent-work-filing";
import type { Caller } from "@/lib/authz";
import { listLibraryArtifacts } from "@/lib/library-queries";

const NOW = 1_800_000_000_000;
const CTX = Symbol.for("__cloudflare-context__");
const BASE = "https://hq.example.test/api/agent-library";

let sql: Sql;
let d1: D1Like;

function d1Over(db: DatabaseSync): D1Like {
  const prepare = (statement: string) => ({
    bind: (...params: unknown[]) => {
      const stmt = db.prepare(statement);
      const args = params as never[];
      return {
        run: async () => stmt.run(...args),
        all: async <T>() => ({ results: stmt.all(...args) as T[] }),
        first: async <T>() => (stmt.get(...args) as T | undefined) ?? null,
        stmt,
        args,
      };
    },
  });
  return {
    prepare,
    exec: async (statement: string) => db.exec(statement),
    batch: async (statements: unknown[]) => {
      db.exec("BEGIN");
      try {
        for (const entry of statements as { stmt: { run: (...a: never[]) => unknown }; args: never[] }[]) entry.stmt.run(...entry.args);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Like;
}

beforeEach(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  d1 = d1Over(db);
  sql = d1Sql(d1);
  await migrate(sql);
  (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
  process.env.AGENT_MODE = "agents";
  process.env.LIBRARY_VIEW_LINKS = "on";
  delete process.env.SOCIAL_AGENT_ACTIONS;
});

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.AGENT_MODE;
  delete process.env.LIBRARY_VIEW_LINKS;
  delete process.env.SOCIAL_AGENT_ACTIONS;
});

async function agent(organizationId: string, agentId: string, role: "lead" | "hire", workspaceId: string) {
  const made = await registerClientAgent(sql, {
    agentId,
    label: agentId,
    organizationId,
    workspaceId,
    role,
    actor: "test",
    now: NOW,
  });
  if (!made.ok || !made.token) throw new Error(made.ok ? "missing token" : made.message);
  if (!(await agentForToken(sql, `Bearer ${made.token}`))) throw new Error("token failed");
  return made.token;
}

async function seed() {
  await sql.run(
    "INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'acme.example', 'client', ?, ?), ('org-2', 'Other', 'other.example', 'client', ?, ?)",
    [NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
       quota_bytes, retention_days, request_digest, status, opened_at, organization_id
     ) VALUES ('ws-1', 'acme', 'Acme', 'Acme', NULL, 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1'),
            ('ws-2', 'other', 'Other', 'Other', NULL, 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-2')`,
    [NOW, NOW],
  );
  const lead = await agent("org-1", "acme-lead", "lead", "ws-1");
  const hire = await agent("org-1", "acme-writer", "hire", "ws-1");
  await sql.run(
    `INSERT INTO deliverables (
       id, organization_id, workspace_id, title, kind, status, version, published_version, actor_kind, created_at, updated_at
     ) VALUES ('d-1', 'org-1', 'ws-1', 'October', 'social_pack', 'in_review', 1, 1, 'staff', ?, ?),
            ('d-2', 'org-2', 'ws-2', 'Other pack', 'social_pack', 'in_review', 1, 1, 'staff', ?, ?),
            ('d-held', 'org-1', 'ws-1', 'Held round', 'social_pack', 'draft', 1, NULL, 'agent', ?, ?),
            ('d-hire', 'org-1', 'ws-1', 'Hire round', 'social_pack', 'draft', 1, NULL, 'agent', ?, ?),
            ('d-auto', 'org-1', 'ws-1', 'Auto round', 'social_pack', 'draft', 1, NULL, 'agent', ?, ?)`,
    [NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO deliverable_items (
       id, deliverable_id, version, format, title, copy_text, media_json, status, sort, removed_at, work_item_id
     ) VALUES ('i-open', 'd-1', 1, 'static', 'Launch post', 'Caption', ?, 'pending', 0, NULL, NULL),
            ('i-live', 'd-1', 1, 'static', 'Live post', 'Caption', '[]', 'approved', 1, NULL, NULL),
            ('i-gone', 'd-1', 1, 'static', 'Gone post', 'Caption', '[]', 'pending', 2, ?, NULL),
            ('i-other', 'd-2', 1, 'static', 'Other post', 'Caption', '[]', 'pending', 0, NULL, NULL),
            ('i-held', 'd-held', 1, 'static', 'Held piece', 'Caption', '[]', 'pending', 0, NULL, 'work-held'),
            ('i-hire', 'd-hire', 1, 'static', 'Hire piece', 'Caption', '[]', 'pending', 0, NULL, 'work-hire'),
            ('i-auto', 'd-auto', 1, 'static', 'Auto piece', 'Caption', '[]', 'pending', 0, NULL, 'work-auto')`,
    [JSON.stringify([{ r2_key: "pic", role: "main", content_type: "image/png" }]), NOW],
  );
  await sql.run(
    `INSERT INTO social_posts (
       id, organization_id, deliverable_id, item_id, version, account_ids, mode, post_type, status, created_at, updated_at
     ) VALUES ('post-live', 'org-1', 'd-1', 'i-live', 1, '[]', 'scheduled', 'feed', 'scheduled', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO batches (id, workspace_id, created_by, created_at, last_activity_at, held_at)
     VALUES ('batch-file', 'ws-1', 'staff', ?, ?, NULL),
            ('batch-held', 'ws-1', 'agent:acme-lead', ?, ?, ?),
            ('batch-hire', 'ws-1', 'agent:acme-writer', ?, ?, ?),
            ('batch-auto', 'ws-1', 'agent:acme-lead', ?, ?, ?)`,
    [NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO files (
       id, batch_id, workspace_id, relative_path, extension, size_bytes, object_key, tag, status, created_at
     ) VALUES ('f-1', 'batch-file', 'ws-1', 'logo.png', 'png', 12, 'ws-1/batch-file/logo.png', 'photo', 'clean', ?)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO agent_work_items (
       id, agent_id, external_id, state, kind, title, organization_id, workspace_id, batch_id,
       deliverable_id, deliverable_version, created_at, updated_at, filed_at
     ) VALUES ('work-held', 'acme-lead', 'held-1', 'filed', 'social', 'Held round', 'org-1', 'ws-1', 'batch-held', 'd-held', 1, ?, ?, ?),
            ('work-hire', 'acme-writer', 'hire-1', 'filed', 'social', 'Hire round', 'org-1', 'ws-1', 'batch-hire', 'd-hire', 1, ?, ?, ?),
            ('work-auto', 'acme-lead', 'auto-1', 'filed', 'social', 'Auto round', 'org-1', 'ws-1', 'batch-auto', 'd-auto', 1, ?, ?, ?)`,
    [NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at)
     VALUES ('m-1', 'ws-1', 'c-1', 'client@example.com', 'client_owner', ?)`,
    [NOW],
  );
  return { lead, hire };
}

function write(path: string, token: string, body: unknown) {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const client: Caller = {
  userId: "c-1",
  staff: null,
  operatorOf: [],
  memberships: [{ workspaceId: "ws-1", role: "client_owner" }],
};

describe("agent library desk", () => {
  it("lists only the assigned client's shelf, including Removed when asked", async () => {
    const { lead } = await seed();
    const page = await getLibrary(new Request(`${BASE}?client=acme.example`, { headers: { authorization: `Bearer ${lead}` } }));
    const body = await page.json() as { artifacts: { title: string; itemId: string; deliverableId: string; piecePath: string; previewPath: string | null }[] };
    expect(page.status).toBe(200);
    expect(body.artifacts.map((row) => row.title)).toContain("Launch post");
    expect(body.artifacts.map((row) => row.title)).not.toContain("Gone post");
    expect(body.artifacts.map((row) => row.title)).not.toContain("Other post");
    expect(body.artifacts.find((row) => row.itemId === "i-open")).toMatchObject({
      deliverableId: "d-1",
      piecePath: "/w/acme/work/d-1?item=i-open",
    });
    expect(body.artifacts.find((row) => row.itemId === "i-open")?.previewPath).toContain("/api/deliverables/d-1/items/i-open/");
    expect(JSON.stringify(body)).not.toMatch(/zernio|access_token|r2_key/i);
    const removed = await getLibrary(new Request(`${BASE}?client=acme.example&removed=1`, { headers: { authorization: `Bearer ${lead}` } }));
    const removedBody = await removed.json() as { artifacts: { itemId: string }[] };
    expect(removedBody.artifacts.map((row) => row.itemId)).toContain("i-gone");
    const foreign = await getLibrary(new Request(`${BASE}?client=other.example`, { headers: { authorization: `Bearer ${lead}` } }));
    expect(foreign.status).toBe(403);
  });

  it("lets the lead remove and restore, and refuses a hire or a live post", async () => {
    const { lead, hire } = await seed();
    const blocked = await postShelf(write("/shelf", lead, { client: "acme.example", itemId: "i-live", version: 1, removed: true }));
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ reasonCode: "SHELF_LIVE" });
    expect((await sql.get<{ removed_at: number | null }>("SELECT removed_at FROM deliverable_items WHERE id = 'i-live'"))?.removed_at).toBeNull();
    const hireTry = await postShelf(write("/shelf", hire, { client: "acme.example", itemId: "i-open", version: 1, removed: true }));
    expect(hireTry.status).toBe(403);
    expect((await sql.get<{ removed_at: number | null }>("SELECT removed_at FROM deliverable_items WHERE id = 'i-open'"))?.removed_at).toBeNull();
    const removed = await postShelf(write("/shelf", lead, { client: "acme.example", itemId: "i-open", version: 1, removed: true }));
    expect(removed.status).toBe(200);
    const activity = await sql.get<{ actor_kind: string; actor_id: string }>(
      "SELECT actor_kind, actor_id FROM activities WHERE kind = 'library_item_removed' ORDER BY created_at DESC LIMIT 1",
    );
    expect(activity).toMatchObject({ actor_kind: "agent", actor_id: "acme-lead" });
    const restored = await postShelf(write("/shelf", lead, { client: "acme.example", itemId: "i-open", version: 1, removed: false }));
    expect(restored.status).toBe(200);
    expect((await sql.get<{ removed_at: number | null }>("SELECT removed_at FROM deliverable_items WHERE id = 'i-open'"))?.removed_at).toBeNull();
    const missing = await postShelf(write("/shelf", lead, { client: "acme.example", itemId: "i-other", version: 1, removed: true }));
    expect(missing.status).toBe(404);
  });

  it("shows and hides a clean file without deleting the bytes", async () => {
    const { lead } = await seed();
    const selected = await postFiles(write("/files", lead, { client: "acme.example", fileId: "f-1", selected: true }));
    expect(selected.status).toBe(200);
    const shown = await listLibraryArtifacts(sql, client, { workspaceId: "ws-1", slug: "acme" });
    expect(shown.ok && shown.page.artifacts.some((artifact) => artifact.sourceId === "f-1")).toBe(true);
    const hidden = await postFiles(write("/files", lead, { client: "acme.example", fileId: "f-1", selected: false }));
    expect(hidden.status).toBe(200);
    const after = await listLibraryArtifacts(sql, client, { workspaceId: "ws-1", slug: "acme" });
    expect(after.ok && after.page.artifacts.some((artifact) => artifact.sourceId === "f-1")).toBe(false);
    expect((await sql.get<{ id: string }>("SELECT id FROM files WHERE id = 'f-1'"))?.id).toBe("f-1");
    const foreign = await postFiles(write("/files", lead, { client: "acme.example", fileId: "missing", selected: true }));
    expect(foreign.status).toBe(404);
  });

  it("shares a published piece for this client and refuses another client's piece", async () => {
    const { lead } = await seed();
    const before = (await sql.get<{ n: number }>("SELECT count(*) AS n FROM social_posts"))?.n;
    const foreign = await postShares(write("/shares", lead, { client: "acme.example", action: "create", itemIds: ["i-other"] }));
    expect(foreign.status).toBe(404);
    const created = await postShares(write("/shares", lead, { client: "acme.example", action: "create", itemIds: ["i-open"] }));
    expect(created.status).toBe(200);
    const share = await created.json() as { id: string; url: string };
    expect(share.url).toContain("/view/");
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM social_posts"))?.n).toBe(before);
    const revoked = await postShares(write("/shares", lead, { client: "acme.example", action: "revoke", shareId: share.id }));
    expect(revoked.status).toBe(200);
    expect((await sql.get<{ revoked_at: number | null }>("SELECT revoked_at FROM library_shares WHERE id = ?", [share.id]))?.revoked_at).not.toBeNull();
  });

  it("lets a managed lead release its own round without approving it", async () => {
    const { lead, hire } = await seed();
    const draft = await postWork(write("/work", lead, { action: "release" }), { params: Promise.resolve({ id: "work-held" }) });
    expect(draft.status).toBe(403);
    expect(await draft.json()).toMatchObject({ reasonCode: "policy_mode" });
    expect((await sql.get<{ published_version: number | null }>("SELECT published_version FROM deliverables WHERE id = 'd-held'"))?.published_version).toBeNull();
    await sql.run(
      "INSERT INTO social_agent_policies (organization_id, mode, capabilities_json, updated_at) VALUES ('org-1', 'managed', '{}', ?)",
      [NOW],
    );
    const hireRelease = await postWork(write("/work", hire, { action: "release" }), { params: Promise.resolve({ id: "work-hire" }) });
    expect(hireRelease.status).toBe(403);
    const released = await postWork(write("/work", lead, { action: "release" }), { params: Promise.resolve({ id: "work-held" }) });
    expect(released.status).toBe(200);
    expect((await sql.get<{ status: string; published_version: number }>("SELECT status, published_version FROM deliverables WHERE id = 'd-held'"))).toMatchObject({
      status: "in_review",
      published_version: 1,
    });
    expect((await sql.get<{ status: string }>("SELECT status FROM deliverable_items WHERE id = 'i-held'"))?.status).toBe("pending");
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM social_posts WHERE deliverable_id = 'd-held'"))?.n).toBe(0);
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM deliverable_notices WHERE deliverable_id = 'd-held'"))?.n).toBe(0);
    const visible = await listLibraryArtifacts(sql, client, { workspaceId: "ws-1", slug: "acme" });
    expect(visible.ok && visible.page.artifacts.some((artifact) => artifact.sourceId === "i-held")).toBe(true);
    await sql.run("UPDATE organizations SET client_update_mode = 'auto' WHERE id = 'org-1'");
    await sql.run("UPDATE social_agent_policies SET mode = 'managed' WHERE organization_id = 'org-1'");
    const auto = await postWork(write("/work", lead, { action: "release" }), { params: Promise.resolve({ id: "work-auto" }) });
    expect(auto.status).toBe(200);
    expect((await sql.get<{ status: string }>("SELECT status FROM deliverable_items WHERE id = 'i-auto'"))?.status).toBe("pending");
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM deliverable_notices WHERE deliverable_id = 'd-auto'"))?.n).toBe(1);
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM social_posts WHERE deliverable_id = 'd-auto'"))?.n).toBe(0);
  });
});
