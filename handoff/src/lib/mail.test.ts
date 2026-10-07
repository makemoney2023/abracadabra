import { afterEach, describe, expect, it, vi } from "vitest";
import { sendHandoffMail } from "./mail";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

type ContextHolder = typeof globalThis & {
  [CLOUDFLARE_CONTEXT]?: { env?: { EMAIL?: { send: (message: unknown) => Promise<unknown> } } };
};

function setEmailBinding(send?: (message: unknown) => Promise<unknown>): void {
  const holder = globalThis as ContextHolder;
  if (!send) {
    delete holder[CLOUDFLARE_CONTEXT];
    return;
  }
  holder[CLOUDFLARE_CONTEXT] = { env: { EMAIL: { send } } };
}

const message = {
  from: "handoff@abra-ca-dabra.app",
  to: "ada@example.com",
  subject: "Your link",
  text: "Open this link.",
};

afterEach(() => {
  setEmailBinding();
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendHandoffMail", () => {
  it("sends through the Worker email binding and does not call another service", async () => {
    const send = vi.fn(async () => ({ messageId: "m1" }));
    setEmailBinding(send);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await sendHandoffMail(message);

    expect(send).toHaveBeenCalledWith({
      to: message.to,
      from: { email: message.from, name: "Abra-ca-dabra Ai" },
      subject: message.subject,
      text: message.text,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts plain text to Cloudflare Email Service when the binding is absent", async () => {
    process.env.CLOUDFLARE_API_TOKEN = "token";
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            errors: [],
            result: { delivered: [message.to], permanent_bounces: [], queued: [] },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendHandoffMail(message);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/email/sending/send");
    expect(String(url)).not.toContain("resend.com");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token");
    expect(JSON.parse(String(init.body))).toEqual({
      to: message.to,
      from: { address: message.from, name: "Abra-ca-dabra Ai" },
      subject: message.subject,
      text: message.text,
    });
  });

  it("sends the invite html with the plain copy", async () => {
    const send = vi.fn(async () => ({ messageId: "m2" }));
    setEmailBinding(send);
    const html = "<p>You're invited</p>";

    await sendHandoffMail({ ...message, html });

    expect(send).toHaveBeenCalledWith({
      to: message.to,
      from: { email: message.from, name: "Abra-ca-dabra Ai" },
      subject: message.subject,
      text: message.text,
      html,
    });
  });

  it("keeps a wrapped address and still uses the studio sender name", async () => {
    const send = vi.fn(async () => ({ messageId: "m3" }));
    setEmailBinding(send);

    await sendHandoffMail({ ...message, from: "Handoff <magic@abra-ca-dabra.app>" });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { email: "magic@abra-ca-dabra.app", name: "Abra-ca-dabra Ai" },
      }),
    );
  });

  it("refuses a binding send that does not return a message id", async () => {
    setEmailBinding(async () => ({}));

    await expect(sendHandoffMail(message)).rejects.toThrow("mail was refused");
  });

  it("refuses when neither the binding nor the API credentials are set", async () => {
    await expect(sendHandoffMail(message)).rejects.toThrow("mail is not configured");
  });

  it("refuses when Cloudflare reports the send failed", async () => {
    process.env.CLOUDFLARE_API_TOKEN = "token";
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: false, errors: [{ code: 10001 }] }), {
            status: 200,
          }),
      ),
    );

    await expect(sendHandoffMail(message)).rejects.toThrow("mail was refused");
  });

  it("refuses a non-ok HTTP response", async () => {
    process.env.CLOUDFLARE_API_TOKEN = "token";
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));

    await expect(sendHandoffMail(message)).rejects.toThrow("mail was refused");
  });
});
