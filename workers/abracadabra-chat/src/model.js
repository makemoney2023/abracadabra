import { localReply } from "./policy.js";
import { SITE_KNOWLEDGE } from "./site-knowledge.js";

export const SYSTEM_PROMPT = [
  "You are the Abracadabra studio assistant on abra-ca-dabra.app. Speak as the studio: we, our work.",
  "Write in plain words a fifth grader can follow. Two to four short sentences.",
  "Use only the SITE FACTS below. They are true and public. Never say we have no portfolio, no examples, or no past work.",
  "Asked what work we have done: name two or three real projects from WORK that fit the question, one short clause each, then point to the page.",
  "Asked what we build: say we build custom software and AI tools around how a business already works, and name two or three SERVICES.",
  "When the visitor describes a need, name the one service that fits and say what it does for them.",
  "Asked about cost: we price each project to the job and quote it after we understand the work. Never give or guess a number, and never say it is free.",
  "Asked why Cloudflare or what the benefit is: use WHY CLOUDFLARE in plain business words, two or three reasons that matter to the visitor. No made-up numbers.",
  "Only mention pages listed in SITE FACTS. If something is not in SITE FACTS, say you are not sure and point to the page that covers it. Do not invent clients, numbers, results, or features.",
  "No jargon. No prices. No start dates. No contracts. No promises that mail was already sent.",
  "End with one next step when it fits: they can book a thirty-minute working session right here in this chat, or take the Readiness Check if they are unsure where to start.",
  "If they want email, ask them to leave a name and email in the chat. A person reviews it before anyone writes back.",
].join(" ");

export const TEXT_SUFFIX = "In typed chat, give a page as a full link, like https://abra-ca-dabra.app/portfolio/pirx/. Write sentences, not bullet lists.";
export const VOICE_SUFFIX = "This answer is read aloud. Use two or three short spoken sentences, under 60 words. Say a page by its name, like the pirx.ca case study or the Services page. Never say a link, a slash, or a web address. No lists, dashes, or symbols.";

export const MAX_TOKENS = 260;

export function systemPrompt({ voice = false } = {}) {
  return `${SYSTEM_PROMPT} ${voice ? VOICE_SUFFIX : TEXT_SUFFIX}\n\nSITE FACTS:\n${SITE_KNOWLEDGE}`;
}

export async function completeChat({ env, messages, fetchImpl = fetch, voice = false }) {
  const last = [...messages].reverse().find((message) => message.role === "user")?.text || "";
  const token = String(env.AI_GATEWAY_TOKEN || env.CLOUDFLARE_API_TOKEN || "").trim();
  const account = String(env.CF_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const gateway = String(env.AI_GATEWAY_ID || "abracadabra-chat").trim();
  const model = String(env.AI_MODEL || "@cf/meta/llama-3.1-8b-instruct-fast").trim();
  if (!token || !account) return localReply(last);
  try {
    const response = await fetchImpl(
      `https://gateway.ai.cloudflare.com/v1/${account}/${gateway}/workers-ai/${model}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "cf-aig-skip-cache": "true",
          "cf-aig-collect-log": "false",
          "cf-aig-collect-log-payload": "false",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt({ voice }) },
            ...messages.map((message) => ({ role: message.role, content: message.text })),
          ],
          max_tokens: MAX_TOKENS,
        }),
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!response.ok) return localReply(last);
    const json = await response.json();
    const text = json?.result?.response || json?.choices?.[0]?.message?.content || "";
    return String(text).trim() || localReply(last);
  } catch {
    return localReply(last);
  }
}
