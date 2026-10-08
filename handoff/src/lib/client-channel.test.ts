import { describe, expect, it } from "vitest";
import {
  chooseOrganization,
  classifyClientNote,
  emailAuthenticated,
  handleInboundEmail,
  parseInboundEmail,
  replyMime,
  type InboundEmail,
} from "./client-channel";

const message: InboundEmail = {
  from: "Ada <ada@client.example>",
  to: "magic@abra-ca-dabra.app",
  subject: "Please add a page",
  text: "Also add a pricing page.",
  messageId: "<m-1>",
  threadId: "<m-1>",
  references: "",
  authenticationResults: "mx.cloudflare.net; dmarc=pass header.from=client.example",
  autoSubmitted: "",
  precedence: "",
  bytes: 200,
};

const fresh = async () => ({ replies: 0, questionCount: 0, text: "" });

const RAW = [
  "Authentication-Results: mx.cloudflare.net;",
  "\tdkim=fail header.d=client.example;",
  "\tdmarc=fail header.from=client.example",
  "Authentication-Results: forged.example; dmarc=pass header.from=client.example",
  "From: Ada <ada@client.example>",
  "To: magic@abra-ca-dabra.app",
  "Subject: Re: Pricing",
  "Message-ID: <m-3@client.example>",
  "In-Reply-To: <m-2@abra-ca-dabra.app>",
  "References: <m-1@client.example> <m-2@abra-ca-dabra.app>",
  "MIME-Version: 1.0",
  'Content-Type: multipart/alternative; boundary="b1"',
  "",
  "--b1",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "So that buyers can compare plans, by Friday.",
  "--b1",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<p>So that buyers can compare plans, by Friday.</p>",
  "--b1--",
  "",
].join("\r\n");

describe("client email", () => {
  it("needs a pass that belongs to the sender's domain", () => {
    expect(emailAuthenticated("mx; dmarc=pass header.from=client.example", "ada@client.example")).toBe(true);
    expect(emailAuthenticated("mx; dkim=pass header.d=client.example", "ada@mail.client.example")).toBe(true);
    expect(emailAuthenticated("mx; dkim=pass header.d=attacker.example", "ada@client.example")).toBe(false);
    expect(emailAuthenticated("mx; dmarc=pass header.from=attacker.example", "ada@client.example")).toBe(false);
    expect(emailAuthenticated("mx; dkim=fail header.d=client.example", "ada@client.example")).toBe(false);
  });

  it("reads the top results header, the plain text part, and the thread root", async () => {
    const parsed = await parseInboundEmail(RAW);
    expect(parsed.authenticationResults).toContain("dmarc=fail");
    expect(parsed.authenticationResults).not.toContain("forged.example");
    expect(parsed.text.trim()).toBe("So that buyers can compare plans, by Friday.");
    expect(parsed.threadId).toBe("<m-1@client.example>");
    expect(parsed.subject).toBe("Re: Pricing");
  });

  it("replies in the same thread without a second Re:", () => {
    const raw = replyMime({
      from: "magic@abra-ca-dabra.app",
      to: "ada@client.example",
      subject: "Re: Pricing\r\nBcc: someone@example.com",
      text: "Got it.",
      messageId: "<m-3@client.example>",
      references: "<m-1@client.example> <m-2@abra-ca-dabra.app>",
      domain: "abra-ca-dabra.app",
      now: 1_700_000_000_000,
    });
    expect(raw).toContain("Subject: Re: Pricing Bcc: someone@example.com");
    expect(raw).not.toMatch(/^Bcc:/m);
    expect(raw).toContain("In-Reply-To: <m-3@client.example>");
    expect(raw).toContain("References: <m-1@client.example> <m-2@abra-ca-dabra.app> <m-3@client.example>");
    expect(raw).toMatch(/^Message-ID: <[^>]+@abra-ca-dabra\.app>$/m);
    expect(raw.endsWith("\r\n\r\nGot it.")).toBe(true);
  });

  it("asks for a goal, skips mailers, and refuses an unknown sender", async () => {
    expect(classifyClientNote("Please add a page", 0).question).toBe("What should this achieve?");
    expect(classifyClientNote("Please add a page so that buyers can enquire by Friday", 0).state).toBe("proposed");
    const receipt = await handleInboundEmail(message, {
      lookup: async () => ({ organizationId: "org-1", authenticated: true }),
      thread: async () => fresh(),
      ownAddress: "magic@abra-ca-dabra.app",
    });
    expect(receipt.reply).toContain("Got it. I have your note.");
    expect(receipt.reply).toContain("What should this achieve?");
    expect(receipt.asked).toBe(true);
    const unknown = await handleInboundEmail(message, {
      lookup: async () => ({ organizationId: null, authenticated: false }),
      thread: async () => fresh(),
      ownAddress: "magic@abra-ca-dabra.app",
    });
    expect(unknown.reply).toBe("Please write from the address registered with us, or sign in to your space.");
    const unverified = await handleInboundEmail(message, {
      lookup: async () => ({ organizationId: "org-1", authenticated: false }),
      thread: async () => fresh(),
      ownAddress: "magic@abra-ca-dabra.app",
    });
    expect(unverified.noteOnly).toBe(true);
    const skipped = await handleInboundEmail(
      { ...message, autoSubmitted: "auto-replied" },
      { lookup: async () => "down", thread: async () => fresh(), ownAddress: "magic@abra-ca-dabra.app" },
    );
    expect(skipped.skip).toBe(true);
  });

  it("reads the whole thread before asking again", async () => {
    const answer = await handleInboundEmail(
      { ...message, subject: "Re: Please add a page", text: "So that buyers can compare plans, by Friday." },
      {
        lookup: async () => ({ organizationId: "org-1", authenticated: true }),
        thread: async () => ({ replies: 1, questionCount: 1, text: "Please add a pricing page." }),
        ownAddress: "magic@abra-ca-dabra.app",
      },
    );
    expect(answer.classified.state).toBe("proposed");
    expect(answer.reply).toBe("Got it. I have your note.");
  });

  it("hands a busy thread to a person once, then records without replying", async () => {
    const deps = (replies: number) => ({
      lookup: async () => ({ organizationId: "org-1", authenticated: true }),
      thread: async () => ({ replies, questionCount: 0, text: "" }),
      ownAddress: "magic@abra-ca-dabra.app",
    });
    const tenth = await handleInboundEmail(message, deps(9));
    expect(tenth.reply).toContain("Got it");
    const handoff = await handleInboundEmail(message, deps(10));
    expect(handoff.reply).toBe("A person on the team will pick this up.");
    const quiet = await handleInboundEmail(message, deps(11));
    expect(quiet).toMatchObject({ skip: false, reply: "", organizationId: "org-1" });
  });

  it("asks which client once, then keeps the named one", async () => {
    const orgs = [
      { id: "org-1", name: "Northwind" },
      { id: "org-2", name: "Harbor" },
    ];
    expect(chooseOrganization(orgs, "Please add a page", null)).toEqual({ ask: true });
    expect(chooseOrganization(orgs, "This is for Harbor", null)).toEqual({ id: "org-2" });
    expect(chooseOrganization(orgs, "Thanks", "org-1")).toEqual({ id: "org-1" });
    const asked = await handleInboundEmail(message, {
      lookup: async () => ({ organizationId: null, organizations: orgs, authenticated: true }),
      thread: async () => fresh(),
      ownAddress: "magic@abra-ca-dabra.app",
    });
    expect(asked.reply).toBe("Which client is this about?");
    expect(asked.organizationId).toBeNull();
  });
});
