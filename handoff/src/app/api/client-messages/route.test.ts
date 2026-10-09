import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const SECRET = "channel-secret";

afterEach(() => {
  delete process.env.HANDOFF_SQLITE_PATH;
  delete process.env.CLIENT_CHANNEL_SECRET;
});

function post(body: unknown, bearer = SECRET): Promise<Response> {
  return POST(
    new Request("https://hq.example/api/client-messages", {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/client-messages open_prospect", () => {
  it("refuses a request with no bearer", async () => {
    process.env.HANDOFF_SQLITE_PATH = ":memory:";
    process.env.CLIENT_CHANNEL_SECRET = SECRET;
    const response = await POST(
      new Request("https://hq.example/api/client-messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "open_prospect", email: "ada@northwind.example", name: "Ada North" }),
      }),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "unauthorized" });
  });

  it("rejects an address that is not an email", async () => {
    process.env.HANDOFF_SQLITE_PATH = ":memory:";
    process.env.CLIENT_CHANNEL_SECRET = SECRET;
    const response = await post({ action: "open_prospect", email: "not-an-email", name: "Ada" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid" });
  });

  it("opens a lead for a company address", async () => {
    process.env.HANDOFF_SQLITE_PATH = ":memory:";
    process.env.CLIENT_CHANNEL_SECRET = SECRET;
    const response = await post({
      action: "open_prospect",
      email: "Ada@Northwind.example",
      name: "Ada North",
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; value: { id: string; name: string; created: boolean } };
    expect(body.ok).toBe(true);
    expect(body.value.name).toBe("Ada North");
    expect(body.value.created).toBe(true);
    expect(body.value.id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
