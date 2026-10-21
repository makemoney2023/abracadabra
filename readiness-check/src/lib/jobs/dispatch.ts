import type { CheckBindings } from "@/lib/cloudflare/sql";

/**
 * `scan` plans a scan (and, for a one-chunk free scan, runs it to the end). `scan-chunk`, `scan-finalize` and
 * `scan-watchdog` are the chunked steps that follow; see `@/lib/scan/pipeline`.
 */
export type ScanStepJob =
  | { type: "scan-chunk"; scanId: string; chunk: number }
  | { type: "scan-finalize"; scanId: string }
  | { type: "scan-watchdog"; scanId: string };

export type JobBody =
  | { type: "scan"; scanId: string }
  | ScanStepJob
  | { type: "prospect"; objective: string; checkId?: string };

export class InvalidJobError extends Error {
  constructor() {
    super("Invalid job");
    this.name = "InvalidJobError";
  }
}

export function isJobBody(body: unknown): body is JobBody {
  if (!body || typeof body !== "object") return false;
  const row = body as { type?: unknown; scanId?: unknown; objective?: unknown };
  const hasScanId = typeof row.scanId === "string" && row.scanId.length > 0;
  if (row.type === "scan" || row.type === "scan-finalize" || row.type === "scan-watchdog") return hasScanId;
  if (row.type === "scan-chunk") {
    const chunk = (row as { chunk?: unknown }).chunk;
    return hasScanId && typeof chunk === "number" && Number.isInteger(chunk) && chunk >= 0;
  }
  if (row.type === "prospect") {
    if (typeof row.objective !== "string" || row.objective.length < 8) return false;
    const checkId = (row as { checkId?: unknown }).checkId;
    return checkId === undefined || (typeof checkId === "string" && checkId.length > 0);
  }
  return false;
}

export type JobHandlers = {
  runScan: (scanId: string, env: CheckBindings) => Promise<void>;
  /** Chunked steps. Without a handler (Inngest/legacy), these jobs are rejected as invalid. */
  runScanStep?: (job: ScanStepJob, env: CheckBindings) => Promise<void>;
  runProspect: (job: { objective: string; checkId?: string }, env: CheckBindings) => Promise<void>;
};

export async function dispatchJob(body: unknown, env: CheckBindings, handlers: JobHandlers): Promise<void> {
  if (!isJobBody(body)) throw new InvalidJobError();
  if (body.type === "scan") {
    await handlers.runScan(body.scanId, env);
    return;
  }
  if (body.type === "scan-chunk" || body.type === "scan-finalize" || body.type === "scan-watchdog") {
    if (!handlers.runScanStep) throw new InvalidJobError();
    await handlers.runScanStep(body, env);
    return;
  }
  await handlers.runProspect({ objective: body.objective, checkId: body.checkId }, env);
}
