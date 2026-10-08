import type { Sql } from "../db/sql";

export type AgentRunRow = {
  id: string;
  kind: string;
  body: string | null;
  status: string;
  createdAt: number;
  organizationId: string | null;
  organizationName: string;
};

/** One timestamped row for a schema scan or a swarm run. */
export async function recordAgentRun(
  sql: Sql,
  input: {
    organizationId: string;
    kind: "schema.scan" | "agent.swarm_run";
    body: string;
    status: string;
    data: Record<string, unknown>;
    now: number;
    actorKind?: "agent" | "system";
    actorId?: string;
  },
): Promise<void> {
  const data: Record<string, unknown> = { ...input.data, status: input.status };
  const requestId = data.requestId;
  const key = typeof requestId === "string" ? requestId.trim() : "";
  if (key) {
    const existing = await sql.get<{ id: string }>(
      `SELECT id FROM activities
       WHERE organization_id = ? AND kind = ? AND json_extract(data_json, '$.requestId') = ?
       ORDER BY created_at DESC LIMIT 1`,
      [input.organizationId, input.kind, key],
    );
    if (existing) {
      await sql.run(`UPDATE activities SET body = ?, data_json = ?, created_at = ? WHERE id = ?`, [
        input.body.slice(0, 500),
        JSON.stringify(data),
        input.now,
        existing.id,
      ]);
      return;
    }
  }
  await sql.run(
    `INSERT INTO activities (
      id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.organizationId,
      input.kind,
      input.actorKind ?? "agent",
      input.actorId ?? "swarm",
      input.body.slice(0, 500),
      JSON.stringify(data),
      input.now,
    ],
  );
}

const CHECK_ORIGIN = "https://check.abra-ca-dabra.app";

export function activityLinks(raw: string | null): { reportUrl: string | null; artifacts: string[] } {
  if (!raw) return { reportUrl: null, artifacts: [] };
  try {
    const parsed = JSON.parse(raw) as { publicToken?: unknown; artifacts?: unknown };
    const token = typeof parsed.publicToken === "string" ? parsed.publicToken.trim() : "";
    const artifacts = Array.isArray(parsed.artifacts)
      ? parsed.artifacts.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    return { reportUrl: token ? `${CHECK_ORIGIN}/scan/${token}` : null, artifacts };
  } catch {
    return { reportUrl: null, artifacts: [] };
  }
}

export function runStatus(raw: string | null): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { status?: unknown };
    return typeof parsed.status === "string" ? parsed.status : "";
  } catch {
    return "";
  }
}
