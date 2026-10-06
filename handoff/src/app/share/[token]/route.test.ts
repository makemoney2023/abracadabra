import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { openPreviewSession } from "@/lib/preview-session";
import { ensureUploadShare } from "@/lib/share-link";
import { SESSION_COOKIE } from "@/lib/session";
import { GET } from "./route";

const NOW = 1_700_000_000_000;

describe("GET /share/[token]", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it("sets a session cookie and opens the upload page", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-share-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    const sql = await openHandoffDb();
    await migrate(sql);
    await openPreviewSession({ sql, now: NOW });
    const workspace = await sql.get<{ id: string }>("SELECT id FROM workspaces");
    const token = await ensureUploadShare(sql, workspace?.id ?? "", NOW);
    const request = await sql.get<{ id: string }>(
      "SELECT id FROM requests WHERE status = 'open'",
    );

    const response = await GET(new Request(`https://handoff.example/share/${token}`), {
      params: Promise.resolve({ token }),
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `https://handoff.example/w/strongfoam/drop?request=${request?.id}`,
    );
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie).not.toContain(token);
  });

  it("sends a bad link home without a session", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-share-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    const sql = await openHandoffDb();
    await migrate(sql);
    const response = await GET(new Request("https://handoff.example/share/nope"), {
      params: Promise.resolve({ token: "nope" }),
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://handoff.example/?notice=share");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
