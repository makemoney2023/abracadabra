import { describe, expect, it } from "vitest";
import { listRepoDirectory, readRepoText, searchRepoCode } from "./browse";

const FULL = "north/site";
const TOKEN = "install-token";

function headersOf(init?: RequestInit): Headers {
  return new Headers(init?.headers);
}

describe("listRepoDirectory", () => {
  it("lists one folder and skips a path that leaves the repo", async () => {
    const calls: string[] = [];
    const listed = await listRepoDirectory({
      fullName: FULL,
      ref: "main",
      path: "src",
      token: TOKEN,
      fetch: async (input, init) => {
        calls.push(String(input));
        expect(headersOf(init).get("authorization")).toBe("Bearer install-token");
        return Response.json([
          { name: "app.ts", path: "src/app.ts", type: "file", size: 12 },
          { name: "lib", path: "src/lib", type: "dir" },
        ]);
      },
    });
    expect(listed).toEqual({
      ok: true,
      entries: [
        { name: "lib", path: "src/lib", type: "dir", size: null },
        { name: "app.ts", path: "src/app.ts", type: "file", size: 12 },
      ],
      truncated: false,
    });
    expect(calls).toEqual(["https://api.github.com/repos/north/site/contents/src?ref=main"]);
    let fetched = false;
    const refused = await listRepoDirectory({
      fullName: FULL,
      ref: "main",
      path: "../secret",
      token: TOKEN,
      fetch: async () => {
        fetched = true;
        return new Response("no", { status: 500 });
      },
    });
    expect(refused).toEqual({ ok: false, error: "invalid" });
    expect(fetched).toBe(false);
  });
});

describe("readRepoText", () => {
  it("returns text, marks a picture as binary, and caps a long file", async () => {
    const long = "a".repeat(20_010);
    const read = await readRepoText({
      fullName: FULL,
      ref: "main",
      path: "src/app.ts",
      token: TOKEN,
      fetch: async () =>
        Response.json({
          type: "file",
          path: "src/app.ts",
          size: 18,
          encoding: "base64",
          content: Buffer.from("export const hi = 1;\n").toString("base64"),
        }),
    });
    expect(read).toEqual({ ok: true, path: "src/app.ts", body: "export const hi = 1;\n", truncated: false });
    const picture = await readRepoText({
      fullName: FULL,
      ref: "main",
      path: "logo.png",
      token: TOKEN,
      fetch: async () => Response.json({ type: "file", path: "logo.png", size: 4, encoding: "base64", content: "AAAA" }),
    });
    expect(picture).toEqual({ ok: true, path: "logo.png", binary: true, size: 4 });
    const capped = await readRepoText({
      fullName: FULL,
      ref: "main",
      path: "notes.md",
      token: TOKEN,
      fetch: async () =>
        Response.json({
          type: "file",
          path: "notes.md",
          size: long.length,
          encoding: "base64",
          content: Buffer.from(long).toString("base64"),
        }),
    });
    expect(capped.ok).toBe(true);
    if (!capped.ok || !("body" in capped)) return;
    expect(capped.body).toHaveLength(20_000);
    expect(capped.truncated).toBe(true);
  });

  it("does not fetch a missing path or a file GitHub says is too big to inline", async () => {
    const missing = await readRepoText({
      fullName: FULL,
      ref: "main",
      path: "gone.ts",
      token: TOKEN,
      fetch: async () => new Response("no", { status: 404 }),
    });
    expect(missing).toEqual({ ok: false, error: "missing" });
    const huge = await readRepoText({
      fullName: FULL,
      ref: "main",
      path: "dump.json",
      token: TOKEN,
      fetch: async () => Response.json({ type: "file", path: "dump.json", size: 600_000 }),
    });
    expect(huge).toEqual({ ok: true, path: "dump.json", tooLarge: true, size: 600_000 });
  });
});

describe("searchRepoCode", () => {
  it("keeps hits in this repo and refuses a query that names another repo", async () => {
    const calls: string[] = [];
    const found = await searchRepoCode({
      fullName: FULL,
      query: "calendar",
      token: TOKEN,
      fetch: async (input, init) => {
        calls.push(String(input));
        expect(headersOf(init).get("accept")).toBe("application/vnd.github.text-match+json");
        return Response.json({
          items: [
            {
              path: "src/calendar.ts",
              repository: { full_name: FULL },
              text_matches: [{ fragment: "content calendar" }],
            },
            {
              path: "secret.ts",
              repository: { full_name: "other/private" },
              text_matches: [{ fragment: "do not show" }],
            },
          ],
        });
      },
    });
    expect(found).toEqual({ ok: true, hits: [{ path: "src/calendar.ts", fragment: "content calendar" }] });
    expect(calls[0]).toContain("repo%3Anorth%2Fsite");
    let fetched = false;
    const widened = await searchRepoCode({
      fullName: FULL,
      query: "password repo:other/private",
      token: TOKEN,
      fetch: async () => {
        fetched = true;
        return new Response("no", { status: 500 });
      },
    });
    expect(widened).toEqual({ ok: false, error: "invalid" });
    expect(fetched).toBe(false);
  });
});
