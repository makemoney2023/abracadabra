import type { CheckBindings } from "@/lib/cloudflare/sql";

export type JobBody = { type: "scan"; scanId: string } | { type: "prospect"; objective: string };

export class InvalidJobError extends Error {
  constructor() {
    super("Invalid job");
    this.name = "InvalidJobError";
  }
}

export function isJobBody(body: unknown): body is JobBody {
  if (!body || typeof body !== "object") return false;
  const row = body as { type?: unknown; scanId?: unknown; objective?: unknown };
  if (row.type === "scan") return typeof row.scanId === "string" && row.scanId.length > 0;
  if (row.type === "prospect") return typeof row.objective === "string" && row.objective.length >= 8;
  return false;
}

export type JobHandlers = {
  runScan: (scanId: string, env: CheckBindings) => Promise<void>;
  runProspect: (objective: string, env: CheckBindings) => Promise<void>;
};

export async function dispatchJob(body: unknown, env: CheckBindings, handlers: JobHandlers): Promise<void> {
  if (!isJobBody(body)) throw new InvalidJobError();
  if (body.type === "scan") {
    await handlers.runScan(body.scanId, env);
    return;
  }
  await handlers.runProspect(body.objective, env);
}
