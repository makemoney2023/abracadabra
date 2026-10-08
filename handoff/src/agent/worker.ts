import { Agent, getAgentByName, routeAgentRequest } from "agents";
import { verifyWake } from "../lib/agent-wake";
import {
  draftClientDocuments,
  parseSkillCatalog,
  unwrapToolResult,
  type SkillCard,
  type ToolCaller,
} from "../lib/client-documents";
import { advanceClientWork, applyBriefChange, planClientWork } from "../lib/client-plan";
import { addressOf, bytesToBase64, handleInboundEmail, parseInboundEmail, replyMime, type ThreadState } from "../lib/client-channel";
import { handleSlackEvent } from "../lib/slack-channel";
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
    const url = this.env.MCP_PORTAL_URL;
    if (!url) return;
    const known = this.getMcpServers();
    const already = Object.values(known.servers).some((server) => server.name === "portal");
    if (already) return;
    await this.addMcpServer("portal", url, {
      transport: {
        headers: {
          "CF-Access-Client-Id": this.env.CF_ACCESS_CLIENT_ID,
          "CF-Access-Client-Secret": this.env.CF_ACCESS_CLIENT_SECRET,
        },
      },
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
    const call = this.toolCaller(this.portal().getAITools?.() ?? {});
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

  private async continueWork(wakeId: string, reason: string): Promise<void> {
    if (reason !== "brief_approved" && reason !== "work" && reason !== "brief_changed") return;
    const call = this.toolCaller(this.portal().getAITools?.() ?? {});
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

const worker = {
  async fetch(request: Request, env: AgentBindings, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/channels/slack" && request.method === "POST") {
      return handleSlackEvent(request, env, Date.now(), fetch, (work) => ctx?.waitUntil(work));
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
        const body = (await hqChannel(env, { action: "thread", organizationId: organizationIdForThread, threadId })) as {
          value?: ThreadState;
        } | null;
        return body?.value ?? { replies: 0, questionCount: 0, text: "" };
      },
      remembered: async (threadId) => {
        const body = (await hqChannel(env, { action: "thread_org", threadId, email: addressOf(parsed.from) })) as {
          value?: string | null;
        } | null;
        return body?.value ?? null;
      },
      ownAddress: own,
    });
    if (reply.skip) return;
    let replyText = reply.reply;
    if (reply.organizationId && parsed.attachments.length > 0) {
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
      sender: addressOf(parsed.from),
      body: parsed.text,
      state: reply.classified.state,
      goal: reply.classified.goal,
      dueText: reply.classified.due,
      asked: reply.asked,
      replyBody: replyText,
    });
    if (!replyText) return;
    const { EmailMessage } = await import("cloudflare:email");
    const mime = replyMime({
      from: own,
      to: message.from,
      subject: parsed.subject,
      text: replyText,
      messageId: parsed.messageId,
      references: parsed.references,
      domain: own.split("@")[1] ?? "abra-ca-dabra.app",
      now: Date.now(),
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
