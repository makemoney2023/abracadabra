import { sweepAbandoned } from "@/lib/assessment/sweep";
import { createParallelClient } from "@/lib/parallel/client";
import { createSupabaseProspectStore, runProspecting } from "@/lib/ops/prospect";
import { runScan } from "@/lib/scan/orchestrator";
import { createSupabaseScanRepository } from "@/lib/scan/supabase-repository";
import { createAdminClient } from "@/lib/supabase/admin";
import { workerEnv, type QueueBinding } from "@/lib/cloudflare";

export type LeadIntakeMessage = {
  source: "assessment" | "booking";
  payload: Record<string, unknown>;
};

function scanQueue(): QueueBinding | undefined {
  return workerEnv().SCAN_JOBS;
}

function leadQueue(): QueueBinding | undefined {
  return workerEnv().LEAD_INTAKE;
}

export async function enqueueScan(scanId: string): Promise<void> {
  const queue = scanQueue();
  if (!queue) return;
  await queue.send({ kind: "scan", scanId });
}

export async function enqueueProspect(objective: string): Promise<void> {
  const queue = scanQueue();
  if (!queue) return;
  await queue.send({ kind: "prospect", objective });
}

export async function publishLeadIntake(
  message: LeadIntakeMessage,
): Promise<{ ok: true; skipped?: boolean }> {
  const queue = leadQueue();
  if (!queue) return { ok: true, skipped: true };
  await queue.send(message);
  return { ok: true };
}

export async function handleScanJob(body: unknown): Promise<void> {
  if (!body || typeof body !== "object") {
    throw new Error("Bad scan job");
  }
  const job = body as { kind?: string; scanId?: string; objective?: string };
  if (job.kind === "scan") {
    if (!job.scanId) throw new Error("Missing scan id");
    await runScan(job.scanId, {
      parallel: createParallelClient(),
      repo: createSupabaseScanRepository(),
    });
    return;
  }
  if (job.kind === "prospect") {
    if (!job.objective) throw new Error("Missing objective");
    await runProspecting(
      {
        parallel: createParallelClient(),
        store: createSupabaseProspectStore(createAdminClient()),
        enqueueScan,
      },
      job.objective,
    );
    return;
  }
  throw new Error("Unknown scan job");
}

export async function runAssessmentSweep(): Promise<unknown> {
  return sweepAbandoned(createAdminClient());
}
