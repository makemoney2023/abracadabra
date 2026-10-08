import PostalMime from "postal-mime";
import { normalizeChannelPlan, type ChannelPlan } from "./channel-plan";

export type EmailAttachment = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type InboundEmail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  messageId: string;
  threadId: string;
  references: string;
  authenticationResults: string;
  autoSubmitted: string;
  precedence: string;
  bytes: number;
  attachments: EmailAttachment[];
};

export type ThreadState = { replies: number; questionCount: number; text: string };

export type ClassifiedNote = {
  kind: "feedback" | "new_work" | "status" | "other";
  state: "clarifying" | "proposed";
  question: string | null;
  goal: string | null;
  due: string | null;
};

export type ClientKind = "status" | "new_work" | "feedback" | "other" | "handoff";

export type ClientTurn = {
  reply: string;
  kind: ClientKind;
  goal: string | null;
  due: string | null;
  /** True when the worker should store this as client work. A handoff files nothing. */
  file: boolean;
  /** Concrete next steps. The worker writes each one as a task on the client board. */
  actions: ChannelPlan["actions"];
  /** One sentence to add to the client brief. Null leaves the brief alone. */
  brief: string | null;
  /** Standing limits to keep on the brief, such as no video. */
  rules: string | null;
};

/** A mailbox or Slack turn. Actions, the brief sentence, and rules can be left off. */
export type FiledTurn = Omit<ClientTurn, "actions" | "brief" | "rules"> & {
  actions?: Array<{ title: string; assignee?: string | null; due?: string | null; skill?: string | null }>;
  brief?: string | null;
  rules?: string | null;
};

export type ClientDesk = {
  name: string;
  brief: string;
  status: string;
  requests: { body: string; state: string; goal: string | null; due: string | null }[];
  messages: { kind: string; body: string }[];
  forbiddenNames?: string[];
};

export type ChannelReply = {
  reply: string;
  organizationId: string | null;
  noteOnly: boolean;
  skip: boolean;
  asked: boolean;
  classified: ClassifiedNote;
  file: boolean;
  plan: ChannelPlan;
};

export const FIXED_UNKNOWN = "Please write from the address registered with us, or sign in to your space.";
export const RECEIPT = "Got it. I have your note.";
export const HANDED_OFF = "A person on the team will pick this up.";
const RETRY = "Try again in a minute.";
const TOO_BIG = "That file is over 25 MB. Send a shorter note.";
export const THREAD_REPLY_LIMIT = 10;
export const FOLLOW_UP = "Got it. I have your note. A person on the team will follow up.";

const NOTHING: ClassifiedNote = { kind: "other", state: "clarifying", question: null, goal: null, due: null };
const NO_PLAN: ChannelPlan = { actions: [], brief: null, rules: null };

function quiet(): ChannelReply {
  return { reply: "", organizationId: null, noteOnly: false, skip: true, asked: false, classified: NOTHING, file: false, plan: NO_PLAN };
}

function held(reply: string, organizationId: string | null, noteOnly = false): ChannelReply {
  return { reply, organizationId, noteOnly, skip: false, asked: false, classified: NOTHING, file: false, plan: NO_PLAN };
}

function domainOf(address: string): string {
  return address.split("@")[1]?.trim().toLowerCase() ?? "";
}

function aligned(senderDomain: string, resultDomain: string): boolean {
  if (!senderDomain || !resultDomain) return false;
  return senderDomain === resultDomain || senderDomain.endsWith(`.${resultDomain}`);
}

/** DMARC pass for the From domain, or a DKIM pass signed by that domain or its parent. */
export function emailAuthenticated(header: string, sender: string): boolean {
  const senderDomain = domainOf(addressOf(sender));
  for (const clause of header.split(";").slice(1)) {
    const method = clause.match(/\b(dkim|dmarc)=(\w+)/i);
    if (!method || method[2]?.toLowerCase() !== "pass") continue;
    const key = method[1]?.toLowerCase() === "dmarc" ? "header\\.from" : "header\\.d";
    const domain = clause.match(new RegExp(`\\b${key}=([^\\s;]+)`, "i"))?.[1]?.toLowerCase() ?? "";
    if (aligned(senderDomain, domain)) return true;
  }
  return false;
}

/** One sender, several clients: use the thread's choice, else a single match in the text, else ask. */
export function chooseOrganization(
  organizations: { id: string; name: string }[],
  text: string,
  remembered: string | null,
): { id: string } | { ask: true } | { none: true } {
  if (organizations.length === 0) return { none: true };
  if (remembered && organizations.some((org) => org.id === remembered)) return { id: remembered };
  if (organizations.length === 1) return { id: organizations[0]!.id };
  const folded = text.toLowerCase();
  const named = organizations.filter((org) => org.name && folded.includes(org.name.toLowerCase()));
  if (named.length === 1) return { id: named[0]!.id };
  return { ask: true };
}

export function addressOf(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match?.[1] ?? from).trim().toLowerCase();
}

function kindOf(text: string): ClassifiedNote["kind"] {
  const body = text.toLowerCase();
  if (/\b(change|instead|wrong)\b/.test(body)) return "feedback";
  if (/\b(add|also|new)\b/.test(body)) return "new_work";
  if (/\b(status|where are we|update on)\b/.test(body)) return "status";
  return "other";
}

export function classifyClientNote(text: string, questionCount: number): ClassifiedNote {
  const kind = kindOf(text);
  if (kind !== "new_work") return { kind, state: "clarifying", question: null, goal: null, due: null };
  const goal = /\b(so that|because)\b/i.test(text) ? text : null;
  const dueMatch = text.match(/\b(?:by|due)\s+([A-Za-z0-9 ,/-]+)/i);
  const due = dueMatch?.[1]?.trim() ?? null;
  if (questionCount >= 3) return { kind, state: "proposed", question: null, goal, due };
  if (!goal) return { kind, state: "clarifying", question: "What should this achieve?", goal: null, due };
  if (!due) return { kind, state: "clarifying", question: "When do you need it?", goal, due: null };
  return { kind, state: "proposed", question: null, goal, due };
}

export async function handleInboundEmail(
  message: InboundEmail,
  deps: {
    lookup: (email: string) => Promise<{ organizationId: string | null; organizations?: { id: string; name: string }[]; authenticated: boolean } | "down">;
    thread: (organizationId: string, threadId: string) => Promise<ThreadState>;
    remembered?: (threadId: string) => Promise<string | null>;
    ownAddress: string;
    answer?: (organizationId: string, organizations: { id: string; name: string }[]) => Promise<FiledTurn>;
  },
): Promise<ChannelReply> {
  const sender = addressOf(message.from);
  if (message.autoSubmitted && message.autoSubmitted.toLowerCase() !== "no") return quiet();
  if (message.precedence === "bulk" || message.precedence === "list" || sender === deps.ownAddress.toLowerCase()) {
    return quiet();
  }
  if (message.bytes > 25 * 1024 * 1024) return held(TOO_BIG, null);
  const found = await deps.lookup(sender);
  if (found === "down") return held(RETRY, null);
  const listed = found.organizations ?? (found.organizationId ? [{ id: found.organizationId, name: "" }] : []);
  if (listed.length === 0) return held(FIXED_UNKNOWN, null);
  if (!found.authenticated) return held(FIXED_UNKNOWN, listed[0]!.id, true);
  const organizations = listed;
  const threadKey = message.threadId || message.messageId || sender;
  const remembered = deps.remembered ? await deps.remembered(threadKey) : null;
  const choice = chooseOrganization(organizations, `${message.subject}\n${message.text}`, remembered);
  if ("none" in choice) return held(FIXED_UNKNOWN, null);
  if ("ask" in choice) {
    return {
      reply: "Which client is this about?",
      organizationId: null,
      noteOnly: false,
      skip: false,
      asked: true,
      classified: NOTHING,
      file: false,
      plan: NO_PLAN,
    };
  }
  const thread = await deps.thread(choice.id, threadKey);
  const incoming = [message.subject, message.text].filter(Boolean).join("\n");
  if (thread.replies >= THREAD_REPLY_LIMIT) {
    const limited = replyFor(thread, incoming);
    return { ...limited, organizationId: choice.id, noteOnly: false, skip: false, file: false, plan: NO_PLAN };
  }
  if (deps.answer) {
    try {
      const turn = await deps.answer(choice.id, organizations);
      return {
        reply: turn.reply,
        organizationId: choice.id,
        noteOnly: false,
        skip: false,
        asked: turn.kind === "new_work" && !turn.goal,
        classified: noteFromTurn(turn),
        file: turn.file,
        plan: turn.kind === "handoff" ? NO_PLAN : normalizeChannelPlan(turn),
      };
    } catch {
      return { ...held(FOLLOW_UP, choice.id), classified: NOTHING };
    }
  }
  const answer = replyFor(thread, incoming);
  return {
    ...answer,
    organizationId: choice.id,
    noteOnly: false,
    skip: false,
    file: answer.classified.kind === "new_work",
    plan: NO_PLAN,
  };
}

function noteFromTurn(turn: FiledTurn): ClassifiedNote {
  if (turn.kind !== "new_work" || !turn.file) return NOTHING;
  return {
    kind: "new_work",
    state: turn.goal && turn.due ? "proposed" : "clarifying",
    question: turn.goal ? null : turn.reply,
    goal: turn.goal,
    due: turn.due,
  };
}

const PRICE = /\$\s?\d|\b\d[\d,]*\s*(?:dollars|usd)\b/i;
const PROMISED_DATE = /\b(?:ship|deliver|delivered|launch|ready)\b[^.?\n]{0,40}\b(?:by|on)\b/i;

/** Workers AI returns the turn on `response`, as a JSON string or as the parsed object. */
export function clientTurnFromModel(result: unknown): Omit<ClientTurn, "file"> {
  if (typeof result === "string") return parseClientTurn(result);
  if (!result || typeof result !== "object" || !("response" in result)) throw new Error("no turn");
  const response = (result as { response?: unknown }).response;
  if (typeof response === "string") return parseClientTurn(response);
  if (response && typeof response === "object") return parseClientTurn(JSON.stringify(response));
  throw new Error("no turn");
}

/** Pulls the JSON turn out of a model reply. Extra prose around the object is ignored. */
export function parseClientTurn(text: string): Omit<ClientTurn, "file"> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no turn");
  const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  const kind = raw.kind;
  if (kind !== "status" && kind !== "new_work" && kind !== "feedback" && kind !== "other" && kind !== "handoff") {
    throw new Error("bad kind");
  }
  if (typeof raw.reply !== "string" || !raw.reply.trim()) throw new Error("no reply");
  const plan = normalizeChannelPlan({ actions: raw.actions, brief: raw.brief, rules: raw.rules });
  return {
    reply: raw.reply.trim(),
    kind,
    goal: typeof raw.goal === "string" && raw.goal.trim() ? raw.goal.trim() : null,
    due: typeof raw.due === "string" && raw.due.trim() ? raw.due.trim() : null,
    actions: plan.actions,
    brief: plan.brief,
    rules: plan.rules,
  };
}

/** One client email. A reply that prices, promises a date, or names another client is handed to a person. */
export async function replyToClient(input: {
  desk: ClientDesk;
  incoming: string;
  model: (
    desk: ClientDesk,
    incoming: string,
  ) => Promise<
    Omit<ClientTurn, "file" | "actions" | "brief" | "rules"> & {
      actions?: ClientTurn["actions"];
      brief?: string | null;
      rules?: string | null;
    }
  >;
}): Promise<ClientTurn> {
  const turn = await input.model(input.desk, input.incoming);
  const forbidden = (input.desk.forbiddenNames ?? []).filter(Boolean);
  const leaked = forbidden.some((name) => input.desk && turn.reply.toLowerCase().includes(name.toLowerCase()));
  if (PRICE.test(turn.reply) || PROMISED_DATE.test(turn.reply) || leaked) {
    return { reply: HANDED_OFF, kind: "handoff", goal: null, due: null, file: false, actions: [], brief: null, rules: null };
  }
  const kind = turn.kind;
  const file = kind === "new_work" || kind === "feedback";
  const plan = normalizeChannelPlan(turn);
  return {
    reply: turn.reply,
    kind,
    goal: turn.goal,
    due: turn.due,
    file,
    actions: plan.actions,
    brief: plan.brief,
    rules: plan.rules,
  };
}

/** The receipt for a client message, read against the thread so far. Past the limit the message is kept with no reply. */
export function replyFor(thread: ThreadState, incoming: string): { reply: string; asked: boolean; classified: ClassifiedNote } {
  const classified = classifyClientNote([thread.text, incoming].filter(Boolean).join("\n"), thread.questionCount);
  if (thread.replies > THREAD_REPLY_LIMIT) return { reply: "", asked: false, classified };
  if (thread.replies === THREAD_REPLY_LIMIT) return { reply: HANDED_OFF, asked: false, classified };
  const reply = classified.question ? `${RECEIPT} ${classified.question}` : RECEIPT;
  return { reply, asked: Boolean(classified.question), classified };
}

/** Header lines with continuation lines joined. Order is kept, so the first entry is the topmost header. */
function headerLines(raw: string): { name: string; value: string }[] {
  const block = raw.split(/\r?\n\r?\n/)[0] ?? "";
  const lines: { name: string; value: string }[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && lines.length > 0) {
      const last = lines[lines.length - 1]!;
      last.value = `${last.value} ${line.trim()}`;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    lines.push({ name: line.slice(0, colon).trim().toLowerCase(), value: line.slice(colon + 1).trim() });
  }
  return lines;
}

function firstMessageId(value: string): string {
  return value.match(/<[^>]+>/)?.[0] ?? "";
}

export function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function attachmentBytes(content: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof content === "string") return new TextEncoder().encode(content);
  if (content instanceof Uint8Array) return content;
  return new Uint8Array(content);
}

/** Parses a raw message. Only the topmost Authentication-Results counts; a sender can add their own below it. */
export async function parseInboundEmail(raw: string): Promise<InboundEmail> {
  const headers = headerLines(raw);
  const field = (name: string) => headers.find((header) => header.name === name)?.value ?? "";
  const parsed = await PostalMime.parse(raw);
  const messageId = firstMessageId(field("message-id")) || field("message-id");
  const references = field("references");
  const threadId = firstMessageId(references) || firstMessageId(field("in-reply-to")) || messageId;
  return {
    from: field("from"),
    to: field("to"),
    subject: field("subject").replace(/[\r\n]+/g, " "),
    text: parsed.text ?? "",
    messageId,
    threadId,
    references,
    authenticationResults: field("authentication-results"),
    autoSubmitted: field("auto-submitted"),
    precedence: field("precedence").toLowerCase(),
    bytes: new TextEncoder().encode(raw).byteLength,
    attachments: (parsed.attachments ?? [])
      .filter((part) => !part.related && part.disposition !== "inline")
      .map((part) => ({
        filename: part.filename ?? "",
        mimeType: part.mimeType || "application/octet-stream",
        bytes: attachmentBytes(part.content),
      }))
      .filter((part) => part.bytes.byteLength > 0),
  };
}

/** A plain-text reply in the sender's thread. Cloudflare refuses a reply with over 100 references. */
export function replyMime(input: {
  from: string;
  to: string;
  subject: string;
  text: string;
  messageId: string;
  references: string;
  domain: string;
  now: number;
}): string {
  const ids = [...input.references.matchAll(/<[^>]+>/g)].map((match) => match[0]);
  if (input.messageId && !ids.includes(input.messageId)) ids.push(input.messageId);
  const references = ids.slice(-20).join(" ");
  const subject = input.subject.replace(/[\r\n]+/g, " ").trim();
  const head = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${/^re:/i.test(subject) ? subject : `Re: ${subject}`}`,
    `Date: ${new Date(input.now).toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${input.domain}>`,
    input.messageId ? `In-Reply-To: ${input.messageId}` : "",
    references ? `References: ${references}` : "",
    "Auto-Submitted: auto-replied",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
  ].filter(Boolean);
  return `${head.join("\r\n")}\r\n\r\n${input.text}`;
}
