import type { Sql } from "@/db/sql";
import { createAgentTask, type BoardTask } from "@/lib/agent-board";
import { resolveClientRef, type AgentPrincipal } from "@/lib/agent-work-filing";
import { findOpportunity, SEARCH_CARD_CREATED } from "./agent-search";
import type { Opportunity } from "./opportunities";
import type { SearchRangeId } from "./report";

/**
 * Agents turn a Search Console opportunity into a card (PR 4). The card itself goes through the existing agent card
 * path (createAgentTask: same assignment checks, same HQ board, same client_agent.board activity). This adds:
 * - the opportunity must be in the client's current data (no made-up findings);
 * - at most SEARCH_CARDS_PER_DAY search cards per client per UTC day;
 * - one open card per opportunity (a done card frees it).
 * Each card is logged as search.card_created (staff/agent-only) with the opportunity, which is what the limits count.
 * Nothing is published or sent to the client.
 */

export const SEARCH_CARDS_PER_DAY = 5;

export type AgentOrgResult = { ok: true; organizationId: string } | { ok: false; status: 400 | 403; message: string };

/** The client an agent asked about, only when it is assigned to it now. No client named: its only client, else 400. */
export async function agentSearchOrg(sql: Sql, agent: AgentPrincipal, client: unknown): Promise<AgentOrgResult> {
  if (client) {
    const resolved = await resolveClientRef(sql, client);
    if (!resolved.ok || !agent.assignments.some((row) => row.organizationId === resolved.organizationId)) {
      return { ok: false, status: 403, message: "This agent is not assigned to that client." };
    }
    return { ok: true, organizationId: resolved.organizationId };
  }
  const orgs = [...new Set(agent.assignments.map((row) => row.organizationId))];
  if (orgs.length === 1) return { ok: true, organizationId: orgs[0] };
  return { ok: false, status: 400, message: orgs.length ? "Name the client (org id, domain, or space slug)." : "This agent has no clients." };
}

function pagePath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

/** A short card title for the HQ board. Staff wording; the client never sees it from here. */
export function searchCardTitle(opportunity: Opportunity): string {
  const q = (opportunity.query ?? "").slice(0, 80);
  switch (opportunity.type) {
    case "low_ctr":
      return `Search: lift CTR for "${q}"`;
    case "striking_distance":
      return `Search: move "${q}" into the top 3`;
    case "query_drop":
      return `Search: clicks fell for "${q}"`;
    case "page_drop":
      return `Search: ${pagePath(opportunity.page ?? "").slice(0, 100)} is losing clicks`;
    case "site_drop":
      return "Search: site clicks fell vs the previous period";
  }
}

function evidence(opportunity: Opportunity, siteUrl: string, range: SearchRangeId | "custom", dataThrough: string | null): string {
  const rows = [
    `Search Console (${siteUrl}, ${range}${dataThrough ? `, data through ${dataThrough}` : ""}):`,
    opportunity.why,
    `Clicks ${opportunity.clicks}${opportunity.previous_clicks !== null ? ` (was ${opportunity.previous_clicks})` : ""}, impressions ${opportunity.impressions}, CTR ${opportunity.ctr === null ? "n/a" : `${(opportunity.ctr * 100).toFixed(1)}%`}, position ${opportunity.position === null ? "n/a" : opportunity.position.toFixed(1)}, about ${opportunity.clicks_at_stake} clicks at stake.`,
    `Opportunity ${opportunity.id}. Staff only: do not quote these numbers to the client as-is.`,
  ];
  return rows.join("\n");
}

export type SearchCardResult =
  | { ok: true; task: BoardTask; opportunity: Opportunity; cards_left_today: number }
  | { ok: false; status: 400 | 403 | 404 | 409 | 429 | 503; message: string; task_id?: string };

export async function createSearchCard(
  sql: Sql,
  searchSql: Sql | null,
  agent: AgentPrincipal,
  input: {
    client?: unknown;
    opportunityId: string;
    propertyId?: string | null;
    range?: SearchRangeId | null;
    title?: string | null;
    note?: string | null;
    assignee?: string | null;
    projectId?: string | null;
    now: number;
  },
): Promise<SearchCardResult> {
  const opportunityId = input.opportunityId.trim();
  if (!opportunityId) return { ok: false, status: 400, message: "opportunity_id is required." };
  const org = await agentSearchOrg(sql, agent, input.client);
  if (!org.ok) return org;
  const organizationId = org.organizationId;
  const dayStart = Date.parse(`${new Date(input.now).toISOString().slice(0, 10)}T00:00:00Z`);
  const today = await sql.get<{ n: number }>(
    "SELECT count(*) AS n FROM activities WHERE organization_id = ? AND kind = ? AND created_at >= ?",
    [organizationId, SEARCH_CARD_CREATED, dayStart],
  );
  const used = Number(today?.n ?? 0);
  if (used >= SEARCH_CARDS_PER_DAY) {
    return { ok: false, status: 429, message: `This client already has ${SEARCH_CARDS_PER_DAY} search cards today (UTC). Try again tomorrow.` };
  }
  const open = await sql.get<{ task_id: string }>(
    `SELECT t.id AS task_id FROM activities a JOIN tasks t ON t.id = json_extract(a.data_json, '$.task_id')
     WHERE a.organization_id = ? AND a.kind = ? AND json_extract(a.data_json, '$.opportunity_id') = ? AND t.status <> 'done'
     LIMIT 1`,
    [organizationId, SEARCH_CARD_CREATED, opportunityId],
  );
  if (open) return { ok: false, status: 409, message: "There is already an open card for this opportunity.", task_id: open.task_id };
  if (!searchSql) return { ok: false, status: 503, message: "Search data is not available here (SEARCH_DB is not bound)." };
  const found = await findOpportunity(sql, searchSql, {
    organizationId,
    opportunityId,
    propertyId: input.propertyId,
    range: input.range,
    now: input.now,
  });
  if (!found) return { ok: false, status: 404, message: "That opportunity is not in this client's current search data. Read GET /api/agent-search again." };
  const extra = input.note?.trim() ? `\n\n${input.note.trim()}` : "";
  const created = await createAgentTask(sql, agent, {
    client: { organization_id: organizationId },
    projectId: input.projectId ?? null,
    title: input.title?.trim() || searchCardTitle(found.opportunity),
    note: `${evidence(found.opportunity, found.property.site_url, found.range, found.property.data_through)}${extra}`,
    assignee: input.assignee ?? null,
    stage: "todo",
    now: input.now,
  });
  if (!created.ok) return created;
  await sql.run(
    `INSERT INTO activities (id, organization_id, project_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, ?, ?, 'agent', ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      organizationId,
      created.task.project_id,
      SEARCH_CARD_CREATED,
      agent.agentId,
      `${agent.label} made a search card: ${created.task.title}`.slice(0, 500),
      JSON.stringify({
        task_id: created.task.id,
        opportunity_id: found.opportunity.id,
        type: found.opportunity.type,
        property_id: found.property.id,
        range: found.range,
      }),
      input.now,
    ],
  );
  return { ok: true, task: created.task, opportunity: found.opportunity, cards_left_today: SEARCH_CARDS_PER_DAY - used - 1 };
}
