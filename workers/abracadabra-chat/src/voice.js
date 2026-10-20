// Shared voice settings for the realtime chat call (see realtime.js).
// Speech to text: Deepgram Flux over a Workers AI binding WebSocket.
// Text to speech: Deepgram Aura-2 through the AI Gateway, streamed as raw PCM.
// Audio is never stored. Only the words are kept, like a typed chat.

export const STT_MODEL = "@cf/deepgram/flux";
export const TTS_MODEL = "@cf/deepgram/aura-2-en";
export const TTS_SPEAKER = "luna";
export const TTS_SAMPLE_RATE = 24000;
export const MIC_SAMPLE_RATE = 16000;
export const TTS_CHAR_CAP = 400;
export const VOICE_TURNS_PER_SESSION = 15;
export const VOICE_TTS_CHARS_PER_SESSION = 3000;
export const VOICE_CALLS_PER_SESSION = 3;
export const MAX_CALL_MS = 5 * 60 * 1000;
export const CALL_IDLE_MS = 45 * 1000;
export const KEYTERMS = ["Abracadabra", "Readiness Check", "Cal.com"];

const AURA_SPEAKERS = new Set([
  "amalthea", "andromeda", "apollo", "arcas", "aries", "asteria", "athena", "atlas", "aurora", "callista",
  "cora", "cordelia", "delia", "draco", "electra", "harmonia", "helena", "hera", "hermes", "hyperion",
  "iris", "janus", "juno", "jupiter", "luna", "mars", "minerva", "neptune", "odysseus", "ophelia",
  "orion", "orpheus", "pandora", "phoebe", "pluto", "saturn", "thalia", "theia", "vesta", "zeus",
]);

export function gatewayConfig(env) {
  const token = String(env?.AI_GATEWAY_TOKEN || env?.CLOUDFLARE_API_TOKEN || "").trim();
  const account = String(env?.CF_ACCOUNT_ID || env?.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const gateway = String(env?.AI_GATEWAY_ID || "abracadabra-chat").trim();
  if (!token || !account) return null;
  return { token, gateway, base: `https://gateway.ai.cloudflare.com/v1/${account}/${gateway}/workers-ai` };
}

/** Voice needs the switch, the Workers AI binding (for Flux), and the gateway (for chat and Aura). */
export function voiceEnabled(env) {
  const flag = String(env?.VOICE_ENABLED ?? "").trim().toLowerCase();
  if (flag !== "true" && flag !== "1") return false;
  if (!env?.AI || typeof env.AI.run !== "function") return false;
  return Boolean(gatewayConfig(env));
}

export function ttsSpeaker(env) {
  const speaker = String(env?.TTS_SPEAKER || "").trim().toLowerCase();
  return AURA_SPEAKERS.has(speaker) ? speaker : TTS_SPEAKER;
}

/** Turns a checked chat reply into text that sounds right out loud, capped at TTS_CHAR_CAP. */
export function speakable(text, cap = TTS_CHAR_CAP) {
  let clean = String(text || "")
    .replace(/\s*\(?https?:\/\/[^\s)]+\)?/gi, (url) => (/[.,;:!?]$/.test(url) ? url.slice(-1) : ""))
    .replace(/\b((?:check\.)?abra-ca-dabra)\.app\b/gi, (_, name) => `${name.replace(".", " dot ")} dot app`)
    .replace(/\s*\(\/[^\s)]*\)/g, "")
    .replace(/(^|\s)\/[a-z0-9-]+(?:\/[a-z0-9.-]*)*(?=[\s.,;:!?]|$)/gi, "$1")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/(^|\s)[-*•]\s+/g, "$1")
    .replace(/\s*\((?:page|link)\)/gi, "")
    .replace(/\b([A-Z]{2,})\/([A-Z]{2,})\b/g, "$1 and $2")
    .replace(/[*_#`>\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= cap) return clean;
  const cut = clean.slice(0, cap);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  clean = stop > cap * 0.4 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, "");
  return clean.trim();
}

export function sentences(text) {
  return String(text || "").split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
}

/**
 * Starts Aura-2 for one sentence and returns the streaming body (raw 16-bit PCM, 24 kHz, mono),
 * or null. The body is read chunk by chunk and forwarded; nothing is buffered or kept.
 */
export async function synthesizePcm({ env, text, signal, fetchImpl = fetch }) {
  const config = gatewayConfig(env);
  if (!config || !text) return null;
  const model = String(env.TTS_MODEL || TTS_MODEL).trim();
  try {
    const response = await fetchImpl(`${config.base}/${model}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        "cf-aig-skip-cache": "true",
        "cf-aig-collect-log": "false",
        "cf-aig-collect-log-payload": "false",
      },
      body: JSON.stringify({
        text,
        speaker: ttsSpeaker(env),
        encoding: "linear16",
        container: "none",
        sample_rate: TTS_SAMPLE_RATE,
      }),
      signal,
    });
    if (!response.ok || !response.body) return null;
    return response.body;
  } catch {
    return null;
  }
}

/** Opens a Flux streaming transcriber through the Workers AI binding. Returns a server WebSocket or null. */
export async function openFlux(env) {
  try {
    const response = await env.AI.run(
      STT_MODEL,
      {
        encoding: "linear16",
        sample_rate: String(MIC_SAMPLE_RATE),
        eot_threshold: "0.7",
        eot_timeout_ms: "3000",
        keyterm: KEYTERMS,
      },
      { websocket: true },
    );
    const socket = response?.webSocket;
    if (!socket) return null;
    socket.accept();
    return socket;
  } catch {
    return null;
  }
}

/** True when an interim transcript is mostly the assistant's own words (speaker echo), so it should not interrupt. */
export function looksLikeEcho(heard, speaking) {
  const words = (value) => String(value || "").toLowerCase().match(/[a-z0-9']+/g) || [];
  const said = words(heard);
  if (said.length === 0) return true;
  const reply = new Set(words(speaking));
  if (reply.size === 0) return false;
  const overlap = said.filter((word) => reply.has(word)).length;
  return overlap / said.length >= 0.6;
}
