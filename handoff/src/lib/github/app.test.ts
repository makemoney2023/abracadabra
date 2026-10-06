import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { listVisibleRepos, repoChoiceVisible, type VisibleInstall } from "./app";

function secrets() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    appId: "99",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    webhookSecret: "hook",
  };
}

describe("listVisibleRepos", () => {
  it("lists installs and at most 100 repos, and skips a suspended install's repos", async () => {
    const calls: string[] = [];
    const repos = Array.from({ length: 101 }, (_, index) => ({
      id: index + 1,
      full_name: `abracadabra/repo-${index + 1}`,
      private: true,
      default_branch: "main",
    }));
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      const auth = new Headers(init?.headers).get("authorization") ?? "";
      const agent = new Headers(init?.headers).get("user-agent") ?? "";
      if (!agent) throw new Error("missing user agent");
      if (url.endsWith("/app/installations")) {
        expect(auth.startsWith("Bearer ")).toBe(true);
        return Response.json([
          { id: 7, account: { login: "abracadabra", type: "Organization" }, suspended_at: null },
          { id: 8, account: { login: "old", type: "Organization" }, suspended_at: "2020-01-01T00:00:00Z" },
        ]);
      }
      if (url.endsWith("/access_tokens")) {
        expect(url.includes("/app/installations/7/")).toBe(true);
        return Response.json({ token: "ghs_test" });
      }
      expect(auth).toBe("Bearer ghs_test");
      return Response.json({ repositories: repos });
    };
    const listed = await listVisibleRepos({ secrets: secrets(), fetch: fetchImpl, now: 1_700_000_000_000 });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.map((install) => install.accountLogin)).toEqual(["abracadabra", "old"]);
    expect(listed.value[0]?.repos).toHaveLength(100);
    expect(listed.value[1]?.suspended).toBe(true);
    expect(listed.value[1]?.repos).toEqual([]);
    expect(calls.some((url) => url.includes("/installations/8/"))).toBe(false);
    expect(JSON.stringify(listed.value).includes("ghs_test")).toBe(false);
  });

  it("says GitHub did not answer when the API fails", async () => {
    const fetchImpl: typeof fetch = async () => new Response("no", { status: 500 });
    const listed = await listVisibleRepos({ secrets: secrets(), fetch: fetchImpl, now: 1_700_000_000_000 });
    expect(listed).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("repoChoiceVisible", () => {
  it("matches a repo the app can see", () => {
    const installs: VisibleInstall[] = [
      {
        id: 7,
        accountLogin: "abracadabra",
        accountType: "Organization",
        suspended: false,
        repos: [{ id: 99, fullName: "renewimplants/social-preview", isPrivate: true, defaultBranch: "main" }],
      },
    ];
    expect(repoChoiceVisible(99, installs)?.fullName).toBe("renewimplants/social-preview");
    expect(repoChoiceVisible(1, installs)).toBeNull();
  });
});
