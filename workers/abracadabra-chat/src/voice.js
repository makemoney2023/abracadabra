// Shared voice settings for the realtime chat call (see realtime.js).
// Speech to text: Deepgram Flux over a Workers AI binding WebSocket.
// Text to speech: Deepgram Aura-2 through the AI Gateway, streamed as raw PCM.
// Audio is never stored. Only the words are kept, like a typed chat.

import { SITE_PRODUCTS, SITE_WORK } from "./site-knowledge.js";
import { FILLER_AUDIO } from "./filler-audio.js";

export const STT_MODEL = "@cf/deepgram/flux";
export const TTS_MODEL = "@cf/deepgram/aura-2-en";
export const TTS_SPEAKER = "luna";
export const TTS_SAMPLE_RATE = 24000;
export const MIC_SAMPLE_RATE = 16000;
export const TTS_CHAR_CAP = 400;
export const VOICE_TURNS_PER_SESSION = 25;
// The cost guard: at most 3,000 spoken characters per chat (about $0.09 of Aura-2), whatever the turn cap.
export const VOICE_TTS_CHARS_PER_SESSION = 3000;
export const VOICE_CALLS_PER_SESSION = 3;
export const MAX_CALL_MS = 8 * 60 * 1000;
export const CALL_IDLE_MS = 45 * 1000;
// Short spoken fillers, played by the browser when the real answer is not audible yet. Context-neutral
// (no "Good question"), so they fit any turn. Pre-generated once with Aura-2 luna (npm run fillers) into
// the marketing site's /assets/voice/; never synthesized per call. Keep the order: the index is the file name.
export const FILLERS = [
  "Let me check.", "One sec.", "Let me see.", "Just a moment.", "Okay, one moment.",
  "Let me look.", "Bear with me a second.", "Hmm, let me think.", "Okay, checking.", "Give me a second.",
];
// Only fillers whose built audio says the current words are played (see src/filler-audio.js).
export const FILLER_READY = FILLERS.map((text, index) => (FILLER_AUDIO.texts[index] === text ? index : -1)).filter((index) => index >= 0);
export const FILLER_SPEAKER = FILLER_AUDIO.speaker;
/** The built filler lines for one voice: luna's in /assets/voice/, the other A/B voices' in /assets/voice/<speaker>/. */
export function fillerReady(speaker) {
  if (speaker === FILLER_SPEAKER) return FILLER_READY;
  const texts = FILLER_AUDIO.voices?.[speaker]?.texts || [];
  return FILLERS.map((text, index) => (texts[index] === text ? index : -1)).filter((index) => index >= 0);
}
// A filler plays only when nothing is audible this long after the turn ends (first sentence median ~2.1 s
// on 70B), and never on two turns in a row.
export const FILLER_AFTER_MS = 1600;
export const EAGER_EOT_THRESHOLD = "0.5";
// Flux end-of-turn confidence. Lower ends turns sooner (snappier, more cut-offs); higher waits longer.
// Tune with the VOICE_EOT_THRESHOLD var (0.5 to 0.9) without a code change.
export const EOT_THRESHOLD = "0.6";
export const EOT_TIMEOUT_MS = "3000";
// Barge-in: three new words stop the reply at once; two words stop it if they are still there after 400 ms.
export const BARGE_IN_WORDS = 3;
export const BARGE_IN_SHORT_WORDS = 2;
export const BARGE_IN_HOLD_MS = 400;
// Voice A/B: TTS_SPEAKER_AB="luna,thalia,andromeda" gives each chat one of these, stable for the chat.
export const AB_SPEAKERS = ["luna", "thalia", "andromeda"];
export const FILLER_PATH = "/assets/voice/filler-";
// Words speech-to-text should expect: the studio, the next steps, and every product and case study by its spoken name.
export const KEYTERMS = [...new Set([
  "Abracadabra", "Readiness Check", "Cal.com",
  ...SITE_PRODUCTS.map((item) => item.name),
  ...SITE_WORK.map((item) => item.name.replace(/\s+(?:System|website|products)$/i, "").replace(/\.ca$/i, "").replace(/\/.*$/, "")),
])];

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

/**
 * The Aura-2 voice for one call. With TTS_SPEAKER_AB set (a comma list from AB_SPEAKERS), each chat
 * gets one of them, picked from the session id so every call in a chat sounds the same. Otherwise
 * TTS_SPEAKER (default luna). ab says whether the A/B test chose it, for the log.
 */
export function callSpeaker(env, sessionId = "") {
  const list = String(env?.TTS_SPEAKER_AB || "").split(",").map((name) => name.trim().toLowerCase()).filter((name) => AB_SPEAKERS.includes(name));
  const choices = [...new Set(list)];
  if (choices.length < 2) return { speaker: ttsSpeaker(env), ab: false };
  let hash = 0;
  for (const char of String(sessionId)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { speaker: choices[hash % choices.length], ab: true };
}

/** Flux end-of-turn settings from env: VOICE_EOT_THRESHOLD (0.5 to 0.9, default 0.6); eager stays below it. */
export function fluxThresholds(env) {
  const raw = Number.parseFloat(String(env?.VOICE_EOT_THRESHOLD ?? ""));
  const eot = Number.isFinite(raw) && raw >= 0.5 && raw <= 0.9 ? raw : Number(EOT_THRESHOLD);
  const eager = Math.min(Number(EAGER_EOT_THRESHOLD), Math.round((eot - 0.1) * 100) / 100);
  return { eot_threshold: String(eot), eager_eot_threshold: String(eager) };
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
export async function synthesizePcm({ env, text, signal, fetchImpl = fetch, speaker }) {
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
        speaker: speaker || ttsSpeaker(env),
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
  const thresholds = fluxThresholds(env);
  try {
    const response = await env.AI.run(
      STT_MODEL,
      {
        encoding: "linear16",
        sample_rate: String(MIC_SAMPLE_RATE),
        eot_threshold: thresholds.eot_threshold,
        eot_timeout_ms: EOT_TIMEOUT_MS,
        // EagerEndOfTurn fires earlier on a likely end; the call starts the model then and keeps
        // the result only if the final transcript matches (TurnResumed cancels it).
        eager_eot_threshold: thresholds.eager_eot_threshold,
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
