import { describe, expect, it } from "vitest";
import { dispatchJob, InvalidJobError } from "@/lib/jobs/dispatch";

describe("dispatchJob", () => {
  it("rejects a body that is not a scan or a prospect", async () => {
    await expect(dispatchJob({ type: "other" }, {}, { runScan: async () => {}, runProspect: async () => {} })).rejects.toBeInstanceOf(
      InvalidJobError,
    );
  });

  it("runs a scan job and a prospect job on the matching handler", async () => {
    const scans: string[] = [];
    const notes: string[] = [];
    const handlers = {
      runScan: async (scanId: string) => {
        scans.push(scanId);
      },
      runProspect: async (job: { objective: string }) => {
        notes.push(job.objective);
      },
    };
    await dispatchJob({ type: "scan", scanId: "scan-1" }, {}, handlers);
    await dispatchJob({ type: "prospect", objective: "Check https://acme.example today." }, {}, handlers);
    expect(scans).toEqual(["scan-1"]);
    expect(notes).toEqual(["Check https://acme.example today."]);
  });
});
