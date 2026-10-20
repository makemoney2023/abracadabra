import { localReply } from "./policy.js";
import { pagePrompt } from "./page-context.js";
import { SITE_KNOWLEDGE } from "./site-knowledge.js";

export const SYSTEM_PROMPT = [
  "You are the Abracadabra studio assistant on abra-ca-dabra.app. Speak as the studio (we, our work) and talk to the visitor as you.",
  "Write in plain words a fifth grader can follow. Two to four short sentences. End every sentence with a period, also when it ends with a link.",
  "Use only the SITE FACTS below. They are true and public. Never say we have no portfolio, no examples, or no past work.",
  "Asked what work we have done: name two or three real projects from WORK that fit the question, one short clause each, then point to the page.",
  "Asked what we build: say we build custom software and AI tools around how a business already works, and name two or three SERVICES.",
  "When the visitor describes a need, name the one service that fits and say what it does for them.",
  "Asked about cost: we price each project to the job and quote it after we understand the work. Never give or guess a number, and never say it is free.",
  "Asked why Cloudflare or what the benefit is: use WHY CLOUDFLARE in plain business words, two or three reasons that matter to the visitor. No made-up numbers.",
  "Only name or link pages listed in SITE FACTS, each with the page shown on its own line; there is no process page, pricing page, or Cloudflare page. If no page fits, give no link. If something is not in SITE FACTS, say you are not sure and point to the page that covers it. Do not invent clients, numbers, results, or features.",
  "No jargon. No prices. No start dates. No contracts. No promises that mail was already sent.",
  "End with one next step when it fits: they can book a thirty-minute working session right here in this chat, or take the Readiness Check if they are unsure where to start.",
  "If they want email, ask them to leave a name and email in the chat. A person reviews it before anyone writes back.",
].join(" ");

export const TEXT_SUFFIX = "In typed chat, give a page as a full link, like https://abra-ca-dabra.app/portfolio/pirx/. Write sentences, not bullet lists.";
export const VOICE_SUFFIX = "This answer is read aloud. Use two or three short spoken sentences, under 60 words. Say a page by its name, like the pirx.ca case study or the Services page. Never say a link, a slash, or a web address. No lists, dashes, or symbols.";

export const MAX_TOKENS = 260;

export function systemPrompt({ voice = false, page } = {}) {
  return `${SYSTEM_PROMPT} ${voice ? VOICE_SUFFIX : TEXT_SUFFIX}\n\nSITE FACTS:\n${SITE_KNOWLEDGE}${pagePrompt(page?.path, page?.title)}`;
}

export const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const CHAT_TIMEOUT_MS = 15000;

/** Typed chat uses AI_MODEL; voice uses AI_VOICE_MODEL, then AI_MODEL. Both default to DEFAULT_MODEL. */
export function chatModel(env, voice = false) {
  const pick = voice ? env?.AI_VOICE_MODEL || env?.AI_MODEL : env?.AI_MODEL;
  return String(pick || DEFAULT_MODEL).trim();
}

function gatewayRequest(env, messages, voice, model, page) {
  const token = String(env.AI_GATEWAY_TOKEN || env.CLOUDFLARE_API_TOKEN || "").trim();
  const account = String(env.CF_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const gateway = String(env.AI_GATEWAY_ID || "abracadabra-chat").trim();
  if (!token || !account) return null;
  return {
    url: `https://gateway.ai.cloudflare.com/v1/${account}/${gateway}/workers-ai/${model || chatModel(env, voice)}`,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "cf-aig-skip-cache": "true",
      "cf-aig-collect-log": "false",
      "cf-aig-collect-log-payload": "false",
    },
    body: {
      messages: [
        { role: "system", content: systemPrompt({ voice, page }) },
        ...messages.map((message) => ({ role: message.role, content: message.text })),
      ],
      max_tokens: MAX_TOKENS,
    },
  };
}

function deltaOf(data) {
  if (typeof data?.response === "string" && data.response) return data.response;
  const content = data?.choices?.[0]?.delta?.content;
  return typeof content === "string" ? content : "";
}

/**
 * Streams the reply as text deltas. Throws ChatUnavailable on no config, HTTP error, or timeout
 * (CHAT_TIMEOUT_MS for the whole reply), so callers can show a retry message instead of hanging.
 * A gateway that answers with plain JSON (no stream) yields the whole text once.
 */
export async function* streamChat({ env, messages, fetchImpl = fetch, voice = false, signal, timeoutMs = CHAT_TIMEOUT_MS, model, firstTokenMs, page }) {
  const request = gatewayRequest(env, messages, voice, model, page);
  if (!request) throw new ChatUnavailable("unconfigured");
  const clock = new AbortController();
  const timer = setTimeout(() => clock.abort(new DOMException("The reply took too long.", "TimeoutError")), timeoutMs);
  const timeout = clock.signal;
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  // No first word by firstTokenMs counts as a timeout, so a fallback still has time to answer.
  const firstTimer = firstTokenMs ? setTimeout(() => clock.abort(new DOMException("No first word.", "TimeoutError")), firstTokenMs) : null;
  // Hold the first few characters until they read like words: a garbled stream ("!!!!!!") is
  // refused before anything reaches the visitor.
  let held = "";
  let checked = false;
  try {
    for await (const delta of readReply(request, combined, timeout, signal, fetchImpl)) {
      clearTimeout(firstTimer);
      if (checked) {
        if (/(\S)\1{7,}/.test(delta)) throw new ChatUnavailable("garbled");
        yield delta;
        continue;
      }
      held += delta;
      if (garbled(held)) throw new ChatUnavailable("garbled");
      if (held.length >= 24) {
        checked = true;
        yield held;
      }
    }
    if (!checked && held) {
      if (garbled(held, true)) throw new ChatUnavailable("garbled");
      yield held;
    }
  } finally {
    clearTimeout(timer);
    clearTimeout(firstTimer);
  }
}

export function garbled(text, final = false) {
  const value = String(text || "");
  if (/(\S)\1{7,}/.test(value)) return true;
  if (!final && value.length < 24) return false;
  const letters = (value.match(/[a-z]/gi) || []).length;
  return letters / Math.max(1, value.replace(/\s/g, "").length) < 0.5;
}

export const FALLBACK_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const FIRST_TOKEN_MS = 6000;

/**
 * The reply stream the chat uses: the chosen model first; if it fails before saying anything
 * (error, garbled text, no first word in FIRST_TOKEN_MS), one try on AI_FALLBACK_MODEL
 * (default 8B fast, "none" turns it off) inside the same CHAT_TIMEOUT_MS budget.
 */
export async function* replyStream({ env, messages, fetchImpl = fetch, voice = false, signal, timeoutMs = CHAT_TIMEOUT_MS, now = () => Date.now(), page }) {
  const started = now();
  let said = false;
  try {
    for await (const delta of streamChat({ env, messages, fetchImpl, voice, signal, timeoutMs, firstTokenMs: FIRST_TOKEN_MS, page })) {
      said = true;
      yield delta;
    }
    return;
  } catch (error) {
    const reason = error instanceof ChatUnavailable ? error.reason : "error";
    if (said || reason === "unconfigured" || reason === "aborted" || signal?.aborted) throw error;
    const fallback = String(env?.AI_FALLBACK_MODEL || FALLBACK_MODEL).trim();
    const left = timeoutMs - (now() - started);
    if (!fallback || fallback === "none" || fallback === chatModel(env, voice) || left < 2000) throw error;
    console.error(`chat model ${reason}; using ${fallback}`);
    yield* streamChat({ env, messages, fetchImpl, voice, signal, timeoutMs: left, model: fallback, page });
  }
}

async function* readReply(request, combined, timeout, signal, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ ...request.body, stream: true }),
      signal: combined,
    });
  } catch (error) {
    throw new ChatUnavailable(timeout.aborted ? "timeout" : signal?.aborted ? "aborted" : "network", error);
  }
  if (!response.ok) throw new ChatUnavailable(`status_${response.status}`);
  const type = response.headers.get("content-type") || "";
  if (!type.includes("event-stream") || !response.body) {
    const json = await response.json().catch(() => null);
    const text = String(json?.result?.response || json?.response || json?.choices?.[0]?.message?.content || "").trim();
    if (!text) throw new ChatUnavailable("empty");
    yield text;
    return;
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let any = false;
  try {
    while (true) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (error) {
        throw new ChatUnavailable(timeout.aborted ? "timeout" : signal?.aborted ? "aborted" : "network", error);
      }
      if (chunk.done) break;
      buffer += chunk.value;
      let at;
      while ((at = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, at).trim();
        buffer = buffer.slice(at + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;
        let data;
        try {
          data = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = deltaOf(data);
        if (delta) {
          any = true;
          yield delta;
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  if (!any) throw new ChatUnavailable("empty");
}

export class ChatUnavailable extends Error {
  constructor(reason, cause) {
    super(reason);
    this.reason = reason;
    this.cause = cause;
  }
}

/** Whole reply as one string. Falls back to the studio script when the model is not reachable. */
export async function completeChat({ env, messages, fetchImpl = fetch, voice = false, page }) {
  const last = [...messages].reverse().find((message) => message.role === "user")?.text || "";
  try {
    let text = "";
    for await (const delta of replyStream({ env, messages, fetchImpl, voice, page })) text += delta;
    return text.trim() || localReply(last);
  } catch {
    return localReply(last);
  }
}
