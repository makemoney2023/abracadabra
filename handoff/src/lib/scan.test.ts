import { describe, expect, it } from "vitest";
import { decideScan } from "./scan";

const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const mz = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00]);
const dwg = Uint8Array.from([0x41, 0x43, 0x31, 0x30]);

describe("decideScan", () => {
  it("marks a PDF with a matching header and a clean clamd result as clean", () => {
    expect(
      decideScan({
        extension: "pdf",
        header: pdf,
        clamd: { kind: "ok" },
        attempts: 1,
        allowUnscanned: false,
      }),
    ).toEqual({ status: "clean" });
  });

  it("rejects a png whose header is not a PNG", () => {
    const result = decideScan({
      extension: "png",
      header: pdf,
      clamd: { kind: "ok" },
      attempts: 1,
      allowUnscanned: false,
    });
    expect(result.status).toBe("rejected");
  });

  it("rejects text that starts with an MZ executable signature", () => {
    const result = decideScan({
      extension: "txt",
      header: mz,
      clamd: { kind: "ok" },
      attempts: 1,
      allowUnscanned: false,
    });
    expect(result.status).toBe("rejected");
  });

  it("accepts a drawing from its extension when clamd is clean", () => {
    expect(
      decideScan({
        extension: "dwg",
        header: dwg,
        clamd: { kind: "ok" },
        attempts: 1,
        allowUnscanned: false,
      }),
    ).toEqual({ status: "clean" });
  });

  it("rejects a finding and names the signature", () => {
    const result = decideScan({
      extension: "png",
      header: png,
      clamd: { kind: "found", signature: "Win.Test.EICAR" },
      attempts: 1,
      allowUnscanned: false,
    });
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.reason).toContain("Win.Test.EICAR");
  });

  it("holds a file when clamd hits a limit", () => {
    const result = decideScan({
      extension: "pdf",
      header: pdf,
      clamd: { kind: "limit", detail: "MaxScanSize" },
      attempts: 1,
      allowUnscanned: false,
    });
    expect(result.status).toBe("held");
  });

  it("retries the first scan error and holds the fifth", () => {
    const retry = decideScan({
      extension: "pdf",
      header: pdf,
      clamd: { kind: "error", detail: "connection reset" },
      attempts: 1,
      allowUnscanned: false,
    });
    expect(retry.status).toBe("retry");
    if (retry.status === "retry") expect(retry.delaySeconds).toBeGreaterThan(0);

    const held = decideScan({
      extension: "pdf",
      header: pdf,
      clamd: { kind: "error", detail: "connection reset" },
      attempts: 5,
      allowUnscanned: false,
    });
    expect(held.status).toBe("held");
  });

  it("treats a skipped scanner as clean only when the dev flag is set", () => {
    const blocked = decideScan({
      extension: "pdf",
      header: pdf,
      clamd: { kind: "skipped_dev" },
      attempts: 1,
      allowUnscanned: false,
    });
    expect(blocked.status).not.toBe("clean");

    expect(
      decideScan({
        extension: "pdf",
        header: pdf,
        clamd: { kind: "skipped_dev" },
        attempts: 1,
        allowUnscanned: true,
      }),
    ).toEqual({ status: "clean" });
  });
});
