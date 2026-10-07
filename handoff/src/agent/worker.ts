import { Agent, getAgentByName, routeAgentRequest } from "agents";
import { verifyWake } from "../lib/agent-wake";
import {
  draftClientDocuments,
  parseSkillCatalog,
  unwrapToolResult,
  type SkillCard,
  type ToolCaller,
} from "../lib/client-documents";

export interface AgentBindings {
  ClientAgent: DurableObjectNamespace<ClientAgent>;
  SKILLS: R2Bucket;
  AI: Ai;
  MCP_PORTAL_URL: string;
  AGENT_WAKE_SECRET: string;
  CF_ACCESS_CLIENT_ID: string;
  CF_ACCESS_CLIENT_SECRET: string;
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

const worker = {
  async fetch(request: Request, env: AgentBindings): Promise<Response> {
    const url = new URL(request.url);
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
    const routed = await routeAgentRequest(request, env);
    if (routed) return routed;
    return new Response("Not found", { status: 404 });
  },
};

export default worker;
