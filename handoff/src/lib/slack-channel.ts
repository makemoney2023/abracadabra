import { createHmac, timingSafeEqual } from "node:crypto";
import { replyFor, type ClientTurn, type ThreadState } from "./client-channel";

export type SlackEnv = {
  HQ_ORIGIN?: string;
  CLIENT_CHANNEL_SECRET?: string;
  SLACK_SIGNING_SECRET?: string;
  SLACK_BOT_TOKEN?: string;
  SLACK_BOT_USER_ID?: string;
  SLACK_STAFF_USER_IDS?: string;
};

type SlackMessage = {
  type?: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  channel?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
};

export async function verifySlackSignature(
  secret: string,
  timestamp: string,
  raw: string,
  signature: string,
  now: number,
): Promise<boolean> {
  const sent = Number(timestamp);
  if (!secret || !signature || !Number.isFinite(sent) || Math.abs(now / 1000 - sent) > 300) return false;
  const expected = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${raw}`).digest("hex")}`;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A plain client post. Edits, joins, and bot posts carry a subtype or bot_id. Mentions also arrive as a message. */
function clientMessage(event: SlackMessage | undefined, env: SlackEnv): event is SlackMessage & { channel: string; ts: string } {
  if (!event || event.type !== "message" || event.subtype || event.bot_id) return false;
  if (!event.channel || !event.ts || !event.user) return false;
  if (env.SLACK_BOT_USER_ID && event.user === env.SLACK_BOT_USER_ID) return false;
  const staff = (env.SLACK_STAFF_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  return !staff.includes(event.user);
}

async function hq(env: SlackEnv, fetchImpl: typeof fetch, body: Record<string, unknown>): Promise<unknown> {
  const origin = env.HQ_ORIGIN?.replace(/\/$/, "");
  if (!origin || !env.CLIENT_CHANNEL_SECRET) return null;
  const response = await fetchImpl(`${origin}/api/client-messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.CLIENT_CHANNEL_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  return (await response.json()) as unknown;
}

async function answer(
  event: SlackMessage & { channel: string; ts: string },
  env: SlackEnv,
  fetchImpl: typeof fetch,
  interpret?: (input: { organizationId: string; text: string; threadId: string }) => Promise<ClientTurn>,
): Promise<void> {
  const linked = (await hq(env, fetchImpl, { action: "slack_org", channelId: event.channel })) as { value?: string | null } | null;
  const organizationId = linked?.value ?? null;
  if (!organizationId) {
    await hq(env, fetchImpl, { action: "unlinked_slack", channelId: event.channel });
    return;
  }
  const threadId = event.thread_ts ?? event.ts;
  const state = (await hq(env, fetchImpl, { action: "thread", organizationId, threadId })) as { value?: ThreadState } | null;
  const thread = state?.value ?? { replies: 0, questionCount: 0, text: "" };
  const incoming = event.text ?? "";
  let reply = replyFor(thread, incoming);
  let actions: ClientTurn["actions"] = [];
  let brief: string | null = null;
  let rules: string | null = null;
  if (interpret && thread.replies < 10) {
    try {
      const turn = await interpret({ organizationId, text: incoming, threadId });
      reply = {
        reply: turn.reply,
        asked: turn.kind === "new_work" && !turn.goal,
        classified: {
          kind: turn.kind === "new_work" ? "new_work" : turn.kind === "feedback" ? "feedback" : turn.kind === "status" ? "status" : "other",
          state: turn.kind === "new_work" && turn.goal && turn.due ? "proposed" : "clarifying",
          question: null,
          goal: turn.goal,
          due: turn.due,
        },
      };
      if (turn.kind !== "handoff") {
        actions = turn.actions;
        brief = turn.brief;
        rules = turn.rules;
      }
    } catch {
      reply = replyFor(thread, incoming);
    }
  }
  await hq(env, fetchImpl, {
    action: "record",
    organizationId,
    channel: "slack",
    threadId,
    sender: event.user ?? "",
    body: incoming,
    state: reply.classified.state,
    goal: reply.classified.goal,
    dueText: reply.classified.due,
    asked: reply.asked,
    replyBody: reply.reply,
    actions,
    brief,
    rules,
  });
  if (!reply.reply || !env.SLACK_BOT_TOKEN) return;
  await fetchImpl("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { authorization: `Bearer ${env.SLACK_BOT_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ channel: event.channel, thread_ts: threadId, text: reply.reply }),
  });
}

/** Acknowledges inside Slack's 3-second window. The lookup, record, and reply run after the response through waitUntil. */
export async function handleSlackEvent(
  request: Request,
  env: SlackEnv,
  now: number,
  fetchImpl: typeof fetch = fetch,
  waitUntil: (work: Promise<unknown>) => void = (work) => void work,
  interpret?: (input: { organizationId: string; text: string; threadId: string }) => Promise<ClientTurn>,
): Promise<Response> {
  if (request.headers.get("x-slack-retry-num")) return new Response(null, { status: 200 });
  const raw = await request.text();
  const ok = await verifySlackSignature(
    env.SLACK_SIGNING_SECRET ?? "",
    request.headers.get("x-slack-request-timestamp") ?? "",
    raw,
    request.headers.get("x-slack-signature") ?? "",
    now,
  );
  if (!ok) return new Response("Unauthorized", { status: 401 });
  let body: { type?: string; challenge?: string; event?: SlackMessage };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  if (body.type === "url_verification" && typeof body.challenge === "string") {
    return Response.json({ challenge: body.challenge });
  }
  const event = body.event;
  if (clientMessage(event, env)) {
    waitUntil(answer(event, env, fetchImpl, interpret).catch(() => undefined));
  } else if (event?.type === "message" && !event.subtype && !event.bot_id && event.channel && event.user) {
    const staffEvent = event;
    waitUntil(
      hq(env, fetchImpl, { action: "staff_log", channelId: staffEvent.channel, user: staffEvent.user, text: staffEvent.text ?? "", ts: staffEvent.ts ?? "" }).catch(
        () => undefined,
      ),
    );
  }
  return new Response(null, { status: 200 });
}
