import { describe, expect, it } from "vitest";
import { loadManifestBundle, resolveCommitSha } from "./contents";

const MANIFEST = {
  title: "Launch posts",
  kind: "social_pack",
  items: [
    {
      title: "Square",
      format: "static",
      section: "Launch",
      channel: "instagram",
      copy: "Now open",
      media: [{ path: "square.png", role: "main" }],
    },
  ],
};

function jsonFile(value: unknown): Response {
  const content = Buffer.from(JSON.stringify(value)).toString("base64");
  return new Response(JSON.stringify({ content, encoding: "base64" }), { status: 200 });
}

function bytesFile(bytes: number[]): Response {
  const wrapped = Buffer.from(Uint8Array.from(bytes)).toString("base64").replace(/(.{60})/g, "$1\n");
  return new Response(JSON.stringify({ content: wrapped, encoding: "base64" }), { status: 200 });
}

describe("loadManifestBundle", () => {
  it("fetches the manifest and only the media it names", async () => {
    const calls: string[] = [];
    const result = await loadManifestBundle({
      fullName: "makemoney2023/renewimplants",
      ref: "abc123",
      manifestPath: "deliverables/social-preview/manifest.json",
      token: "install-token",
      fetch: async (input, init) => {
        const url = String(input);
        calls.push(url);
        const header = new Headers(init?.headers);
        expect(header.get("authorization")).toBe("Bearer install-token");
        if (url.includes("secret") || url.includes("notes.txt")) throw new Error("fetched a file that was not listed");
        if (url.endsWith("/contents/deliverables/social-preview/manifest.json?ref=abc123")) return jsonFile(MANIFEST);
        if (url.endsWith("/contents/deliverables/social-preview/square.png?ref=abc123")) return bytesFile([1, 2, 3]);
        return new Response("no", { status: 404 });
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(calls).toEqual([
      "https://api.github.com/repos/makemoney2023/renewimplants/contents/deliverables/social-preview/manifest.json?ref=abc123",
      "https://api.github.com/repos/makemoney2023/renewimplants/contents/deliverables/social-preview/square.png?ref=abc123",
    ]);
    expect(result.value.files["square.png"]?.bytes).toEqual(Uint8Array.from([1, 2, 3]));
    expect(result.value.files["square.png"]?.contentType).toBe("image/png");
    expect(result.value.manifest.items[0]?.title).toBe("Square");
  });

  it("stops when a listed path leaves the folder", async () => {
    const calls: string[] = [];
    const sneaky = {
      ...MANIFEST,
      items: [{ ...MANIFEST.items[0], media: [{ path: "../src/secret.ts", role: "main" }] }],
    };
    const result = await loadManifestBundle({
      fullName: "makemoney2023/renewimplants",
      ref: "abc123",
      manifestPath: "deliverables/social-preview/manifest.json",
      token: "install-token",
      fetch: async (input) => {
        calls.push(String(input));
        if (String(input).includes("secret")) throw new Error("fetched a secret");
        return jsonFile(sneaky);
      },
    });
    expect(result).toEqual({ ok: false, error: "invalid" });
    expect(calls).toHaveLength(1);
  });

  it("keeps a real commit id and drops anything else", async () => {
    const sha = "a".repeat(40);
    const good = await resolveCommitSha({
      fullName: "makemoney2023/renewimplants",
      ref: "main",
      token: "install-token",
      fetch: async () => new Response(JSON.stringify({ sha }), { status: 200 }),
    });
    const bad = await resolveCommitSha({
      fullName: "makemoney2023/renewimplants",
      ref: "main",
      token: "install-token",
      fetch: async () => new Response(JSON.stringify({ sha: "not-a-commit" }), { status: 200 }),
    });
    expect(good).toBe(sha);
    expect(bad).toBeNull();
  });

  it("refuses a folder listing", async () => {
    const result = await loadManifestBundle({
      fullName: "makemoney2023/renewimplants",
      ref: "abc123",
      manifestPath: "deliverables/social-preview",
      token: "install-token",
      fetch: async () => new Response(JSON.stringify([{ name: "manifest.json" }]), { status: 200 }),
    });
    expect(result).toEqual({ ok: false, error: "invalid" });
  });
});
