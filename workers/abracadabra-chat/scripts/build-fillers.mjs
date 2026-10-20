// Generates the spoken fillers once with Aura-2 (same speaker as the call) into the marketing site's
// /assets/voice/filler-<n>.mp3. Run: AI_GATEWAY_TOKEN=... CF_ACCOUNT_ID=... npm run fillers
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { FILLERS, TTS_MODEL, TTS_SPEAKER, gatewayConfig } from "../src/voice.js";

const out = fileURLToPath(new URL("../../../scrollcraft/builds/abracadabra-ai/assets/voice/", import.meta.url));
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
