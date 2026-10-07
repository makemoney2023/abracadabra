import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { openPreviewSession } from "@/lib/preview-session";
import { ensureUploadShare } from "@/lib/share-link";
import { SESSION_COOKIE } from "@/lib/session";
import ShareConfirmPage from "./page";
import { GET, POST } from "./open/route";

const NOW = 1_700_000_000_000;

describe("share link confirm", () => {
  let directory = "";

  afterEach(() => {
    delete process.env.HANDOFF_SQLITE_PATH;
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  async function readyShare() {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-share-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    const sql = await openHandoffDb();
    await migrate(sql);
    await openPreviewSession({ sql, now: NOW });
    const workspace = await sql.get<{ id: string }>("SELECT id FROM workspaces");
    const token = await ensureUploadShare(sql, workspace?.id ?? "", NOW);
    const request = await sql.get<{ id: string }>("SELECT id FROM requests WHERE status = 'open'");
    return { sql, token, requestId: request?.id ?? "" };
  }

  it("shows a button and does not open the folder", async () => {
    const { sql, token } = await readyShare();
    const before = await sql.get<{ n: number }>("SELECT count(*) AS n FROM sessions");
    const html = renderToStaticMarkup(await ShareConfirmPage({ params: Promise.resolve({ token }) }));
    expect(html).toContain("Open the folder");
    expect(html).toContain(`/share/${token}/open`);
    expect(html).not.toContain("set-cookie");
    const after = await sql.get<{ n: number }>("SELECT count(*) AS n FROM sessions");
    const guests = await sql.get<{ n: number }>("SELECT count(*) AS n FROM users WHERE email LIKE 'share+%'");
    expect(after?.n).toBe(before?.n);
    expect(guests?.n).toBe(0);
  });

  it("opens the folder only when the button is pressed", async () => {
    const { token, requestId } = await readyShare();
    const response = await POST(new Request(`https://handoff.example/share/${token}/open`, { method: "POST" }), {
      params: Promise.resolve({ token }),
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `https://handoff.example/w/strongfoam/drop?request=${requestId}`,
    );
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie).not.toContain(token);
  });

  it("sends a bad press home without a session", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "handoff-share-"));
    process.env.HANDOFF_SQLITE_PATH = path.join(directory, "handoff.db");
    const sql = await openHandoffDb();
    await migrate(sql);
    const response = await POST(new Request("https://handoff.example/share/nope/open", { method: "POST" }), {
      params: Promise.resolve({ token: "nope" }),
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://handoff.example/?notice=share");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not open the folder when the open address is only visited", async () => {
    const { sql, token } = await readyShare();
    const before = await sql.get<{ n: number }>("SELECT count(*) AS n FROM users WHERE email LIKE 'share+%'");
    const response = await GET(new Request(`https://handoff.example/share/${token}/open`), {
      params: Promise.resolve({ token }),
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("set-cookie")).toBeNull();
    const after = await sql.get<{ n: number }>("SELECT count(*) AS n FROM users WHERE email LIKE 'share+%'");
    expect(after?.n).toBe(before?.n);
  });
});
