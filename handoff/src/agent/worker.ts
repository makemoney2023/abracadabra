import { Agent, getAgentByName, routeAgentRequest } from "agents";
import { adaptArtifact } from "../lib/artifact-adapter";
import { verifyWake } from "../lib/agent-wake";
import {
  draftClientDocuments,
  parseSkillCatalog,
  unwrapToolResult,
  type SkillCard,
  type ToolCaller,
} from "../lib/client-documents";
import { advanceClientWork, applyBriefChange, fileSwarmDelivery, planClientWork, qualifyLead } from "../lib/client-plan";
import { followRunningSwarm, readSwarmRun, runLeadSwarm } from "../lib/lead-swarm";
import { packsFromTemplates } from "../lib/pack-picker";
import { packTemplatesFromCatalog } from "../lib/pack-templates";
import {
  addressOf,
  bytesToBase64,
  clientTurnFromModel,
  handleInboundEmail,
  parseInboundEmail,
  replyMime,
  replyToClient,
  type ClientDesk,
  type ThreadState,
} from "../lib/client-channel";
import { MAILBOX_INSTRUCTIONS, PROSPECT_INSTRUCTIONS, mailboxUserContent } from "../lib/hq-chat-playbook";
import { handleSlackEvent } from "../lib/slack-channel";
import { callerForClientWork, mcpConnectTarget, mcpHttpCaller } from "../lib/mcp-connect";
import { skillObjectKey } from "../lib/skill-library";
import type { ChatBindings } from "./hq-chat";

export interface AgentBindings extends ChatBindings {
  ClientAgent: DurableObjectNamespace<ClientAgent>;
  HQ_CHAT?: DurableObjectNamespace;
  EMAIL?: SendEmail;
  SKILLS: R2Bucket;
  AI: Ai;
  MCP_PORTAL_URL: string;
  AGENT_WAKE_SECRET: string;
  CF_ACCESS_CLIENT_ID: string;
  CF_ACCESS_CLIENT_SECRET: string;
  MAGIC_EMAIL_FROM?: string;
  /** Public Cal.com link. Empty asks the prospect for two times. */
  BOOKING_URL?: string;
  SWARM_ORIGIN?: string;
  HANDOFF_MCP_URL?: string;
  AGENT_MCP_TOKEN?: string;
  SLACK_SIGNING_SECRET?: string;
  SLACK_BOT_TOKEN?: string;
  SLACK_BOT_USER_ID?: string;
  SLACK_STAFF_USER_IDS?: string;
}

type SkillFile = { skills?: { name?: unknown }[] } | { name?: unknown }[];

/** Tool names the portal listed. An empty server list falls back to the SDK map. */
export function toolNamesFrom(
  listed: { name?: string }[],
  aiTools: Record<string, unknown> | undefined,
): string[] {
  const fromServer = listed.map((tool) => tool.name).filter((name): name is string => Boolean(name));
  if (fromServer.length > 0) return fromServer;
  return Object.keys(aiTools ?? {});
}

/** Names from `skills/index.json`. A broken file yields an empty list. */
export function parseSkillIndex(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as SkillFile;
    const list = Array.isArray(parsed) ? parsed : parsed.skills;
    if (!Array.isArray(list)) return [];
    return list.flatMap((entry) => (typeof entry?.name === "string" && entry.name ? [entry.name] : []));
  } catch {
    return [];
  }
}

type PortalTools = {
  getAITools?: () => Record<string, unknown>;
  waitForConnections?: (options?: { timeout?: number }) => Promise<unknown>;
  discoverIfConnected?: (serverId: string, options?: { timeoutMs?: number }) => Promise<unknown>;
};

export class ClientAgent extends Agent<AgentBindings> {
  private tablesReady = false;

  private ensureTables(): void {
    if (this.tablesReady) return;
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS wakes (
        id TEXT PRIMARY KEY,
        reason TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        outcome TEXT
      )`,
    );
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS runs (
        task_id TEXT NOT NULL,
        skill_path TEXT NOT NULL,
        step TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        note TEXT
      )`,
    );
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER
      )`,
    );
    this.tablesReady = true;
  }

  /** Leaves a wake open so a second POST with the same reason stays quiet. */
  seedOpenWake(reason: string): void {
    this.ensureTables();
    this.ctx.storage.sql.exec(
      "INSERT INTO wakes (id, reason, started_at, finished_at, outcome) VALUES (?, ?, ?, NULL, NULL)",
      crypto.randomUUID(),
      reason,
      Date.now(),
    );
  }

  /** Replaces any model-supplied organization id with this instance's name. */
  handoffArguments(args: Record<string, unknown>): Record<string, unknown> {
    return { ...args, organizationId: this.name };
  }

  async skillNames(): Promise<string[]> {
    const object = await this.env.SKILLS.get("skills/index.json");
    if (!object) return [];
    return parseSkillIndex(await object.text());
  }

  async skillCatalog(): Promise<SkillCard[]> {
    const object = await this.env.SKILLS.get("skills/index.json");
    if (!object) return [];
    return parseSkillCatalog(await object.text());
  }

  private portal(): PortalTools {
    return (this as unknown as { mcp: PortalTools }).mcp;
  }

  private async connectPortal(): Promise<void> {
    const target = mcpConnectTarget(this.env);
    if (!target) return;
    const known = this.getMcpServers() as { servers?: Record<string, { name?: string }> };
    const serverId = Object.entries(known.servers ?? {}).find(([, server]) => server.name === "portal")?.[0];
    if (serverId) {
      await this.portal().discoverIfConnected?.(serverId, { timeoutMs: 3000 });
      return;
    }
    await this.addMcpServer("portal", target.url, {
      transport: { headers: target.headers },
    });
    await this.portal().waitForConnections?.({ timeout: 3000 });
  }

  /** Connects once, then returns whatever tools the portal listed. */
  async connectAndListTools(): Promise<string[]> {
    await this.connectPortal();
    return toolNamesFrom(this.getMcpServers().tools, this.portal().getAITools?.());
  }

  async acceptWake(reason: string): Promise<"started" | "busy"> {
    this.ensureTables();
    const open = [...this.ctx.storage.sql.exec("SELECT id FROM wakes WHERE reason = ? AND finished_at IS NULL", reason)];
    if (open.length > 0) return "busy";
    const id = crypto.randomUUID();
    this.ctx.storage.sql.exec(
      "INSERT INTO wakes (id, reason, started_at, finished_at, outcome) VALUES (?, ?, ?, NULL, NULL)",
      id,
      reason,
      Date.now(),
    );
    try {
      await this.connectPortal();
      await this.skillNames();
      const outcome = await this.describeClient(id, reason);
      if (outcome !== "paused") await this.continueWork(id, reason);
      this.ctx.storage.sql.exec("UPDATE wakes SET finished_at = ?, outcome = ? WHERE id = ?", Date.now(), outcome, id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "wake failed";
      this.ctx.storage.sql.exec(
        "UPDATE wakes SET finished_at = ?, outcome = ? WHERE id = ?",
        Date.now(),
        message.slice(0, 500),
        id,
      );
    }
    return "started";
  }

  /** Drafts the brief and design system when this wake is for describe or engineer. */
  private async describeClient(wakeId: string, reason: string): Promise<string> {
    if (reason !== "onboard" && reason !== "context_changed" && reason !== "brief_approved") return "ok";
    const call = callerForClientWork(this.toolCaller(this.portal().getAITools?.() ?? {}), this.leadCaller());
    if (!call) return "ok";
    const drafted = await draftClientDocuments({
      call,
      reason,
      requestId: wakeId,
      now: Date.now(),
      catalog: await this.skillCatalog(),
      fetchPage: (url) => this.fetchPage(url),
      cache: {
        get: (key) => this.cacheGet(key),
        set: (key, value, expiresAt) => this.cacheSet(key, value, expiresAt),
      },
    });
    return drafted.outcome === "paused" ? "paused" : "ok";
  }

  /** A scheduled follow-up. The delay keeps one step from running the rest of the task. */
  async work(): Promise<void> {
    await this.acceptWake("work");
  }

  /** A workflow whose time has arrived. Another due workflow in the same client waits one minute. */
  async due(): Promise<void> {
    await this.acceptWake("due");
  }

  /** Portal tools when the portal is linked. Otherwise the Handoff MCP route, so the run is recorded. */
  private leadCaller(): ToolCaller | null {
    const portal = this.toolCaller(this.portal().getAITools?.() ?? {});
    if (portal) return portal;
    const http = mcpHttpCaller(this.env);
    if (!http) return null;
    return async (name, args) => http(name, this.handoffArguments(args));
  }

  private async leadPacks(origin: string | undefined) {
    if (origin) {
      try {
        const response = await fetch(`${origin}/api/templates`);
        if (response.ok) {
          const packs = packsFromTemplates(await response.json());
          if (packs.length > 0) return packs;
        }
      } catch {
        // The skill catalog is the fallback when the swarm list is unreachable.
      }
    }
    return packTemplatesFromCatalog(await this.skillCatalog());
  }

  private async pickupLead(wakeId: string, reason: string): Promise<void> {
    const origin = this.env.SWARM_ORIGIN?.replace(/\/$/, "");
    const call = this.leadCaller();
    if (!call) return;
    const packs = await this.leadPacks(origin);
    await qualifyLead({
      call,
      requestId: wakeId,
      packs,
      trigger: reason,
      runSwarm: origin
        ? (brief, templateId) => runLeadSwarm({ origin, workflowId: `lead-${wakeId}`, brief, templateId })
        : undefined,
      onStillRunning: async (run) => {
        await this.schedule(45, "refreshSwarm", { ...run, attempts: 1 });
      },
    });
  }

  /** One later read of a swarm that was still going. A new request id updates the same activity row. */
  async refreshSwarm(payload: {
    executionId: string;
    templateId: string;
    activityKey: string;
    packName: string;
    trigger: string;
    attempts: number;
    taskId?: string;
    projectId?: string | null;
    workflowId?: string;
  }): Promise<void> {
    const origin = this.env.SWARM_ORIGIN?.replace(/\/$/, "");
    const call = this.leadCaller();
    if (!origin || !call || !payload?.executionId || !payload.activityKey) return;
    const run = await readSwarmRun({
      origin,
      executionId: payload.executionId,
      templateId: payload.templateId,
    });
    const status = run.status === "completed" || run.status === "failed" ? run.status : "running";
    const adapted = adaptArtifact(run.output);
    const activityBody =
      adapted?.kind === "pdf" || adapted?.kind === "image" ? `Saved a ${adapted.extension}.` : run.output.slice(0, 500);
    await call("record_swarm_run", {
      packName: payload.packName,
      status,
      executionId: payload.executionId,
      body: activityBody,
      requestId: `${payload.activityKey}:refresh:${payload.attempts}`,
      activityKey: payload.activityKey,
      trigger: payload.trigger,
    });
    if (status !== "running" && run.output.trim() && !run.output.includes("still going")) {
      await call("save_space_file", {
        workflow: "swarm",
        run: payload.executionId,
        node: "result",
        body: run.output,
        projectId: payload.projectId ?? "",
        requestId: `${payload.activityKey}:file`,
      });
    }
    if (status === "completed" && run.output.trim() && !run.output.includes("still going")) {
      try {
        await fileSwarmDelivery(call, {
          requestId: payload.activityKey,
          title: payload.packName,
          body: run.output,
          projectId: payload.projectId,
        });
      } catch (error) {
        await call("add_note", {
          body: error instanceof Error ? error.message : "The draft was not filed.",
          requestId: `${payload.activityKey}:deliverable-miss`,
        });
      }
      if (payload.taskId) {
        await call("update_task", {
          taskId: payload.taskId,
          status: "done",
          note: "Swarm finished.",
          requestId: `${payload.activityKey}:done`,
        });
      }
      if (payload.workflowId) {
        const advanced = await call("advance_workflow_chain", {
          workflowId: payload.workflowId,
          executionId: payload.executionId,
          status,
          body: run.output,
          requestId: `${payload.activityKey}:chain:${payload.attempts}`,
        });
        const next = advanced && typeof advanced === "object" ? (advanced as Record<string, unknown>) : {};
        const nextId = typeof next.executionId === "string" ? next.executionId : "";
        const nextWorkflowId = typeof next.workflowId === "string" ? next.workflowId : "";
        if (next.status === "running" && nextId && nextWorkflowId) {
          await this.schedule(45, "refreshSwarm", {
            executionId: nextId,
            templateId: typeof next.templateId === "string" ? next.templateId : "",
            activityKey: `due:${nextWorkflowId}`,
            packName: typeof next.packName === "string" ? next.packName : "Swarm",
            trigger: "due",
            attempts: 1,
            taskId: typeof next.taskId === "string" ? next.taskId : "",
            projectId: typeof next.projectId === "string" ? next.projectId : null,
            workflowId: nextWorkflowId,
          });
        }
      }
    }
    if (status === "failed" && payload.taskId) {
      await call("add_note", {
        taskId: payload.taskId,
        body: activityBody || "The swarm failed.",
        requestId: `${payload.activityKey}:failed`,
      });
    }
    const follow = followRunningSwarm(status, payload.attempts);
    if (follow === "refresh") {
      await this.schedule(45, "refreshSwarm", { ...payload, attempts: payload.attempts + 1 });
    } else if (follow === "handoff") {
      await this.schedule(60, "due");
    }
  }

  private async continueWork(wakeId: string, reason: string): Promise<void> {
    if (reason === "due") {
      const call = this.leadCaller();
      if (!call) return;
      const result = await call("run_due_workflow", { requestId: wakeId });
      const run = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
      const executionId = typeof run.executionId === "string" ? run.executionId : "";
      const workflowId = typeof run.workflowId === "string" ? run.workflowId : "";
      const templateId = typeof run.templateId === "string" ? run.templateId : "";
      const packName = typeof run.packName === "string" ? run.packName : "Swarm";
      const taskId = typeof run.taskId === "string" ? run.taskId : "";
      const projectId = typeof run.projectId === "string" ? run.projectId : null;
      if (run.status === "running" && executionId && workflowId) {
        await this.schedule(45, "refreshSwarm", {
          executionId,
          templateId,
          activityKey: `due:${workflowId}`,
          packName,
          trigger: "due",
          attempts: 1,
          taskId,
          projectId,
          workflowId,
        });
      } else if (run.none === true) {
        const open = await call("running_swarms", { requestId: wakeId });
        const runs =
          open && typeof open === "object" && Array.isArray((open as { runs?: unknown }).runs)
            ? ((open as { runs: Record<string, unknown>[] }).runs)
            : [];
        for (const row of runs) {
          const openId = typeof row.executionId === "string" ? row.executionId : "";
          if (row.status !== "running" || !openId) continue;
          const openWorkflowId = typeof row.workflowId === "string" ? row.workflowId : "";
          await this.schedule(45, "refreshSwarm", {
            executionId: openId,
            templateId: typeof row.templateId === "string" ? row.templateId : "",
            activityKey: openWorkflowId ? `due:${openWorkflowId}` : `chat:${openId}`,
            packName: typeof row.packName === "string" ? row.packName : "Swarm",
            trigger: "chat",
            attempts: 1,
            taskId: typeof row.taskId === "string" ? row.taskId : "",
            projectId: typeof row.projectId === "string" ? row.projectId : null,
            workflowId: openWorkflowId,
          });
        }
      }
      if (run.more === true) await this.schedule(60, "due");
      return;
    }
    if (
      reason !== "brief_approved" &&
      reason !== "work" &&
      reason !== "brief_changed" &&
      reason !== "lead_created" &&
      reason !== "scan_ready" &&
      reason !== "changes_requested"
    ) {
      return;
    }
    const call = callerForClientWork(this.toolCaller(this.portal().getAITools?.() ?? {}), this.leadCaller());
    if (reason === "lead_created" || reason === "scan_ready") {
      await this.pickupLead(wakeId, reason);
      return;
    }
    if (!call) return;
    if (reason === "brief_changed") {
      await applyBriefChange({ call, requestId: wakeId, now: Date.now(), catalog: await this.skillCatalog() });
      return;
    }
    if (reason === "brief_approved") {
      await planClientWork({
        call,
        requestId: wakeId,
        now: Date.now(),
        catalog: await this.skillCatalog(),
      });
      return;
    }
    const result = await advanceClientWork({
      call,
      requestId: wakeId,
      now: Date.now(),
      readSkill: (skillPath) => this.readSkill(skillPath),
      onLoaded: (skillPath, taskId) => this.recordSkill(taskId, skillPath),
    });
    if (result.reschedule) await this.schedule(60, "work", undefined, { idempotent: true });
  }

  private async readSkill(skillPath: string): Promise<string | null> {
    const key = skillObjectKey(skillPath);
    if (!key) return null;
    try {
      const object = await this.env.SKILLS.get(key);
      return object ? object.text() : null;
    } catch {
      return null;
    }
  }

  private recordSkill(taskId: string, skillPath: string): void {
    this.ensureTables();
    const now = Date.now();
    this.ctx.storage.sql.exec(
      "INSERT INTO runs (task_id, skill_path, step, started_at, finished_at, note) VALUES (?, ?, 'loaded', ?, ?, NULL)",
      taskId,
      skillPath,
      now,
      now,
    );
  }

  private toolCaller(tools: Record<string, unknown>): ToolCaller | null {
    if (!findExecute(tools, "client_context")) return null;
    return async (name, args) => {
      const execute = findExecute(tools, name);
      if (!execute) throw new Error(`Missing tool ${name}`);
      return unwrapToolResult(await execute(this.handoffArguments(args)));
    };
  }

  private async cacheGet(key: string): Promise<string | null> {
    this.ensureTables();
    const rows = [
      ...this.ctx.storage.sql.exec<{ value: string; expires_at: number | null }>(
        "SELECT value, expires_at FROM cache WHERE key = ?",
        key,
      ),
    ];
    const row = rows[0];
    if (!row || (row.expires_at != null && row.expires_at <= Date.now())) return null;
    return row.value;
  }

  private async cacheSet(key: string, value: string, expiresAt: number): Promise<void> {
    this.ensureTables();
    this.ctx.storage.sql.exec(
      `INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
      key,
      value,
      expiresAt,
    );
  }

  private async fetchPage(url: string): Promise<{ ok: boolean; text: string }> {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) return { ok: false, text: "" };
      return { ok: true, text: await response.text() };
    } catch {
      return { ok: false, text: "" };
    }
  }
}

function findExecute(
  tools: Record<string, unknown>,
  name: string,
): ((args: Record<string, unknown>) => Promise<unknown>) | null {
  for (const [key, value] of Object.entries(tools)) {
    if (key !== name && !key.endsWith(`_${name}`)) continue;
    if (!value || typeof value !== "object" || !("execute" in value)) continue;
    const execute = (value as { execute?: unknown }).execute;
    if (typeof execute !== "function") continue;
    return (args) => execute.call(value, args) as Promise<unknown>;
  }
  return null;
}

type InboundEmail = {
  from: string;
  to: string;
  raw: ReadableStream;
  rawSize?: number;
  reply: (message: unknown) => Promise<unknown>;
};

async function hqChannel(env: AgentBindings, body: Record<string, unknown>): Promise<unknown> {
  const origin = env.HQ_ORIGIN?.replace(/\/$/, "");
  const secret = env.CLIENT_CHANNEL_SECRET;
  if (!origin || !secret) return null;
  const response = await fetch(`${origin}/api/client-messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  return response.json();
}

/** HQ reads chat over HTTPS from another host, so the agent names that host. */
function chatCors(origin: string | undefined): true | Record<string, string> {
  const allow = origin?.replace(/\/$/, "");
  if (!allow) return true;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}

const MAILBOX_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

async function mailboxTurn(env: AgentBindings, desk: ClientDesk, incoming: string, prospect = false) {
  if (!env.AI) throw new Error("Chat is not configured.");
  const run = env.AI.run.bind(env.AI) as (
    model: string,
    input: { messages: { role: string; content: string }[] },
  ) => Promise<{ response?: string } | string>;
  const booking = env.BOOKING_URL?.trim() || "none. Ask which two times work for a call.";
  const result = await run(MAILBOX_MODEL, {
    messages: [
      {
        role: "system",
        content: prospect ? `${PROSPECT_INSTRUCTIONS} Booking link: ${booking}` : MAILBOX_INSTRUCTIONS,
      },
      {
        role: "user",
        content: mailboxUserContent({ prospect, desk, incoming }),
      },
    ],
  });
  return clientTurnFromModel(result);
}

const worker = {
  async fetch(request: Request, env: AgentBindings, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/channels/slack" && request.method === "POST") {
      return handleSlackEvent(request, env, Date.now(), fetch, (work) => ctx?.waitUntil(work), async ({ organizationId, text, threadId }) => {
        const body = (await hqChannel(env, { action: "desk_context", organizationId, threadId })) as {
          value?: ClientDesk;
        } | null;
        if (!body?.value) throw new Error("desk unavailable");
        return replyToClient({
          desk: body.value,
          incoming: text,
          model: (nextDesk, incoming) => mailboxTurn(env, nextDesk, incoming),
        });
      });
    }
    if (url.pathname === "/wake" && request.method === "POST") {
      const raw = await request.text();
      const signature = request.headers.get("x-handoff-signature") ?? "";
      if (!env.AGENT_WAKE_SECRET || !verifyWake(env.AGENT_WAKE_SECRET, raw, signature, Date.now())) {
        return new Response("Unauthorized", { status: 401 });
      }
      let body: { organizationId?: unknown; reason?: unknown };
      try {
        body = JSON.parse(raw) as { organizationId?: unknown; reason?: unknown };
      } catch {
        return new Response("Unauthorized", { status: 401 });
      }
      if (typeof body.organizationId !== "string" || typeof body.reason !== "string") {
        return new Response("Unauthorized", { status: 401 });
      }
      const stub = await getAgentByName(env.ClientAgent, body.organizationId);
      const outcome = await stub.acceptWake(body.reason);
      return Response.json({ outcome }, { status: outcome === "busy" ? 202 : 200 });
    }
    const routed = await routeAgentRequest(request, env, { cors: chatCors(env.HQ_ORIGIN) });
    if (routed) return routed;
    return new Response("Not found", { status: 404 });
  },

  async email(message: InboundEmail, env: AgentBindings): Promise<void> {
    const raw = await new Response(message.raw).text();
    const parsed = await parseInboundEmail(raw);
    if (typeof message.rawSize === "number") parsed.bytes = message.rawSize;
    const own = env.MAGIC_EMAIL_FROM || "magic@abra-ca-dabra.app";
    const reply = await handleInboundEmail(parsed, {
      lookup: async (email) => {
        const body = (await hqChannel(env, {
          action: "lookup",
          email,
          authenticationResults: parsed.authenticationResults,
        })) as { value?: { organizationId: string | null; organizations?: { id: string; name: string }[]; authenticated: boolean } } | null;
        if (!body?.value) return "down";
        return body.value;
      },
      thread: async (organizationIdForThread, threadId) => {
        const body = (await hqChannel(env, {
          action: "thread",
          organizationId: organizationIdForThread,
          threadId,
          references: parsed.references,
          sender: addressOf(parsed.from),
          subject: parsed.subject,
        })) as {
          value?: ThreadState;
        } | null;
        return body?.value ?? { replies: 0, questionCount: 0, text: "" };
      },
      remembered: async (threadId) => {
        const body = (await hqChannel(env, {
          action: "thread_org",
          threadId,
          email: addressOf(parsed.from),
          references: parsed.references,
          subject: parsed.subject,
        })) as {
          value?: string | null;
        } | null;
        return body?.value ?? null;
      },
      ownAddress: own,
      bookingUrl: env.BOOKING_URL ?? "",
      openProspect: async (input) => {
        const body = (await hqChannel(env, {
          action: "open_prospect",
          email: input.email,
          name: input.name ?? "",
          text: input.text,
          subject: input.subject,
          threadId: input.threadId,
          references: input.references,
        })) as {
          value?: {
            id?: unknown;
            name?: unknown;
            kind?: unknown;
            pending?: unknown;
            declined?: unknown;
            organizations?: unknown;
          };
        } | null;
        const value = body?.value;
        if (!value || typeof value.name !== "string") return "down";
        const pending = value.pending === true;
        const declined = value.declined === true;
        const id = typeof value.id === "string" ? value.id : "";
        if (!pending && !declined && !id) return "down";
        const organizations = Array.isArray(value.organizations)
          ? value.organizations.flatMap((item) => {
              if (!item || typeof item !== "object") return [];
              const row = item as { id?: unknown; name?: unknown };
              if (typeof row.id !== "string" || typeof row.name !== "string") return [];
              return [{ id: row.id, name: row.name }];
            })
          : undefined;
        return {
          id: id || null,
          name: value.name,
          kind: typeof value.kind === "string" ? value.kind : undefined,
          pending,
          declined,
          organizations,
        };
      },
      answer: async (organizationId, organizations, prospect) => {
        const body = (await hqChannel(env, {
          action: "desk_context",
          organizationId,
          threadId: parsed.threadId,
          references: parsed.references,
          sender: addressOf(parsed.from),
          subject: parsed.subject,
        })) as { value?: ClientDesk } | null;
        if (!body?.value) throw new Error("desk unavailable");
        const desk: ClientDesk = {
          ...body.value,
          forbiddenNames: organizations.filter((org) => org.id !== organizationId).map((org) => org.name),
        };
        return replyToClient({
          desk,
          incoming: [parsed.subject, parsed.text].filter(Boolean).join("\n"),
          model: (nextDesk, incoming) => mailboxTurn(env, nextDesk, incoming, prospect),
        });
      },
    });
    if (reply.skip) return;
    let replyText = reply.send === false ? "" : reply.reply;
    const domain = own.split("@")[1] ?? "abra-ca-dabra.app";
    const replyMessageId = replyText ? `<${crypto.randomUUID()}@${domain}>` : "";
    if (reply.send !== false && reply.organizationId && parsed.attachments.length > 0) {
      const saved = (await hqChannel(env, {
        action: "attach",
        organizationId: reply.organizationId,
        files: parsed.attachments.map((file) => ({
          filename: file.filename,
          contentType: file.mimeType,
          body: bytesToBase64(file.bytes),
        })),
      })) as { value?: { stored?: string[] } } | null;
      if ((saved?.value?.stored?.length ?? 0) > 0 && replyText) {
        replyText = `${replyText} I put the file in your space. It stays unread until the check finishes.`;
      }
    }
    await hqChannel(env, {
      action: "record",
      organizationId: reply.organizationId ?? "",
      noteOnly: reply.noteOnly,
      channel: "email",
      threadId: parsed.threadId,
      references: parsed.references,
      subject: parsed.subject,
      sender: addressOf(parsed.from),
      replyMessageId,
      body: parsed.text,
      state: reply.classified.state,
      goal: reply.classified.goal,
      dueText: reply.classified.due,
      asked: reply.asked,
      replyBody: replyText,
      actions: reply.plan.actions,
      brief: reply.plan.brief,
      rules: reply.plan.rules,
      prospect: reply.prospect,
      bookingOffered: reply.bookingOffered,
      optOut: reply.optOut,
      stalled: reply.stalled,
    });
    if (reply.send === false || !replyText) return;
    const { EmailMessage } = await import("cloudflare:email");
    const mime = replyMime({
      from: own,
      to: message.from,
      subject: parsed.subject,
      text: replyText,
      messageId: parsed.messageId,
      references: parsed.references,
      domain,
      now: Date.now(),
      replyMessageId,
    });
    try {
      await message.reply(new EmailMessage(own, message.from, mime));
    } catch {
      // Cloudflare refuses a reply when the incoming mail failed DMARC. The note is already on the timeline.
    }
  },
};

export { HqChat } from "./hq-chat";
export default worker;
