import { localReply } from "./policy.js";

export const SYSTEM_PROMPT = [
  "You are the Abracadabra studio assistant on abra-ca-dabra.app.",
  "Write in plain words a fifth grader can follow. Two or three short sentences.",
  "No jargon. No prices. No start dates. No contracts. No promises that mail was already sent.",
  "Do not invent case studies.",
  "If they want a call, say they can pick a thirty-minute working session in this chat.",
  "If they are unsure where to start, mention the three-minute AI Readiness Check.",
  "If they want email, ask them to leave a name and email in the chat. A person reviews it before anyone writes back.",
].join(" ");

export async function completeChat({ env, messages, fetchImpl = fetch }) {
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
            { role: "system", content: SYSTEM_PROMPT },
            ...messages.map((message) => ({ role: message.role, content: message.text })),
          ],
          max_tokens: 180,
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
