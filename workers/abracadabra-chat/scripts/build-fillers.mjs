// Generates the spoken fillers once with Aura-2 (the fillers' voice, luna) into the marketing site's
// /assets/voice/filler-<n>.mp3, then records what was built in src/filler-audio.js (the call plays only
// built lines) and bumps the widget's FILLER_VERSION so browsers fetch the new files.
// Run: AI_GATEWAY_TOKEN=... CF_ACCOUNT_ID=... npm run fillers   (needs ffmpeg)
// Then: npm test, commit the mp3s + src/filler-audio.js + chat-widget.js, deploy the marketing Worker
// (the files) before or with this Worker.
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { FILLER_AUDIO } from "../src/filler-audio.js";
import { FILLERS, TTS_MODEL, TTS_SPEAKER, gatewayConfig } from "../src/voice.js";

const out = fileURLToPath(new URL("../../../scrollcraft/builds/abracadabra-ai/assets/voice/", import.meta.url));
const manifest = fileURLToPath(new URL("../src/filler-audio.js", import.meta.url));
const widget = fileURLToPath(new URL("../../../scrollcraft/builds/abracadabra-ai/assets/chat-widget.js", import.meta.url));
const config = gatewayConfig(process.env);
if (!config) throw new Error("Set AI_GATEWAY_TOKEN and CF_ACCOUNT_ID");
await mkdir(out, { recursive: true });
for (const [index, text] of FILLERS.entries()) {
  const response = await fetch(`${config.base}/${TTS_MODEL}`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json", "cf-aig-collect-log-payload": "false" },
    body: JSON.stringify({ text, speaker: TTS_SPEAKER, encoding: "mp3" }),
  });
  if (!response.ok) throw new Error(`Aura ${response.status} for filler ${index}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  // Trim Aura's lead-in and tail silence (needs ffmpeg) so the answer can follow sooner.
  const raw = `${out}filler-${index}.raw.mp3`;
  await writeFile(raw, bytes);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af",
    "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.05",
    "-ac", "1", "-ar", "24000", "-b:a", "48k", `${out}filler-${index}.mp3`]);
  await rm(raw);
  console.log(`filler-${index}.mp3  "${text}"`);
}
const version = String((Number.parseInt(FILLER_AUDIO.version, 10) || 0) + 1);
await writeFile(manifest, `// Written by scripts/build-fillers.mjs (npm run fillers). Do not edit by hand.
// Which /assets/voice/filler-<n>.mp3 files hold the current FILLERS text (voice.js). The call only
// plays these, so a new filler line is silent until its audio is built. version is the widget's cache key.
export const FILLER_AUDIO = {
  "version": ${JSON.stringify(version)},
  "speaker": ${JSON.stringify(TTS_SPEAKER)},
  "texts": ${JSON.stringify(FILLERS).replace(/","/g, "\", \"")},
};
`);
const source = await readFile(widget, "utf8");
await writeFile(widget, source.replace(/const FILLER_VERSION = "[^"]*";/, `const FILLER_VERSION = ${JSON.stringify(version)};`));
console.log(`src/filler-audio.js and the widget's FILLER_VERSION are now ${version}.`);
