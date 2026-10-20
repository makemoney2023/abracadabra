// Push-to-talk voice for the studio chat.
// Speech to text: Workers AI Whisper large-v3-turbo. Text to speech: Deepgram Aura-2.
// Both go through the same AI Gateway as the chat model, with cache and logging off.
// Audio is never stored: the clip is read into memory, transcribed, and dropped.

export const STT_MODEL = "@cf/openai/whisper-large-v3-turbo";
export const TTS_MODEL = "@cf/deepgram/aura-2-en";
export const TTS_SPEAKER = "luna";
export const MAX_AUDIO_BYTES = 600 * 1024;
export const MIN_AUDIO_BYTES = 800;
export const MAX_AUDIO_SECONDS = 31;
export const TTS_CHAR_CAP = 400;
export const VOICE_TURNS_PER_SESSION = 15;
export const VOICE_TTS_CHARS_PER_SESSION = 3000;
export const SPEAKS_PER_REPLY = 2;

export const WHISPER_HINT = "Abracadabra studio chat. Abracadabra, abra-ca-dabra.app, AI Readiness Check, Cal.com, working session.";

const AURA_SPEAKERS = new Set([
  "amalthea", "andromeda", "apollo", "arcas", "aries", "asteria", "athena", "atlas", "aurora", "callista",
  "cora", "cordelia", "delia", "draco", "electra", "harmonia", "helena", "hera", "hermes", "hyperion",
  "iris", "janus", "juno", "jupiter", "luna", "mars", "minerva", "neptune", "odysseus", "ophelia",
  "orion", "orpheus", "pandora", "phoebe", "pluto", "saturn", "thalia", "theia", "vesta", "zeus",
]);

const AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/ogg", "audio/mpeg", "audio/wav", "audio/x-wav", "video/webm", "video/mp4"]);

export function voiceEnabled(env) {
  const flag = String(env?.VOICE_ENABLED ?? "").trim().toLowerCase();
  if (flag !== "true" && flag !== "1") return false;
  return Boolean(gatewayConfig(env));
}

export function gatewayConfig(env) {
  const token = String(env?.AI_GATEWAY_TOKEN || env?.CLOUDFLARE_API_TOKEN || "").trim();
  const account = String(env?.CF_ACCOUNT_ID || env?.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const gateway = String(env?.AI_GATEWAY_ID || "abracadabra-chat").trim();
  if (!token || !account) return null;
  return { token, base: `https://gateway.ai.cloudflare.com/v1/${account}/${gateway}/workers-ai` };
}

export function ttsSpeaker(env) {
  const speaker = String(env?.TTS_SPEAKER || "").trim().toLowerCase();
  return AURA_SPEAKERS.has(speaker) ? speaker : TTS_SPEAKER;
}

export function baseAudioType(value) {
  return String(value || "").split(";")[0].trim().toLowerCase();
}

/** Checks the declared type is on the allowlist and the first bytes match a real audio container. */
export function audioKind(contentType, bytes) {
  const type = baseAudioType(contentType);
  if (!AUDIO_TYPES.has(type)) return null;
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length < 12) return null;
  const ascii = (start, end) => String.fromCharCode(...b.slice(start, end));
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm";
  if (ascii(4, 8) === "ftyp") return "mp4";
  if (ascii(0, 4) === "OggS") return "ogg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "wav";
  if (ascii(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "mp3";
  return null;
}

function headers(token, contentType = "application/json") {
  return {
    authorization: `Bearer ${token}`,
    "content-type": contentType,
    "cf-aig-skip-cache": "true",
    "cf-aig-collect-log": "false",
    "cf-aig-collect-log-payload": "false",
  };
}

export function toBase64(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(out);
}

/** Returns { ok, text, seconds } or { ok: false, reason }. */
export async function transcribe({ env, bytes, fetchImpl = fetch }) {
  const config = gatewayConfig(env);
  if (!config) return { ok: false, reason: "unconfigured" };
  const model = String(env.STT_MODEL || STT_MODEL).trim();
  try {
    const response = await fetchImpl(`${config.base}/${model}`, {
      method: "POST",
      headers: headers(config.token),
      body: JSON.stringify({
        audio: toBase64(bytes),
        task: "transcribe",
        language: "en",
        vad_filter: true,
        initial_prompt: WHISPER_HINT,
        condition_on_previous_text: false,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { ok: false, reason: "upstream" };
    const json = await response.json();
    const result = json?.result || json || {};
    const seconds = Number(result?.transcription_info?.duration);
    const text = String(result?.text || "").replace(/\s+/g, " ").trim().slice(0, 2000);
    return { ok: true, text, seconds: Number.isFinite(seconds) ? seconds : null };
  } catch {
    return { ok: false, reason: "upstream" };
  }
}

/** Turns a checked chat reply into text that sounds right out loud, capped at TTS_CHAR_CAP. */
export function speakable(text, cap = TTS_CHAR_CAP) {
  let clean = String(text || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[*_#`>\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= cap) return clean;
  const cut = clean.slice(0, cap);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  clean = stop > cap * 0.4 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, "");
  return clean.trim();
}

/** Returns the gateway Response (audio/mpeg body) or null. */
export async function synthesize({ env, text, fetchImpl = fetch }) {
  const config = gatewayConfig(env);
  if (!config || !text) return null;
  const model = String(env.TTS_MODEL || TTS_MODEL).trim();
  try {
    const response = await fetchImpl(`${config.base}/${model}`, {
      method: "POST",
      headers: headers(config.token),
      body: JSON.stringify({ text, speaker: ttsSpeaker(env), encoding: "mp3" }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok || !response.body) return null;
    const type = response.headers.get("content-type") || "";
    if (!/^audio\//i.test(type)) return null;
    return response;
  } catch {
    return null;
  }
}
