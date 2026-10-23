import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getModels } from "@/app/api/agent-media/models/route";
import { POST as postMedia } from "@/app/api/agent-media/route";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { adaptArtifact } from "@/lib/artifact-adapter";
import { generateAgentMedia, readAgentMedia, type MediaAi } from "@/lib/agent-media";
import { DEFAULT_CLIP, DEFAULT_STILL } from "@/lib/agent-media-models";
import { agentForToken, fileAgentWork, registerClientAgent } from "@/lib/agent-work-filing";
import { localObjectStore, type ObjectStore } from "@/lib/store/objects";

const NOW = 1_700_000_000_000;
const CTX = Symbol.for("__cloudflare-context__");
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

let sql: Sql;
let d1: D1Like;
let store: ObjectStore;
let root: string;

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
  root = mkdtempSync(path.join(tmpdir(), "agent-media-"));
  store = localObjectStore(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete (globalThis as Record<symbol, unknown>)[CTX];
});

async function org(name: string, domain: string): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, ?, ?, 'client', ?, ?)", [id, name, domain, NOW, NOW]);
  return id;
}

async function space(organizationId: string, slug: string): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id)
     VALUES (?, ?, ?, ?, 'Abra-ca-dabra', 'standard', 1000000000, 365, 0, 'active', ?, ?)`,
    [id, slug, slug, slug, NOW, organizationId],
  );
  return id;
}

async function task(organizationId: string, status = "todo"): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    "INSERT INTO tasks (id, organization_id, title, status, created_at, updated_at) VALUES (?, ?, 'Hero', ?, ?, ?)",
    [id, organizationId, status, NOW, NOW],
  );
  return id;
}

async function agentFor(organizationId: string | null, agentId = "acme-agent") {
  const made = await registerClientAgent(sql, { agentId, label: "Acme agent", organizationId, actor: "test", now: NOW });
  if (!made.ok || !made.token) throw new Error("register failed");
  const principal = await agentForToken(sql, `Bearer ${made.token}`);
  if (!principal) throw new Error("token failed");
  return { token: made.token, principal };
}

function pngAi(calls: unknown[]): MediaAi {
  return {
    async run(model, input) {
      calls.push({ model, input });
      return { image: PNG };
    },
  };
}

describe("generateAgentMedia", () => {
  it("refuses a token with no assignment", async () => {
    const { principal, token } = await agentFor(null, "drifter");
    const result = await generateAgentMedia({ sql, store, agent: principal, body: {}, now: NOW, ai: pngAi([]) });
    expect(result).toMatchObject({ ok: false, status: 401 });
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
    const response = await postMedia(new Request("https://hq.example/api/agent-media", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{}",
    }));
    expect(response.status).toBe(401);
  });

  it("refuses a task on another client", async () => {
    const acme = await org("Acme", "acme.example");
    const other = await org("Other", "other.example");
    await space(acme, "acme");
    const { principal } = await agentFor(acme);
    const result = await generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "run:hero", task_id: await task(other), model: DEFAULT_STILL, prompt: "A quiet shop" },
      now: NOW,
      ai: pngAi([]),
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM agent_media"))?.n).toBe(0);
  });

  it("stores one still and does not call the model again for the same external id", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme");
    const { principal } = await agentFor(acme);
    const calls: unknown[] = [];
    const body = { external_id: "run:hero", task_id: await task(acme), model: DEFAULT_STILL, prompt: "A quiet shop counter" };
    const first = await generateAgentMedia({ sql, store, agent: principal, body, now: NOW, ai: pngAi(calls) });
    const second = await generateAgentMedia({ sql, store, agent: principal, body, now: NOW + 1, ai: pngAi(calls) });
    expect(first).toMatchObject({ ok: true, status: 201, view: { state: "ready", kind: "image", content_type: "image/png", name: "hero.png" } });
    expect(second).toMatchObject({ ok: true, status: 200, view: { state: "ready", media_id: first.ok ? first.view.media_id : "" } });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ model: DEFAULT_STILL });
    expect(JSON.stringify(calls[0])).toContain("multipart");
    const row = await sql.get<{ r2_key: string }>("SELECT r2_key FROM agent_media");
    expect((await store.read(row?.r2_key ?? ""))?.byteLength).toBeGreaterThan(8);
    const activity = await sql.get<{ kind: string; body: string; data_json: string }>("SELECT kind, body, data_json FROM activities WHERE kind = 'client_agent.media'");
    expect(activity?.kind).toBe("client_agent.media");
    expect(activity?.body).not.toContain("quiet");
    expect(activity?.data_json).toContain(DEFAULT_STILL);
    expect(JSON.stringify(first)).not.toContain("iVBORw0");
  });

  it("keeps a running clip free of provider urls and stores the file when it finishes", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme");
    const { principal } = await agentFor(acme);
    const taskId = await task(acme);
    const mp4 = new Uint8Array(16);
    mp4.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], 0);
    const started = await generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "clip:spot", task_id: taskId, model: DEFAULT_CLIP, prompt: "Opening the shop", duration_seconds: 6 },
      now: NOW,
      ai: { async run() { return { job_id: "job-1" }; } },
    });
    expect(started).toMatchObject({ ok: true, status: 202, view: { state: "running", job_id: "job-1", kind: "video" } });
    expect(JSON.stringify(started)).not.toContain("https://");
    if (!started.ok) throw new Error("not started");
    const finished = await readAgentMedia({
      sql,
      store,
      agent: principal,
      mediaId: started.view.media_id,
      now: NOW + 5,
      ai: { async run(_model, input) { expect(input).toEqual({ request_id: "job-1" }); return { video: "https://cdn.example/clip.mp4" }; } },
      fetchImpl: (async () => new Response(mp4, { headers: { "content-type": "video/mp4" } })) as typeof fetch,
    });
    expect(finished).toMatchObject({ ok: true, view: { state: "ready", content_type: "video/mp4", name: "spot.mp4" } });
    expect(JSON.stringify(finished)).not.toContain("https://");
    expect(JSON.stringify(finished)).not.toContain("base64");
  });

  it("fetches a finished clip url itself and does not hand that url back", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme");
    const { principal } = await agentFor(acme);
    const mp4 = new Uint8Array(16);
    mp4.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], 0);
    let fetched = "";
    const result = await generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "clip:now", task_id: await task(acme), model: "pruna/p-video", prompt: "A short pan" },
      now: NOW,
      ai: { async run() { return { video: "https://cdn.example/now.mp4" }; } },
      fetchImpl: (async (url: string) => {
        fetched = url;
        return new Response(mp4, { headers: { "content-type": "video/mp4" } });
      }) as typeof fetch,
    });
    expect(fetched).toBe("https://cdn.example/now.mp4");
    expect(result).toMatchObject({ ok: true, status: 201, view: { state: "ready", content_type: "video/mp4" } });
    expect(JSON.stringify(result)).not.toContain("cdn.example");
  });

  it("refuses to pick a model when the agent does not name one", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme");
    const { principal } = await agentFor(acme);
    const calls: unknown[] = [];
    const result = await generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "run:hero", prompt: "A quiet shop" },
      now: NOW,
      ai: pngAi(calls),
    });
    expect(result).toMatchObject({ ok: false, status: 400, message: "model is required." });
    expect(calls).toHaveLength(0);
  });

  it("stores a still for the only assigned client when there is no card", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme");
    const { principal } = await agentFor(acme);
    const result = await generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "run:loose", model: DEFAULT_STILL, prompt: "A quiet shop" },
      now: NOW,
      ai: pngAi([]),
    });
    expect(result).toMatchObject({ ok: true, status: 201, view: { state: "ready", kind: "image" } });
    const row = await sql.get<{ task_id: string | null; organization_id: string }>("SELECT task_id, organization_id FROM agent_media");
    expect(row?.task_id).toBeNull();
    expect(row?.organization_id).toBe(acme);
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM social_posts"))?.n).toBe(0);
    if (!result.ok) throw new Error("still failed");
    const filed = await fileAgentWork(sql, store, principal, { external_id: "file-loose", title: "Loose still", media_ids: [result.view.media_id] }, NOW);
    expect(filed).toMatchObject({ ok: true, state: "filed" });
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM social_posts"))?.n).toBe(0);
  });

  it("asks which client when the agent has several and no card", async () => {
    const acme = await org("Acme", "acme.example");
    const other = await org("Other", "other.example");
    await space(acme, "acme");
    await space(other, "other");
    const { token } = await agentFor(acme);
    await registerClientAgent(sql, { agentId: "acme-agent", label: "Acme agent", organizationId: other, actor: "test", now: NOW });
    const principal = await agentForToken(sql, `Bearer ${token}`);
    const missing = await generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "run:which", model: DEFAULT_STILL, prompt: "A quiet shop" },
      now: NOW,
      ai: pngAi([]),
    });
    expect(missing).toMatchObject({ ok: false, status: 400, message: "Name the client." });
    const named = await generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "run:which", model: DEFAULT_STILL, prompt: "A quiet shop", client: "other.example" },
      now: NOW,
      ai: pngAi([]),
    });
    expect(named).toMatchObject({ ok: true, status: 201 });
    const row = await sql.get<{ organization_id: string; task_id: string | null }>("SELECT organization_id, task_id FROM agent_media");
    expect(row).toEqual({ organization_id: other, task_id: null });
  });

  it("sends the reference still in the field that model expects", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme");
    const { principal } = await agentFor(acme);
    const still = await generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "run:plate", model: DEFAULT_STILL, prompt: "A plate" },
      now: NOW,
      ai: pngAi([]),
    });
    if (!still.ok) throw new Error("still failed");
    const calls: { model: string; input: unknown }[] = [];
    const clip = await generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "clip:from-still", model: DEFAULT_CLIP, prompt: "The plate turns", image_media_id: still.view.media_id, duration_seconds: 4 },
      now: NOW,
      ai: { async run(model, input) { calls.push({ model, input }); return { job_id: "job-still" }; } },
    });
    expect(clip).toMatchObject({ ok: true, status: 202 });
    if (!clip.ok) throw new Error("clip failed");
    expect((await sql.get<{ source_media_id: string | null }>("SELECT source_media_id FROM agent_media WHERE id = ?", [clip.view.media_id]))?.source_media_id).toBe(still.view.media_id);
    expect(calls[0]?.model).toBe(DEFAULT_CLIP);
    expect(calls[0]?.input).toMatchObject({ prompt: "The plate turns", duration: "4s", image_input: PNG });
    expect(calls[0]?.input).not.toHaveProperty("image");
    const sharper = await generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "run:sharp", model: "pruna/p-image-upscale", image_media_id: still.view.media_id },
      now: NOW,
      ai: { async run(_model, input) { calls.push({ model: "pruna/p-image-upscale", input }); return { image: PNG }; } },
    });
    expect(sharper).toMatchObject({ ok: true, status: 201, view: { kind: "image" } });
    expect(calls[1]?.input).toEqual({ image: expect.stringMatching(/^data:image\/png;base64,/) });
    const flux = await generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "clip:flux", model: "black-forest-labs/flux-3-video", prompt: "The plate turns" },
      now: NOW,
      ai: { async run(_model, input) { calls.push({ model: "black-forest-labs/flux-3-video", input }); return { job_id: "job-flux" }; } },
    });
    expect(flux).toMatchObject({ ok: true, status: 202 });
    expect(calls[2]?.input).toMatchObject({ mode: "t2v", duration: 6, prompt: "The plate turns" });
    const tooShort = await generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "clip:flux-short", model: "black-forest-labs/flux-3-video", prompt: "The plate turns", duration_seconds: 4 },
      now: NOW,
      ai: pngAi([]),
    });
    expect(tooShort).toMatchObject({ ok: false, status: 400, message: "duration_seconds must be 6 or 8." });
    const animated = await generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "clip:p", model: "pruna/p-video", prompt: "The plate turns", image_media_id: still.view.media_id },
      now: NOW,
      ai: { async run(_model, input) { calls.push({ model: "pruna/p-video", input }); return { job_id: "job-p" }; } },
    });
    expect(animated).toMatchObject({ ok: true, status: 202 });
    expect(calls[3]?.input).toMatchObject({ prompt: "The plate turns", duration: 6, fps: 24, resolution: "720p", image: expect.stringMatching(/^data:image\/png;base64,/) });
  });
});

describe("model failures", () => {
  async function failing(error: unknown, model = DEFAULT_STILL) {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme");
    const { principal } = await agentFor(acme);
    return generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "run:fail", task_id: await task(acme), model, prompt: "A private brief" },
      now: NOW,
      ai: { async run() { throw error; } },
    });
  }

  it("answers 402 when the account is out of model credit", async () => {
    const result = await failing(Object.assign(new Error("AiError: payment required"), { status: 402 }), "google/nano-banana-2");
    expect(result).toEqual({ ok: false, status: 402, message: "Model credits exhausted on the Cloudflare account.", reason: "credits_exhausted" });
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM agent_media"))?.n).toBe(0);
  });

  it("answers 502 with a safe reason for other failures", async () => {
    expect(await failing(Object.assign(new Error("400 unknown provider"), { status: 400 }))).toMatchObject({ ok: false, status: 502, reason: "bad_input" });
  });

  it("answers 502 model_error for an unexplained failure and logs without the prompt", async () => {
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { logged.push(args); };
    try {
      const result = await failing(new Error("upstream said: A private brief is not allowed"));
      expect(result).toMatchObject({ ok: false, status: 502, reason: "model_error", message: "The model did not answer (model_error)." });
    } finally {
      console.error = original;
    }
    expect(logged).toHaveLength(1);
    expect(logged[0][0]).toBe("agent-media model failure");
    const line = JSON.stringify(logged[0]);
    expect(line).toContain(DEFAULT_STILL);
    expect(line).not.toContain("private brief");
  });

  it("returns the status and reason from the route and keeps the error key", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme");
    const { token } = await agentFor(acme);
    (globalThis as Record<symbol, unknown>)[CTX] = {
      env: { DB: d1, AI: { async run() { throw Object.assign(new Error("payment required"), { status: 402 }); } } },
    };
    const response = await postMedia(new Request("https://hq.example/api/agent-media", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ external_id: "run:402", task_id: await task(acme), model: "google/nano-banana-2", prompt: "A shop" }),
    }));
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "Model credits exhausted on the Cloudflare account.", reason: "credits_exhausted" });
  });
});

describe("model catalog route", () => {
  it("returns only the models that fit the job", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme");
    const { token } = await agentFor(acme);
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
    const response = await getModels(new Request("https://hq.example/api/agent-media/models?fits=text-to-video", {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(response.status).toBe(200);
    const body = await response.json() as { models: { id: string; fits: string[]; note: string }[] };
    expect(body.models.some((model) => model.id === DEFAULT_CLIP)).toBe(true);
    expect(body.models.some((model) => model.id === DEFAULT_STILL)).toBe(false);
    expect(body.models.every((model) => model.fits.includes("text-to-video") && model.note.length > 0)).toBe(true);
    const bad = await getModels(new Request("https://hq.example/api/agent-media/models?fits=poster", {
      headers: { authorization: `Bearer ${token}` },
    }));
    expect(bad.status).toBe(400);
  });
});

describe("file stored media", () => {
  it("copies a ready still into the filing and refuses another agent's file or a running clip", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme");
    const { principal } = await agentFor(acme);
    const other = await agentFor(acme, "other-agent");
    const taskId = await task(acme);
    const still = await generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "run:hero", task_id: taskId, model: DEFAULT_STILL, prompt: "A quiet shop" },
      now: NOW,
      ai: pngAi([]),
    });
    if (!still.ok) throw new Error("still failed");
    const filed = await fileAgentWork(sql, store, principal, { external_id: "file-1", title: "Hero still", media_ids: [still.view.media_id] }, NOW);
    expect(filed).toMatchObject({ ok: true, state: "filed" });
    if (!filed.ok || filed.state !== "filed") throw new Error("not filed");
    expect(filed.paths.some((item) => item.endsWith("hero.png"))).toBe(true);
    const clip = await generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "clip:from-hero", task_id: taskId, model: DEFAULT_CLIP, prompt: "The shop opens", image_media_id: still.view.media_id, duration_seconds: 4 },
      now: NOW,
      ai: { async run() { return { job_id: "job-hero" }; } },
    });
    if (!clip.ok) throw new Error("clip failed");
    const finished = await readAgentMedia({
      sql,
      store,
      agent: principal,
      mediaId: clip.view.media_id,
      now: NOW + 5,
      ai: { async run() { return { video: "https://cdn.example/clip.mp4" }; } },
      fetchImpl: (async () => {
        const bytes = new Uint8Array(16);
        bytes.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], 0);
        return new Response(bytes, { headers: { "content-type": "video/mp4" } });
      }) as typeof fetch,
    });
    expect(finished.ok).toBe(true);
    const both = await fileAgentWork(sql, store, principal, { external_id: "file-both", title: "Hero clip", media_ids: [still.view.media_id, clip.view.media_id] }, NOW + 6);
    expect(both).toMatchObject({ ok: true, state: "filed" });
    const poster = await sql.get<{ poster_file_id: string }>(
      `SELECT fp.poster_file_id FROM file_posters fp
       JOIN files clip_file ON clip_file.id = fp.file_id
       JOIN files still_file ON still_file.id = fp.poster_file_id
       WHERE clip_file.relative_path LIKE '%.mp4' AND still_file.relative_path LIKE '%.png'`,
    );
    expect(poster?.poster_file_id).toBeTruthy();
    const saved = await sql.get<{ declared_content_type: string; held_at: number | null }>(
      "SELECT f.declared_content_type, b.held_at FROM files f JOIN batches b ON b.id = f.batch_id WHERE f.relative_path LIKE '%hero.png'",
    );
    expect(saved?.declared_content_type).toBe("image/png");
    expect(saved?.held_at).toBe(NOW);
    const before = (await sql.get<{ n: number }>("SELECT count(*) AS n FROM agent_work_items"))?.n;
    const stolen = await fileAgentWork(sql, store, other.principal, { external_id: "file-2", title: "Stolen", media_ids: [still.view.media_id] }, NOW);
    expect(stolen).toMatchObject({ ok: false, error: "forbidden" });
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM agent_work_items"))?.n).toBe(before);
    const running = await generateAgentMedia({
      sql,
      store,
      agent: principal,
      body: { external_id: "clip:spot", task_id: taskId, model: DEFAULT_CLIP, prompt: "Pan", duration_seconds: 4 },
      now: NOW,
      ai: { async run() { return { job_id: "job-9" }; } },
    });
    if (!running.ok) throw new Error("clip failed");
    const early = await fileAgentWork(sql, store, principal, { external_id: "file-3", title: "Too soon", media_ids: [running.view.media_id] }, NOW);
    expect(early).toMatchObject({ ok: false, error: "conflict" });
    expect(adaptArtifact("data:video/mp4;base64,AAAAIGZ0eXAAAA==")?.kind).toBe("markdown");
  });
});
