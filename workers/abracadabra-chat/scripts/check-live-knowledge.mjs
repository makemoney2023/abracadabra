// Read-only: is the deployed chat answering from the same site knowledge as this checkout?
//   npm run knowledge:live            (checks https://abra-ca-dabra.app)
//   CHAT_ORIGIN=https://abracadabra-chat.<sub>.workers.dev npm run knowledge:live
// Exit 0 when the live version matches src/site-knowledge.js, 1 when it differs (deploy this Worker), 2 when unreachable.
import { SITE_KNOWLEDGE_VERSION } from "../src/site-knowledge.js";

const origin = (process.env.CHAT_ORIGIN || "https://abra-ca-dabra.app").replace(/\/$/, "");
let live = "";
try {
  const response = await fetch(`${origin}/api/chat/config`, { headers: { origin: "https://abra-ca-dabra.app" } });
  live = String((await response.json())?.knowledge || "");
} catch (error) {
  console.error(`Could not read ${origin}/api/chat/config: ${error?.message || error}`);
  process.exit(2);
}
if (live === SITE_KNOWLEDGE_VERSION) {
  console.log(`Live chat knowledge is current (${live}).`);
  process.exit(0);
}
console.error(`Live chat knowledge is ${live || "unversioned (deployed before versioning)"}; this checkout is ${SITE_KNOWLEDGE_VERSION}. Deploy workers/abracadabra-chat.`);
process.exit(1);
