import type { Sql } from "@/db/sql";
import { packsFromTemplates, type PackCandidate } from "@/lib/pack-picker";

/** Packs the board can attach, and task ids whose swarm is still running. */
export async function boardSwarmExtras(sql: Sql): Promise<{ runningTaskIds: string[]; packs: PackCandidate[] }> {
  const running = await sql.all<{ id: string }>(
    `SELECT w.task_id AS id FROM swarm_runs s
     JOIN client_workflows w ON w.id = s.workflow_id
     WHERE s.status = 'running' AND w.task_id IS NOT NULL`,
  );
  return { runningTaskIds: running.map((row) => row.id), packs: await livePacks() };
}

async function livePacks(): Promise<PackCandidate[]> {
  const origin = process.env.SWARM_ORIGIN?.trim() ?? "";
  if (!origin.startsWith("https://")) return [];
  try {
    const response = await fetch(`${origin.replace(/\/$/, "")}/api/templates`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return [];
    return packsFromTemplates(await response.json());
  } catch {
    return [];
  }
}
