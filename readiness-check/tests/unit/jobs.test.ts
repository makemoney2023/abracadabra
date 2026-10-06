import { afterEach, describe, expect, it } from "vitest";
import { CLOUDFLARE_CONTEXT, bindWorkerEnv, type QueueBinding } from "@/lib/cloudflare";
import { enqueueProspect, enqueueScan, handleScanJob, publishLeadIntake } from "@/lib/jobs";

const COPIED = ["PARALLEL_API_KEY", "TURNSTILE_SECRET_KEY"] as const;

function clearContext(): void {
  delete (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT];
  for (const key of COPIED) delete process.env[key];
}

describe("scan jobs", () => {
  afterEach(() => {
    clearContext();
  });

  it("sends a scan message when the queue binding exists", async () => {
    const sent: unknown[] = [];
    const queue: QueueBinding = {
      async send(body) {
        sent.push(body);
      },
    };
    bindWorkerEnv({ SCAN_JOBS: queue });
    await enqueueScan("scan-1");
    expect(sent).toEqual([{ kind: "scan", scanId: "scan-1" }]);
  });

  it("does nothing when the scan queue is missing", async () => {
    bindWorkerEnv({});
    await expect(enqueueScan("scan-1")).resolves.toBeUndefined();
    await expect(enqueueProspect("find shops")).resolves.toBeUndefined();
  });

  it("skips lead intake when that queue is missing", async () => {
    bindWorkerEnv({});
    await expect(
      publishLeadIntake({ source: "assessment", payload: { assessment_id: "a1" } }),
    ).resolves.toEqual({ ok: true, skipped: true });
  });

  it("publishes the intake message onto the lead queue", async () => {
    const sent: unknown[] = [];
    bindWorkerEnv({
      LEAD_INTAKE: {
        async send(body) {
          sent.push(body);
        },
      },
    });
    const message = { source: "booking" as const, payload: { external_id: "cal-1" } };
    await expect(publishLeadIntake(message)).resolves.toEqual({ ok: true });
    expect(sent).toEqual([message]);
  });

  it("rejects a body that is not a job", async () => {
    await expect(handleScanJob(null)).rejects.toThrow("Bad scan job");
    await expect(handleScanJob({ kind: "other" })).rejects.toThrow("Unknown scan job");
    await expect(handleScanJob({ kind: "scan" })).rejects.toThrow("Missing scan id");
    await expect(handleScanJob({ kind: "prospect" })).rejects.toThrow("Missing objective");
  });

  it("refuses a scan job when Parallel is not configured", async () => {
    delete process.env.PARALLEL_API_KEY;
    await expect(handleScanJob({ kind: "scan", scanId: "scan-1" })).rejects.toThrow(
      "Missing PARALLEL_API_KEY environment variable",
    );
  });
});
