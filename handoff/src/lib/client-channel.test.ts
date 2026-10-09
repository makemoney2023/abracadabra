import { describe, expect, it } from "vitest";
import {
  chooseOrganization,
  classifyClientNote,
  emailAuthenticated,
  handleInboundEmail,
  clientTurnFromModel,
  parseClientTurn,
  parseInboundEmail,
  replyMime,
  replyToClient,
  type ClientDesk,
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
  attachments: [],
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

const desk: ClientDesk = {
  name: "Northwind",
  brief: "They sell foam.",
  status: "Copy is in review.",
  requests: [],
  messages: [],
  forbiddenNames: ["Harbor"],
};

describe("mailbox reply", () => {
  it("answers a status question from the published brief", async () => {
    const turn = await replyToClient({
      desk,
      incoming: "Where are we?",
      model: async () => ({
        reply: "Copy is in review. The brief is about foam.",
        kind: "status",
        goal: null,
        due: null,
      }),
    });
    expect(turn.kind).toBe("status");
    expect(turn.reply).toContain("foam");
    expect(turn.file).toBe(false);
  });

  it("does not put a board task on a question that only restates the request", async () => {
    const turn = await replyToClient({
      desk,
      incoming: "We need social media ads.",
      model: async () => ({
        reply: "The work you asking about is social media ads, what is the goal of these ads?",
        kind: "new_work",
        goal: null,
        due: null,
        actions: [{ title: "Social media ads", assignee: null, due: null, skill: null }],
        brief: "They want social media ads.",
      }),
    });
    expect(turn.reply).toContain("?");
    expect(turn.actions).toEqual([]);
    expect(turn.file).toBe(true);
  });

  it("files a task after the client has named the outcome and the reply is not a question", async () => {
    const turn = await replyToClient({
      desk,
      incoming: "The ads should book more calls.",
      model: async () => ({
        reply: "I'll put a social ads plan on the board for more booked calls.",
        kind: "new_work",
        goal: "more booked calls",
        due: null,
        actions: [{ title: "Draft the social ads plan", assignee: null, due: null, skill: null }],
      }),
    });
    expect(turn.actions).toEqual([{ title: "Draft the social ads plan", assignee: null, due: null, skill: null }]);
    expect(turn.file).toBe(true);
  });

  it("asks one question for new work that has no goal", async () => {
    const turn = await replyToClient({
      desk,
      incoming: "Please add a pricing page.",
      model: async () => ({
        reply: "What should the pricing page help a buyer do?",
        kind: "new_work",
        goal: null,
        due: null,
      }),
    });
    expect(turn.kind).toBe("new_work");
    expect(turn.file).toBe(true);
    expect(turn.reply).toContain("?");
  });

  it("keeps the model sentence when it prices, promises a date, or names another client, and files nothing", async () => {
    for (const reply of ["That will be $500.", "We will ship it by Friday.", "Harbor can wait."]) {
      const turn = await replyToClient({
        desk,
        incoming: "Add a page.",
        model: async () => ({
          reply,
          kind: "new_work",
          goal: "sell",
          due: "Friday",
          actions: [{ title: "Write the page", assignee: null, due: null, skill: null }],
          brief: "Add a page.",
        }),
      });
      expect(turn.reply).toBe(reply);
      expect(turn.kind).toBe("handoff");
      expect(turn.file).toBe(false);
      expect(turn.actions).toEqual([]);
      expect(turn.brief).toBeNull();
    }
  });

  it("reads a Workers AI turn when response is already an object", () => {
    const turn = clientTurnFromModel({
      response: {
        reply: "The walkthrough is in review.",
        kind: "status",
        goal: null,
        due: null,
        actions: [],
        brief: null,
        rules: null,
      },
    });
    expect(turn.reply).toBe("The walkthrough is in review.");
    expect(turn.kind).toBe("status");
  });

  it("still reads a Workers AI turn when response is a JSON string", () => {
    const turn = clientTurnFromModel({
      response: '{"reply":"Got the note.","kind":"other","goal":null,"due":null}',
    });
    expect(turn.reply).toBe("Got the note.");
    expect(turn.kind).toBe("other");
  });

  it("uses the reply field when the model JSON has no kind", () => {
    const turn = clientTurnFromModel({ response: '{"reply":"Copy is in review."}' });
    expect(turn.reply).toBe("Copy is in review.");
    expect(turn.kind).toBe("other");
    expect(turn.actions).toEqual([]);
  });

  it("sends a plain model answer when Workers AI does not return JSON", () => {
    const turn = clientTurnFromModel({ response: "Copy is in review. The brief is about foam." });
    expect(turn.reply).toBe("Copy is in review. The brief is about foam.");
    expect(turn.kind).toBe("other");
    expect(turn.actions).toEqual([]);
  });

  it("reads a plain answer nested under result.response", () => {
    const turn = clientTurnFromModel({ result: { response: "The walkthrough is in review." } });
    expect(turn.reply).toBe("The walkthrough is in review.");
    expect(turn.kind).toBe("other");
  });

  it("keeps the task titles and the brief sentence, and drops them when the reply is handed off", async () => {
    const parsed = parseClientTurn(
      'Sure. {"reply":"I can add that.","kind":"new_work","goal":"help buyers compare","due":null,"actions":[{"title":"Write the pricing page"}],"brief":"Add a pricing page."}',
    );
    expect(parsed.actions).toEqual([{ title: "Write the pricing page", assignee: null, due: null, skill: null }]);
    expect(parsed.brief).toBe("Add a pricing page.");
    const kept = await replyToClient({
      desk,
      incoming: "Please add a pricing page.",
      model: async () => parsed,
    });
    expect(kept.actions).toEqual([{ title: "Write the pricing page", assignee: null, due: null, skill: null }]);
    expect(kept.brief).toBe("Add a pricing page.");
    expect(kept.file).toBe(true);
    const dropped = await replyToClient({
      desk,
      incoming: "Please add a pricing page.",
      model: async () => ({ ...parsed, reply: "That will be $500." }),
    });
    expect(dropped.reply).toBe("That will be $500.");
    expect(dropped.kind).toBe("handoff");
    expect(dropped.actions).toEqual([]);
    expect(dropped.brief).toBeNull();
  });

  it("opens a lead and asks an authenticated new sender what they want", async () => {
    let opened: { email: string; name: string | null } | null = null;
    const answer = await handleInboundEmail(
      { ...message, from: "Ada North <ada@northwind.example>", text: "We need a new site." },
      {
        lookup: async () => ({ organizationId: null, organizations: [], authenticated: true }),
        openProspect: async (input) => {
          opened = input;
          return { id: "lead-1", name: "Ada North" };
        },
        thread: async () => fresh(),
        ownAddress: "magic@abra-ca-dabra.app",
        bookingUrl: "https://cal.example/working-session",
        answer: async (_organizationId, _organizations, prospect) => {
          expect(prospect).toBe(true);
          return {
            reply: "What should this site accomplish?",
            kind: "other" as const,
            goal: null,
            due: null,
            file: false,
            actions: [{ title: "Build the site", assignee: null, due: null, skill: null }],
            brief: null,
            rules: null,
          };
        },
      },
    );
    expect(opened).toEqual({
      email: "ada@northwind.example",
      name: "Ada North",
      text: "We need a new site.",
      subject: "Please add a page",
      threadId: "<m-1>",
      references: "",
    });
    expect(answer.organizationId).toBe("lead-1");
    expect(answer.prospect).toBe(true);
    expect(answer.reply).toBe("What should this site accomplish?");
    expect(answer.reply).not.toContain("registered");
    expect(answer.file).toBe(false);
    expect(answer.plan.actions).toEqual([]);
    expect(answer.bookingOffered).toBe(false);
  });

  it("keeps a clarifying question off the board", async () => {
    const answer = await handleInboundEmail(
      { ...message, text: "We need social media ads." },
      {
        lookup: async () => ({ organizationId: "org-1", authenticated: true }),
        thread: async () => fresh(),
        ownAddress: "magic@abra-ca-dabra.app",
        answer: async () => ({
          reply: "What result do you want from the ads?",
          kind: "new_work" as const,
          goal: null,
          due: null,
          file: true,
          actions: [{ title: "Social media ads", assignee: null, due: null, skill: null }],
          brief: "They want ads.",
          rules: null,
        }),
      },
    );
    expect(answer.plan.actions).toEqual([]);
    expect(answer.plan.brief).toBe("They want ads.");
    expect(answer.asked).toBe(true);
  });

  it("offers the booking link once the prospect's outcome is on the brief", async () => {
    const answer = await handleInboundEmail(message, {
      lookup: async () => ({
        organizationId: "lead-1",
        organizations: [{ id: "lead-1", name: "Ada North", kind: "lead" }],
        authenticated: true,
      }),
      openProspect: async () => {
        throw new Error("already a lead");
      },
      thread: async () => fresh(),
      ownAddress: "magic@abra-ca-dabra.app",
      bookingUrl: "https://cal.example/working-session",
      answer: async () => ({
        reply: "A working session is the next step.",
        kind: "other" as const,
        goal: "more booked calls",
        due: "Thursday",
        file: true,
        actions: [],
        brief: "They want a site so buyers can book a call.",
        rules: null,
      }),
    });
    expect(answer.prospect).toBe(true);
    expect(answer.reply).toContain("https://cal.example/working-session");
    expect(answer.bookingOffered).toBe(true);
    expect(answer.plan.brief).toContain("book a call");
    expect(answer.file).toBe(false);
  });

  it("refuses an unauthenticated new sender and does not open a lead", async () => {
    let opened = false;
    const unknown = await handleInboundEmail(message, {
      lookup: async () => ({ organizationId: null, organizations: [], authenticated: false }),
      openProspect: async () => {
        opened = true;
        return { id: "lead-1", name: "Ada" };
      },
      thread: async () => fresh(),
      ownAddress: "magic@abra-ca-dabra.app",
    });
    expect(opened).toBe(false);
    expect(unknown.reply).toBe("Please write from the address registered with us, or sign in to your space.");
    expect(unknown.prospect).toBe(false);
  });

  it("does not call the model until the sender and the client are known", async () => {
    let calls = 0;
    const answer = async () => {
      calls += 1;
      return { reply: "Copy is in review.", kind: "status" as const, goal: null, due: null, file: false };
    };
    const unknown = await handleInboundEmail(message, {
      lookup: async () => ({ organizationId: null, authenticated: false }),
      thread: async () => fresh(),
      ownAddress: "magic@abra-ca-dabra.app",
      answer,
    });
    expect(unknown.reply).toContain("registered");
    const orgs = [
      { id: "org-1", name: "Northwind" },
      { id: "org-2", name: "Harbor" },
    ];
    const asked = await handleInboundEmail(message, {
      lookup: async () => ({ organizationId: null, organizations: orgs, authenticated: true }),
      thread: async () => fresh(),
      ownAddress: "magic@abra-ca-dabra.app",
      answer,
    });
    expect(asked.reply).toBe("Which client is this about?");
    const busy = await handleInboundEmail(message, {
      lookup: async () => ({ organizationId: "org-1", authenticated: true }),
      thread: async () => ({ replies: 10, questionCount: 0, text: "" }),
      ownAddress: "magic@abra-ca-dabra.app",
      answer,
    });
    expect(busy.reply).toBe("A person on the team will pick this up.");
    expect(calls).toBe(0);
    const failed = await handleInboundEmail(message, {
      lookup: async () => ({ organizationId: "org-1", authenticated: true }),
      thread: async () => fresh(),
      ownAddress: "magic@abra-ca-dabra.app",
      answer: async () => {
        throw new Error("model down");
      },
    });
    expect(failed.reply).toContain("will follow up");
  });

  it("hands a stalled prospect to a person before the model, and still asks once a brief exists", async () => {
    let calls = 0;
    const answer = async () => {
      calls += 1;
      return { reply: "What is the outcome?", kind: "other" as const, goal: null, due: null, file: false };
    };
    const stalled = await handleInboundEmail(
      { ...message, from: "Ada <ada@northwind.example>", text: "Still thinking." },
      {
        lookup: async () => ({
          organizationId: "lead-1",
          organizations: [{ id: "lead-1", name: "Ada", kind: "lead" }],
          authenticated: true,
        }),
        thread: async () => ({ replies: 0, questionCount: 0, text: "", prospectReplies: 3, briefPresent: false }),
        ownAddress: "magic@abra-ca-dabra.app",
        answer,
      },
    );
    expect(stalled.reply).toBe("A person on the team will pick this up.");
    expect(stalled.file).toBe(false);
    expect(stalled.stalled).toBe(true);
    expect(stalled.plan.actions).toEqual([]);
    expect(calls).toBe(0);

    const handed = await handleInboundEmail(message, {
      lookup: async () => ({
        organizationId: "lead-1",
        organizations: [{ id: "lead-1", name: "Ada", kind: "lead" }],
        authenticated: true,
      }),
      thread: async () => fresh(),
      ownAddress: "magic@abra-ca-dabra.app",
      answer: async () => ({
        reply: "I'll ask a person to take this.",
        kind: "handoff" as const,
        goal: null,
        due: null,
        file: true,
        actions: [{ title: "Build it", assignee: null, due: null, skill: null }],
        brief: "They want a site.",
        rules: null,
      }),
    });
    expect(handed.reply).toBe("I'll ask a person to take this.");
    expect(handed.file).toBe(false);
    expect(handed.stalled).toBe(true);
    expect(handed.plan).toEqual({ actions: [], brief: null, rules: null });

    const continued = await handleInboundEmail(
      { ...message, from: "Ada <ada@northwind.example>", text: "The outcome is more calls." },
      {
        lookup: async () => ({
          organizationId: "lead-1",
          organizations: [{ id: "lead-1", name: "Ada", kind: "lead" }],
          authenticated: true,
        }),
        thread: async () => ({ replies: 1, questionCount: 0, text: "", prospectReplies: 3, briefPresent: true }),
        ownAddress: "magic@abra-ca-dabra.app",
        answer,
      },
    );
    expect(calls).toBe(1);
    expect(continued.reply).toBe("What is the outcome?");
  });

  it("stops mail for an opt-out and keeps answering a different request", async () => {
    let calls = 0;
    const answer = async () => {
      calls += 1;
      return { reply: "What should this achieve?", kind: "other" as const, goal: null, due: null, file: false };
    };
    const stopped = await handleInboundEmail({ ...message, text: "Please stop" }, {
      lookup: async () => ({ organizationId: "org-1", organizations: [{ id: "org-1", name: "Northwind", kind: "client" }], authenticated: true }),
      thread: async () => fresh(),
      ownAddress: "magic@abra-ca-dabra.app",
      answer,
    });
    expect(stopped.reply).toBe("Mail from this mailbox will stop.");
    expect(stopped.optOut).toBe(true);
    expect(calls).toBe(0);

    const later = await handleInboundEmail(message, {
      lookup: async () => ({
        organizationId: "org-1",
        organizations: [{ id: "org-1", name: "Northwind", kind: "client" }],
        authenticated: true,
        optedOut: true,
      }),
      thread: async () => fresh(),
      ownAddress: "magic@abra-ca-dabra.app",
      answer,
    });
    expect(later.reply).toBe("");
    expect(later.send).toBe(false);
    expect(later.skip).toBe(false);
    expect(calls).toBe(0);

    const working = await handleInboundEmail({ ...message, text: "Do not stop the work" }, {
      lookup: async () => ({ organizationId: "org-1", authenticated: true }),
      thread: async () => fresh(),
      ownAddress: "magic@abra-ca-dabra.app",
      answer,
    });
    expect(working.optOut).toBe(false);
    expect(calls).toBe(1);

    let opened = false;
    const unknown = await handleInboundEmail({ ...message, text: "unsubscribe" }, {
      lookup: async () => ({ organizationId: null, organizations: [], authenticated: true }),
      openProspect: async () => {
        opened = true;
        return { id: "lead-1", name: "Ada" };
      },
      thread: async () => fresh(),
      ownAddress: "magic@abra-ca-dabra.app",
    });
    expect(opened).toBe(false);
    expect(unknown.skip).toBe(true);
  });

  it("asks which client when a new address matches more than one, and confirms a single client", async () => {
    let calls = 0;
    const asked = await handleInboundEmail(
      { ...message, from: "Bob <bob@acme.example>", text: "Hello" },
      {
        lookup: async () => ({ organizationId: null, organizations: [], authenticated: true }),
        openProspect: async () => ({
          id: null,
          name: "",
          kind: "client",
          pending: true,
          organizations: [
            { id: "east", name: "Acme East" },
            { id: "west", name: "Acme West" },
          ],
        }),
        thread: async () => fresh(),
        ownAddress: "magic@abra-ca-dabra.app",
        answer: async () => {
          calls += 1;
          return { reply: "no", kind: "other" as const, goal: null, due: null, file: false };
        },
      },
    );
    expect(asked.reply).toBe("Which client is this about?");
    expect(asked.organizationId).toBeNull();
    expect(calls).toBe(0);

    const confirm = await handleInboundEmail(
      { ...message, from: "Bob <bob@acme.example>", text: "Hello" },
      {
        lookup: async () => ({ organizationId: null, organizations: [], authenticated: true }),
        openProspect: async () => ({ id: null, name: "Acme", kind: "client", pending: true }),
        thread: async () => fresh(),
        ownAddress: "magic@abra-ca-dabra.app",
        answer: async () => {
          calls += 1;
          return { reply: "no", kind: "other" as const, goal: null, due: null, file: false };
        },
      },
    );
    expect(confirm.reply).toBe("Is this Acme? Reply yes to confirm this address.");
    expect(calls).toBe(0);

    const client = await handleInboundEmail(
      { ...message, from: "Bob <bob@acme.example>", text: "Yes" },
      {
        lookup: async () => ({ organizationId: null, organizations: [], authenticated: true }),
        openProspect: async () => ({ id: "org-acme", name: "Acme", kind: "client", pending: false }),
        thread: async () => fresh(),
        ownAddress: "magic@abra-ca-dabra.app",
        answer: async (_id, _orgs, prospect) => {
          expect(prospect).toBe(false);
          return { reply: "What is this about?", kind: "other" as const, goal: null, due: null, file: false };
        },
      },
    );
    expect(client.prospect).toBe(false);
    expect(client.organizationId).toBe("org-acme");
  });

  it("appends a finished readiness link once and skips a queued scan", async () => {
    const token = "abc123token";
    const url = `https://check.abra-ca-dabra.app/scan/${token}`;
    const complete = await handleInboundEmail(
      { ...message, from: "Ada <ada@northwind.example>", text: "The site is up." },
      {
        lookup: async () => ({
          organizationId: "lead-1",
          organizations: [{ id: "lead-1", name: "Ada", kind: "lead" }],
          authenticated: true,
        }),
        thread: async () => ({
          replies: 0,
          questionCount: 0,
          text: "",
          readiness: { status: "complete", publicToken: token },
        }),
        ownAddress: "magic@abra-ca-dabra.app",
        answer: async () => ({
          reply: "Thanks for the site.",
          kind: "other" as const,
          goal: null,
          due: null,
          file: false,
        }),
      },
    );
    expect(complete.reply).toContain(url);
    expect(complete.reply.split(url)).toHaveLength(2);

    const queued = await handleInboundEmail(
      { ...message, from: "Ada <ada@northwind.example>", text: "The site is up." },
      {
        lookup: async () => ({
          organizationId: "lead-1",
          organizations: [{ id: "lead-1", name: "Ada", kind: "lead" }],
          authenticated: true,
        }),
        thread: async () => ({
          replies: 0,
          questionCount: 0,
          text: "",
          readiness: { status: "queued", publicToken: token },
        }),
        ownAddress: "magic@abra-ca-dabra.app",
        answer: async () => ({ reply: "Thanks for the site.", kind: "other" as const, goal: null, due: null, file: false }),
      },
    );
    expect(queued.reply).toBe("Thanks for the site.");
    expect(queued.reply).not.toContain("https://check.abra-ca-dabra.app");

    const once = await handleInboundEmail(
      { ...message, from: "Ada <ada@northwind.example>", text: "The site is up." },
      {
        lookup: async () => ({
          organizationId: "lead-1",
          organizations: [{ id: "lead-1", name: "Ada", kind: "lead" }],
          authenticated: true,
        }),
        thread: async () => ({
          replies: 0,
          questionCount: 0,
          text: "",
          readiness: { status: "complete", publicToken: token },
        }),
        ownAddress: "magic@abra-ca-dabra.app",
        answer: async () => ({
          reply: `The report is ${url}`,
          kind: "other" as const,
          goal: null,
          due: null,
          file: false,
        }),
      },
    );
    expect(once.reply.split(url)).toHaveLength(2);
  });
});
