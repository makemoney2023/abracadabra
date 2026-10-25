import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import type { Sql } from "@/db/sql";
import { POST as channelPost } from "@/app/api/client-messages/route";
import { agentWakes, dueOrganizations, wakeDueAgents, wakeOrganization, WORK_WAKE_CRON } from "@/lib/agent-wake";
import { advanceClientWork, qualifyLead } from "@/lib/client-plan";
import { listClientUpdates, noteKickoff } from "@/lib/client-work";
import { bulkEmailReasons, logInboundEmail } from "@/lib/email-intake";
import { finishManualLead } from "@/lib/lead-schema";

const NOW = 1_700_000_000_000;
const ENV = { AGENT_URL: "https://agent.example", AGENT_WAKE_SECRET: "wake-secret" };
let directory = "";
let sql: Sql;

beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "handoff-retire-"));
  process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.sqlite");
  sql = await openHandoffDb();
  await migrate(sql);
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  delete process.env.HANDOFF_SQLITE_PATH;
  delete process.env.AGENT_WAKES;
  delete process.env.AGENT_MODE;
  delete process.env.CLIENT_CHANNEL_SECRET;
});

async function org(id: string, kind = "client", domain: string | null = null): Promise<void> {
  await sql.run("INSERT INTO organizations (id, name, kind, domain, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [id, id, kind, domain, NOW, NOW]);
}

async function openTask(organizationId: string): Promise<void> {
  await sql.run("INSERT INTO tasks (id, organization_id, title, status, created_at, updated_at) VALUES (?, ?, 'Homepage', 'todo', ?, ?)", [
    `task-${organizationId}`,
    organizationId,
    NOW,
    NOW,
  ]);
}

async function leadBot(organizationId: string): Promise<void> {
  await sql.run("INSERT INTO client_agents (id, label, token_hash, created_at, updated_at) VALUES (?, 'Lead bot', ?, ?, ?)", [`bot-${organizationId}`, `hash-${organizationId}`, NOW, NOW]);
  await sql.run(
    "INSERT INTO agent_assignments (id, agent_id, organization_id, role, assigned_at) VALUES (?, ?, ?, 'lead', ?)",
    [`as-${organizationId}`, `bot-${organizationId}`, organizationId, NOW],
  );
}

function okFetch() {
  return vi.fn(async () => new Response(JSON.stringify({ outcome: "started" }), { status: 200 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

async function failures(): Promise<number> {
  return Number((await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM activities WHERE kind = 'agent.wake_failed'"))?.n ?? 0);
}

describe("AGENT_WAKES", () => {
  it("defaults to off and reads all / no_lead_bot from the env or the process", () => {
    expect(agentWakes({})).toBe("off");
    expect(agentWakes({ AGENT_WAKES: "nonsense" })).toBe("off");
    expect(agentWakes({ AGENT_WAKES: "ALL" })).toBe("all");
    expect(agentWakes({ AGENT_WAKES: " no_lead_bot " })).toBe("no_lead_bot");
    process.env.AGENT_WAKES = "all";
    expect(agentWakes({})).toBe("all");
  });

  it("off: wakeOrganization skips without calling the agent or logging a failure", async () => {
    await org("org-1");
    const fetchImpl = okFetch();
    expect(await wakeOrganization(ENV, "org-1", "work", NOW, fetchImpl, sql)).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("all: wakes as before; no_lead_bot skips a client with a live lead bot and fails closed without a database", async () => {
    await org("org-bot");
    await org("org-plain");
    await leadBot("org-bot");
    const fetchImpl = okFetch();
    expect(await wakeOrganization({ ...ENV, AGENT_WAKES: "all" }, "org-bot", "work", NOW, fetchImpl, sql)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const env = { ...ENV, AGENT_WAKES: "no_lead_bot" };
    expect(await wakeOrganization(env, "org-bot", "work", NOW, fetchImpl, sql)).toBe("skipped");
    expect(await wakeOrganization(env, "org-plain", "work", NOW, fetchImpl, sql)).toBe(true);
    expect(await wakeOrganization(env, "org-plain", "work", NOW, fetchImpl)).toBe("skipped");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("the every-minute job wakes nobody and logs no failure when off; no_lead_bot wakes only clients without a lead bot", async () => {
    await org("org-bot");
    await org("org-plain");
    await leadBot("org-bot");
    await openTask("org-bot");
    await openTask("org-plain");
    const fetchImpl = okFetch();
    await wakeDueAgents(sql, { AGENT_URL: "", AGENT_WAKE_SECRET: "" }, WORK_WAKE_CRON, NOW, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await failures()).toBe(0);
    await wakeDueAgents(sql, { ...ENV, AGENT_WAKES: "no_lead_bot" }, WORK_WAKE_CRON, NOW, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String((fetchImpl.mock.calls[0] as unknown[])[1] && ((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body)));
    expect(sent.organizationId).toBe("org-plain");
  });

  it("drops the weekly status wake: no targets, and no Monday cron in wrangler.jsonc; the other crons stay", async () => {
    await org("org-1");
    expect(await dueOrganizations(sql, "0 8 * * 1", NOW)).toEqual([]);
    const raw = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
    const crons = JSON.parse(raw.match(/"crons":\s*(\[[^\]]*\])/)![1]) as string[];
    // The daily Search Console cron (30 8 * * *) only enqueues sync work; scheduled() never wakes agents on it.
    expect(crons).toEqual(["* * * * *", "0 * * * *", "30 8 * * *"]);
    expect(crons.some((cron) => cron.endsWith(" 1"))).toBe(false);
  });

  it("a manual lead with wakes off logs no wake failure", async () => {
    await org("lead-1", "lead");
    const fetchImpl = okFetch();
    await finishManualLead({ sql, organizationId: "lead-1", website: "", now: NOW, env: ENV, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await failures()).toBe(0);
  });

  it("a skipped kickoff writes no misleading 'wake failed' note", async () => {
    await org("org-1");
    await noteKickoff(sql, "org-1", "skipped", NOW);
    expect(await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM activities WHERE kind = 'client_work.kickoff'")).toEqual({ n: 0 });
  });
});

function recorder(context: unknown) {
  const calls: string[] = [];
  const call = async (name: string) => {
    calls.push(name);
    if (name === "client_context") return context;
    if (name === "store_scan_context") return { score: 40, context: "Scan says hi." };
    return {};
  };
  return { calls, call };
}

describe("agents mode: no placeholder step engine or lead pickup", () => {
  const context = {
    organization: { id: "org-1", name: "Acme", agentPausedAt: null },
    tasks: [
      {
        id: "t1",
        title: "Homepage",
        status: "doing",
        stage: "build",
        skills: [{ path: "community/x/SKILL.md", status: "todo" }],
      },
    ],
  };

  it("advanceClientWork does nothing in agents mode, so only client bots and Client Services move cards", async () => {
    process.env.AGENT_MODE = "agents";
    const { calls, call } = recorder(context);
    const result = await advanceClientWork({ call, requestId: "w1", now: NOW, readSkill: async () => "skill body" });
    expect(result).toEqual({ advanced: 0, reschedule: false });
    expect(calls.filter((name) => name !== "client_context")).toEqual([]);
  });

  it("qualifyLead in agents mode files the scan context only: no placeholder note, no Qualify task, no file", async () => {
    process.env.AGENT_MODE = "agents";
    const { calls, call } = recorder({ organization: { id: "lead-1", name: "Acme" }, tasks: [] });
    expect(await qualifyLead({ call, requestId: "w1" })).toBe("skipped");
    expect(calls).toEqual(["client_context", "store_scan_context"]);
  });

  it("legacy mode keeps the old lead pickup", async () => {
    const { calls, call } = recorder({ organization: { id: "lead-1", name: "Acme" }, tasks: [] });
    await qualifyLead({ call, requestId: "w1" });
    expect(calls).toContain("add_note");
    expect(calls).toContain("create_task");
  });
});

describe("email desk is log-only", () => {
  const vendor = {
    sender: "news@mail.cursor.com",
    name: "Cursor",
    subject: "Your environment is almost ready",
    text: "Just one thing needs your input.",
    messageId: "<m1@cursor.com>",
    threadId: "<m1@cursor.com>",
    references: "",
    listUnsubscribe: "<https://cursor.com/unsub>",
    listId: "",
    precedence: "",
    autoSubmitted: "",
    authenticationResults: "",
    attachments: 0,
  };

  it("spots bulk and vendor senders", () => {
    expect(bulkEmailReasons(vendor)).toContain("list-unsubscribe");
    expect(bulkEmailReasons({ ...vendor, listUnsubscribe: "", sender: "no-reply@muapi.ai" })).toContain("no-reply sender");
    expect(bulkEmailReasons({ ...vendor, listUnsubscribe: "", sender: "noreply@x.ai" })).toContain("no-reply sender");
    expect(bulkEmailReasons({ ...vendor, listUnsubscribe: "", sender: "mailer-daemon@google.com" })).toContain("no-reply sender");
    expect(bulkEmailReasons({ ...vendor, listUnsubscribe: "", precedence: "bulk" })).toContain("precedence: bulk");
    expect(bulkEmailReasons({ ...vendor, listUnsubscribe: "", autoSubmitted: "auto-generated" })).toContain("auto-submitted");
    expect(bulkEmailReasons({ ...vendor, listUnsubscribe: "", listId: "<news.cursor.com>" })).toContain("list-id");
    expect(bulkEmailReasons({ ...vendor, listUnsubscribe: "", sender: "ada@northwind.example" })).toEqual([]);
  });

  it("a vendor newsletter is logged and posted to the Client Services feed, with no lead and no org", async () => {
    const orgsBefore = await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM organizations");
    const result = await logInboundEmail(sql, vendor, NOW);
    expect(result).toMatchObject({ logged: true, bulk: true, leadCreated: false, organizationId: null });
    expect(await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM organizations")).toEqual(orgsBefore);
    const activity = await sql.get<{ body: string; data_json: string; organization_id: string | null }>(
      "SELECT body, data_json, organization_id FROM activities WHERE kind = 'email.received'",
    );
    expect(activity?.body).toBe("New email from news@mail.cursor.com: Your environment is almost ready");
    expect(JSON.parse(activity!.data_json)).toMatchObject({ bulk: true, message_id: "<m1@cursor.com>" });
    const feed = await listClientUpdates(sql, { since: null, now: NOW + 1, origin: "https://hq.example" });
    expect(Array.isArray(feed) && feed.map((row) => [row.kind, row.summary])).toEqual([
      ["email.received", "New email from news@mail.cursor.com: Your environment is almost ready"],
    ]);
  });

  it("logs each message once", async () => {
    await logInboundEmail(sql, vendor, NOW);
    expect(await logInboundEmail(sql, vendor, NOW + 5)).toMatchObject({ logged: false, duplicate: true });
    expect(await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM activities WHERE kind = 'email.received'")).toEqual({ n: 1 });
  });

  it("a known client's email lands on that client; a new person opens a lead; neither gets a reply", async () => {
    await org("org-acme", "client", "acme.example");
    await sql.run("INSERT INTO contacts (id, organization_id, name, email, created_at, updated_at) VALUES ('c1', 'org-acme', 'Ann', 'ann@acme.example', ?, ?)", [NOW, NOW]);
    const known = await logInboundEmail(sql, { ...vendor, sender: "ann@acme.example", listUnsubscribe: "", messageId: "<k1@acme>" }, NOW);
    expect(known).toMatchObject({ logged: true, bulk: false, organizationId: "org-acme", leadCreated: false });
    const human = await logInboundEmail(
      sql,
      { ...vendor, sender: "ada@northwind.example", name: "Ada North", listUnsubscribe: "", messageId: "<h1@northwind>" },
      NOW + 1,
    );
    expect(human).toMatchObject({ logged: true, bulk: false, leadCreated: true });
    expect(human.logged && human.organizationId).toBeTruthy();
    expect(await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM activities WHERE kind = 'agent.reply'")).toEqual({ n: 0 });
  });

  it("POST /api/client-messages log_email logs through the channel secret", async () => {
    process.env.CLIENT_CHANNEL_SECRET = "channel-secret";
    const response = await channelPost(
      new Request("https://hq.example/api/client-messages", {
        method: "POST",
        headers: { authorization: "Bearer channel-secret", "content-type": "application/json" },
        body: JSON.stringify({ action: "log_email", ...vendor }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, value: { logged: true, bulk: true } });
  });
});
