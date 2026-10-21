/**
 * Registers (or updates) the Zernio webhook that sends post and account events to HQ.
 * Needs ZERNIO_API_KEY and ZERNIO_WEBHOOK_SECRET; the secret must match the one set on worker handoff-hq.
 * Usage: npm run zernio:webhook [-- https://hq.example/api/zernio/webhook]
 */
import { ZERNIO_WEBHOOK_EVENTS } from "../src/lib/social-webhook";
import { createZernioClient } from "../src/lib/zernio";

const key = process.env.ZERNIO_API_KEY?.trim() ?? "";
const secret = process.env.ZERNIO_WEBHOOK_SECRET?.trim() ?? "";
const url = process.argv[2] ?? `${(process.env.HANDOFF_HQ_ORIGIN ?? "https://hq.abra-ca-dabra.app").replace(/\/$/, "")}/api/zernio/webhook`;

if (!key || !secret) {
  console.error("Set ZERNIO_API_KEY and ZERNIO_WEBHOOK_SECRET first.");
  process.exit(1);
}

async function main(): Promise<void> {
  const zernio = createZernioClient(key);
  const existing = (await zernio.listWebhooks()).find((hook) => hook.url === url);
  const saved = await zernio.saveWebhook({
    id: existing?._id,
    name: "Handoff HQ",
    url,
    events: [...ZERNIO_WEBHOOK_EVENTS],
    secret,
  });
  console.log(`${existing ? "Updated" : "Created"} webhook ${saved._id || existing?._id || ""} -> ${url}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
