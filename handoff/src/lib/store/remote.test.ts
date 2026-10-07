import { afterEach, describe, expect, it } from "vitest";
import { objectStorageEnabled, openObjectStore } from "./objects";
import { remoteObjectStore } from "./remote";

const KEY = "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333";
const calls: { url: string; method: string }[] = [];

function fetchImpl(): typeof fetch {
  return (async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (method === "GET") {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }
    if (method === "HEAD") {
      return new Response(null, { status: 200, headers: { "content-length": "3" } });
    }
    if (method === "DELETE") return new Response(null, { status: 204 });
    return new Response("no", { status: 500 });
  }) as typeof fetch;
}

afterEach(() => {
  calls.length = 0;
  delete process.env.HANDOFF_R2_ORIGIN;
  delete process.env.HANDOFF_OBJECT_PATH;
  const env = process.env as Record<string, string | undefined>;
  delete env.NODE_ENV;
});

describe("remoteObjectStore", () => {
  it("reads and deletes an object key through the origin", async () => {
    const store = remoteObjectStore("http://handoff.r2", fetchImpl());
    expect(await store.read(KEY)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await store.stat(KEY)).toEqual({ sizeBytes: 3 });
    await store.remove(KEY);
    expect(await store.read("../secret")).toBeNull();
    expect(calls.map((call) => call.method)).toEqual(["GET", "HEAD", "DELETE"]);
    expect(calls[0]?.url).toBe(`http://handoff.r2/${KEY}`);
  });

  it("throws when the object service is down", async () => {
    const store = remoteObjectStore(
      "http://handoff.r2",
      (async () => new Response("down", { status: 503 })) as typeof fetch,
    );
    await expect(store.read(KEY)).rejects.toThrow(/down/);
  });
});

describe("object storage over a remote origin", () => {
  it("is on in production when the scan container has an object origin", async () => {
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = "production";
    process.env.HANDOFF_R2_ORIGIN = "http://handoff.r2";
    expect(objectStorageEnabled()).toBe(true);
    const globalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl();
    try {
      expect(await openObjectStore().read(KEY)).toEqual(new Uint8Array([1, 2, 3]));
    } finally {
      globalThis.fetch = globalFetch;
    }
  });
});
