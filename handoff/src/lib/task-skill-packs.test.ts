import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { GET as libraryGet } from "@/app/api/agent-skill-library/route";
import { GET as libraryReadGet } from "@/app/api/agent-skill-library/[...path]/route";
import { GET as agentSkillsGet } from "@/app/api/agent-skills/route";
import { GET as agentSkillGet } from "@/app/api/agent-skills/[...path]/route";
import { POST as boardTaskPost } from "@/app/api/agent-board/tasks/[taskId]/route";
import { GET as boardGet } from "@/app/api/agent-board/route";
import { listBoard } from "@/db/crm";
import { eraseTask } from "@/db/crm";
import { listAgentDispatches } from "./agent-dispatch";
import { agentForToken, registerClientAgent } from "./agent-work-filing";
import { grantSkills, listAgentSkills } from "./agent-skills";
import { libraryPacks } from "./skill-packs";
import { moveTaskStage } from "./task-stage";

const NOW = 1_700_000_000_000;
const CTX = Symbol.for("__cloudflare-context__");
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

class FakeSkills {
  constructor(private readonly objects: Record<string, string>) {}
  async get(key: string) {
    const value = this.objects[key];
    return value == null ? null : { text: async () => value };
  }
}

const bucket = new FakeSkills({
  "skills/index.json": JSON.stringify({
    skills: [
      { name: "copywriting", description: "Write landing page copy", path: "community/marketingskills/copywriting/SKILL.md", pack: "community" },
      { name: "page-cro", description: "Improve page conversion", path: "community/marketingskills/page-cro/SKILL.md", pack: "community" },
      { name: "seo-audit", description: "Audit a site for search", path: "community/notfair-seo/seo-audit/SKILL.md", pack: "community" },
      { name: "openvid", description: "Make short videos from a brief", path: "community/openvid/SKILL.md", pack: "community" },
      { name: "context-engineering", description: "Context engineering basics", path: "context-engineering/SKILL.md", pack: "context-engineering" },
      { name: "secret", description: "Client private", path: "org/acme/secret/SKILL.md", pack: "org" },
    ],
  }),
  "skills/community/marketingskills/copywriting/SKILL.md": "---\nname: copywriting\n---\nWrite clearly.",
  "skills/community/notfair-seo/seo-audit/SKILL.md": "---\nname: seo-audit\n---\nCheck titles.",
  "skills/community/openvid/SKILL.md": "---\nname: openvid\n---\nCut it short.",
});

beforeEach(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  d1 = d1Over(db);
  sql = d1Sql(d1);
  await migrate(sql);
  (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1, SKILLS: bucket } };
});

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.AGENT_MODE;
});

async function org(name: string, domain: string): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, ?, ?, 'client', ?, ?)", [id, name, domain, NOW, NOW]);
  const project = crypto.randomUUID();
  await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES (?, ?, 'Site', 'active', ?, ?)", [project, id, NOW, NOW]);
  return id;
}

async function task(organizationId: string, title: string, status = "todo", stage = "describe"): Promise<string> {
  const id = crypto.randomUUID();
  const project = await sql.get<{ id: string }>("SELECT id FROM projects WHERE organization_id = ?", [organizationId]);
  await sql.run(
    "INSERT INTO tasks (id, project_id, organization_id, title, status, stage, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
    [id, project!.id, organizationId, title, status, stage, NOW, NOW],
  );
  return id;
}

async function agent(organizationId: string | null, agentId: string, role: "lead" | "hire" = "lead") {
  const made = await registerClientAgent(sql, { agentId, label: `${agentId} bot`, organizationId, role, actor: "test", now: NOW });
  if (!made.ok || !made.token) throw new Error("register failed");
  return { token: made.token, principal: (await agentForToken(sql, `Bearer ${made.token}`))!, auth: { authorization: `Bearer ${made.token}`, "content-type": "application/json" } };
}

function act(taskId: string, auth: Record<string, string>, body: unknown) {
  return boardTaskPost(new Request(`https://hq.example/api/agent-board/tasks/${taskId}`, { method: "POST", headers: auth, body: JSON.stringify(body) }), {
    params: Promise.resolve({ taskId }),
  });
}

describe("full library for any agent", () => {
  it("groups the index into packs with counts and descriptions, and hides org/", async () => {
    const packs = await libraryPacks(bucket);
    expect(packs.ok && packs.packs.map((pack) => [pack.prefix, pack.count])).toEqual([
      ["community/marketingskills/", 2],
      ["community/notfair-seo/", 1],
      ["community/openvid/", 1],
      ["context-engineering/", 1],
    ]);
    const marketing = packs.ok ? packs.packs[0] : null;
    expect(marketing?.description).toContain("copywriting");
    const openvid = packs.ok ? packs.packs.find((pack) => pack.prefix === "community/openvid/") : null;
    expect(openvid?.description).toBe("Make short videos from a brief");
  });

  it("lists packs, searches, filters by pack, and reads any SKILL.md without a grant; token required", async () => {
    const { auth } = await agent(null, "free-agent");
    expect((await libraryGet(new Request("https://hq.example/api/agent-skill-library"))).status).toBe(401);
    const listed = await libraryGet(new Request("https://hq.example/api/agent-skill-library", { headers: auth }));
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { packs: { prefix: string }[]; skill_count: number; library_version: string };
    expect(body.packs).toHaveLength(4);
    expect(body.skill_count).toBe(5);
    expect(body.library_version).toMatch(/^[0-9a-f]{12}$/);
    const searched = await libraryGet(new Request("https://hq.example/api/agent-skill-library?q=audit", { headers: auth }));
    expect(((await searched.json()) as { skills: { path: string }[] }).skills.map((s) => s.path)).toEqual(["community/notfair-seo/seo-audit/SKILL.md"]);
    const pack = await libraryGet(new Request("https://hq.example/api/agent-skill-library?pack=community/marketingskills", { headers: auth }));
    expect(((await pack.json()) as { skills: { name: string }[] }).skills.map((s) => s.name)).toEqual(["copywriting", "page-cro"]);
    const read = await libraryReadGet(new Request("https://hq.example/api/agent-skill-library/x", { headers: auth }), {
      params: Promise.resolve({ path: ["community", "notfair-seo", "seo-audit", "SKILL.md"] }),
    });
    expect(read.status).toBe(200);
    expect(((await read.json()) as { body: string }).body).toContain("Check titles.");
    const hidden = await libraryReadGet(new Request("https://hq.example/api/agent-skill-library/x", { headers: auth }), {
      params: Promise.resolve({ path: ["org", "acme", "secret", "SKILL.md"] }),
    });
    expect(hidden.status).toBe(404);
    const missing = await libraryReadGet(new Request("https://hq.example/api/agent-skill-library/x", { headers: auth }), {
      params: Promise.resolve({ path: ["community", "nope", "SKILL.md"] }),
    });
    expect(missing.status).toBe(404);
  });
});

describe("attaching packs to a card", () => {
  it("attaches and detaches packs on a card of its client, logs the timeline, and shows on the board", async () => {
    const acme = await org("Acme", "acme.example");
    const id = await task(acme, "Homepage copy");
    const { auth } = await agent(acme, "acme-lead");
    const attached = await act(id, auth, { action: "attach_skills", prefixes: ["community/marketingskills", "community/openvid/SKILL.md"] });
    expect(attached.status).toBe(200);
    expect(await attached.json()).toMatchObject({ ok: true, task: { skill_packs: ["community/marketingskills/", "community/openvid/SKILL.md"] } });
    const again = await act(id, auth, { action: "attach_skills", prefixes: ["community/marketingskills/"] });
    expect(((await again.json()) as { task: { skill_packs: string[] } }).task.skill_packs).toHaveLength(2);
    const timeline = await sql.all<{ body: string; data_json: string }>(
      "SELECT body, data_json FROM activities WHERE kind = 'client_agent.board' ORDER BY created_at, rowid",
    );
    expect(timeline[0]?.body).toBe('acme-lead bot attached community/marketingskills/, community/openvid/SKILL.md to "Homepage copy".');
    expect(JSON.parse(timeline[0]!.data_json)).toMatchObject({ action: "attach_skills", task_id: id, prefixes: ["community/marketingskills/", "community/openvid/SKILL.md"] });
    expect(timeline).toHaveLength(1);

    const board = await boardGet(new Request("https://hq.example/api/agent-board", { headers: auth }));
    expect(((await board.json()) as { tasks: { skill_packs: string[] }[] }).tasks[0]?.skill_packs).toEqual(["community/marketingskills/", "community/openvid/SKILL.md"]);
    const staffBoard = await listBoard(sql, { userId: "u1", staff: { superAdmin: true }, operatorOf: [], memberships: [] } as never, {});
    expect(staffBoard.find((card) => card.id === id)?.skill_packs).toEqual(["community/marketingskills/", "community/openvid/SKILL.md"]);

    const detached = await act(id, auth, { action: "detach_skills", prefixes: ["community/openvid/SKILL.md"] });
    expect(await detached.json()).toMatchObject({ ok: true, task: { skill_packs: ["community/marketingskills/"] } });
    const last = await sql.get<{ body: string }>("SELECT body FROM activities WHERE kind = 'client_agent.board' ORDER BY created_at DESC, rowid DESC LIMIT 1");
    expect(last?.body).toBe('acme-lead bot detached community/openvid/SKILL.md from "Homepage copy".');
  });

  it("works for a hire on the client and while the card waits on Client Services, but not on a done card", async () => {
    const acme = await org("Acme", "acme.example");
    const id = await task(acme, "Homepage copy");
    await agent(acme, "acme-lead");
    const { auth } = await agent(acme, "acme-hire", "hire");
    await moveTaskStage(sql, { taskId: id, to: "review", now: NOW, actor: { kind: "staff", id: "u1" } });
    expect((await act(id, auth, { action: "attach_skills", prefixes: ["community/notfair-seo/"] })).status).toBe(200);
    const done = await task(acme, "Old", "done");
    expect((await act(done, auth, { action: "attach_skills", prefixes: ["community/notfair-seo/"] })).status).toBe(409);
  });

  it("403 for a card of another client, 404 for an unknown task or an unknown pack, 400 for no prefixes", async () => {
    const acme = await org("Acme", "acme.example");
    const beta = await org("Beta", "beta.example");
    const theirs = await task(beta, "Not yours");
    const mine = await task(acme, "Mine");
    const { auth } = await agent(acme, "acme-lead");
    expect((await act(theirs, auth, { action: "attach_skills", prefixes: ["community/marketingskills/"] })).status).toBe(403);
    expect((await act(theirs, auth, { action: "detach_skills", prefixes: ["community/marketingskills/"] })).status).toBe(403);
    expect((await act("missing", auth, { action: "attach_skills", prefixes: ["community/marketingskills/"] })).status).toBe(404);
    const unknown = await act(mine, auth, { action: "attach_skills", prefixes: ["community/nope/"] });
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as { error: string }).error).toContain("community/nope/");
    expect((await act(mine, auth, { action: "attach_skills", prefixes: ["org/acme/"] })).status).toBe(404);
    expect((await act(mine, auth, { action: "attach_skills", prefixes: ["../x"] })).status).toBe(404);
    expect((await act(mine, auth, { action: "attach_skills", prefixes: [] })).status).toBe(400);
    expect(await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM task_skill_packs")).toEqual({ n: 0 });
  });
});

describe("attached packs in the agent's skills", () => {
  it("adds attached packs on open cards to /api/agent-skills and the read route, on top of grants; task_id narrows", async () => {
    const acme = await org("Acme", "acme.example");
    const one = await task(acme, "One");
    const two = await task(acme, "Two");
    const { auth, principal } = await agent(acme, "acme-lead");
    await grantSkills(sql, { organizationId: acme, prefixes: ["community/notfair-seo/"], actor: "cs", now: NOW });
    await act(one, auth, { action: "attach_skills", prefixes: ["community/marketingskills/"] });
    await act(two, auth, { action: "attach_skills", prefixes: ["community/openvid/"] });

    const all = await listAgentSkills(sql, bucket, principal);
    expect(all.ok && all.skills.map((s) => s.name).sort()).toEqual(["copywriting", "openvid", "page-cro", "seo-audit"]);
    expect(all.ok && all.attached).toEqual([
      { task_id: one, prefix: "community/marketingskills/" },
      { task_id: two, prefix: "community/openvid/" },
    ]);
    const narrowed = await agentSkillsGet(new Request(`https://hq.example/api/agent-skills?task_id=${one}`, { headers: auth }));
    expect(((await narrowed.json()) as { skills: { name: string }[] }).skills.map((s) => s.name).sort()).toEqual(["copywriting", "page-cro", "seo-audit"]);
    const read = await agentSkillGet(new Request("https://hq.example/api/agent-skills/x", { headers: auth }), {
      params: Promise.resolve({ path: ["community", "marketingskills", "copywriting", "SKILL.md"] }),
    });
    expect(read.status).toBe(200);

    // Done: the card's packs drop out; the grant stays.
    await sql.run("UPDATE tasks SET status = 'done', done_at = ? WHERE id IN (?, ?)", [NOW, one, two]);
    const after = await listAgentSkills(sql, bucket, principal);
    expect(after.ok && after.skills.map((s) => s.name)).toEqual(["seo-audit"]);
    const denied = await agentSkillGet(new Request("https://hq.example/api/agent-skills/x", { headers: auth }), {
      params: Promise.resolve({ path: ["community", "marketingskills", "copywriting", "SKILL.md"] }),
    });
    expect(denied.status).toBe(403);
  });

  it("another client's agent does not get packs attached on someone else's card", async () => {
    const acme = await org("Acme", "acme.example");
    const beta = await org("Beta", "beta.example");
    const id = await task(acme, "One");
    const { auth } = await agent(acme, "acme-lead");
    const { principal: other } = await agent(beta, "beta-lead");
    await act(id, auth, { action: "attach_skills", prefixes: ["community/marketingskills/"] });
    const listed = await listAgentSkills(sql, bucket, other);
    expect(listed.ok && listed.skills).toEqual([]);
  });
});

describe("lead handoffs and task removal", () => {
  it("a lead dispatch says which packs are attached and how to attach more", async () => {
    process.env.AGENT_MODE = "agents";
    const acme = await org("Acme", "acme.example");
    const id = await task(acme, "Homepage");
    const { auth, principal } = await agent(acme, "acme-lead");
    await act(id, auth, { action: "attach_skills", prefixes: ["community/marketingskills/"] });
    await moveTaskStage(sql, { taskId: id, to: "doing", now: NOW + 1, actor: { kind: "staff", id: "u1" } });
    const [dispatch] = await listAgentDispatches(sql, principal);
    expect(dispatch?.task_id).toBe(id);
    expect(dispatch?.skills.attached).toEqual(["community/marketingskills/"]);
    expect(dispatch?.skills.library).toBe(`GET /api/agent-skill-library?q=<what the task needs, e.g. caption>&task_id=${id}`);
    expect(dispatch?.skills.attach).toContain(`POST /api/agent-board/tasks/${id}`);
    expect(dispatch?.skills.attach).toContain("attach_skills");
    const stored = await sql.get<{ data_json: string }>("SELECT data_json FROM activities WHERE kind = 'client_agent.dispatch'");
    expect(JSON.parse(stored!.data_json).skills).toMatchObject({ attached: ["community/marketingskills/"] });
  });

  it("deleting a task removes its attachments", async () => {
    const acme = await org("Acme", "acme.example");
    const id = await task(acme, "Temp");
    const { auth } = await agent(acme, "acme-lead");
    await act(id, auth, { action: "attach_skills", prefixes: ["community/marketingskills/"] });
    const removed = await eraseTask(sql, { taskId: id, organizationId: acme, actor: { kind: "agent", id: "k1" } }, NOW);
    expect(removed.ok).toBe(true);
    expect(await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM task_skill_packs")).toEqual({ n: 0 });
  });
});
