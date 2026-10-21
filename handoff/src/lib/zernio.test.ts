import { describe, expect, it } from "vitest";
import { ZernioError, createZernioClient } from "./zernio";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function fakeFetch(responses: { status?: number; body: unknown }[]) {
  const calls: Call[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    });
    const next = responses.shift() ?? { body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  }) as typeof fetch;
  return { fetcher, calls };
}

describe("zernio client", () => {
  it("sends the bearer key and finds a profile by external id", async () => {
    const { fetcher, calls } = fakeFetch([
      { body: { profiles: [{ _id: "p1", name: "Acme", externalId: "org-1" }] } },
    ]);
    const client = createZernioClient("sk_test", fetcher);
    const found = await client.findProfile("org-1");
    expect(found).toEqual({ _id: "p1", name: "Acme", externalId: "org-1" });
    expect(calls[0].url).toBe("https://zernio.com/api/v1/profiles?externalId=org-1");
    expect(calls[0].headers.authorization).toBe("Bearer sk_test");
  });

  it("reuses the existing profile when create answers 409", async () => {
    const { fetcher } = fakeFetch([
      { status: 409, body: { error: "profile_external_id_conflict", details: { existingProfileId: "p9" } } },
    ]);
    const client = createZernioClient("sk_test", fetcher);
    await expect(client.createProfile({ name: "Acme", externalId: "org-1" })).resolves.toMatchObject({ _id: "p9" });
  });

  it("returns the sign-in link for a network", async () => {
    const { fetcher, calls } = fakeFetch([{ body: { authUrl: "https://www.instagram.com/oauth?x=1", state: "s" } }]);
    const client = createZernioClient("sk_test", fetcher);
    const url = await client.connectUrl("instagram", "p1", "https://hq.example/clients/org-1?tab=social");
    expect(url).toBe("https://www.instagram.com/oauth?x=1");
    expect(calls[0].url).toBe(
      "https://zernio.com/api/v1/connect/instagram?profileId=p1&redirect_url=https%3A%2F%2Fhq.example%2Fclients%2Forg-1%3Ftab%3Dsocial",
    );
  });

  it("maps accounts with _id and posts with content and platforms", async () => {
    const { fetcher, calls } = fakeFetch([
      { body: { accounts: [{ _id: "a1", platform: "twitter", profileId: "p1", username: "@acme", isActive: true }] } },
      { body: { post: { _id: "65f1c0a9e2b5af0012ab34cd", status: "scheduled" } } },
    ]);
    const client = createZernioClient("sk_test", fetcher);
    const accounts = await client.listAccounts("p1");
    expect(accounts).toEqual([
      { _id: "a1", platform: "twitter", profileId: "p1", username: "@acme", displayName: null, isActive: true },
    ]);
    const post = await client.createPost({
      content: "Hi",
      profileId: "p1",
      platforms: [{ platform: "twitter", accountId: "a1" }],
      mediaItems: [],
      scheduledFor: "2026-11-01T10:00:00.000Z",
    });
    expect(post._id).toBe("65f1c0a9e2b5af0012ab34cd");
    expect(calls[1]).toMatchObject({ method: "POST", url: "https://zernio.com/api/v1/posts" });
    expect(calls[1].body).toMatchObject({ content: "Hi", platforms: [{ platform: "twitter", accountId: "a1" }] });
  });

  it("throws the API's error message with the status", async () => {
    const { fetcher } = fakeFetch([{ status: 401, body: { error: "Invalid API key" } }]);
    const client = createZernioClient("bad", fetcher);
    const failure = await client.listAccounts("p1").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ZernioError);
    expect(failure).toMatchObject({ message: "Invalid API key", status: 401 });
  });
});
