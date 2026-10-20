// Builds src/site-knowledge.js from the marketing site's own data, so the chat only knows what the site says.
// Run: npm run knowledge   (from workers/abracadabra-chat). A test checks the file is current.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const site = new URL("../../../scrollcraft/builds/abracadabra-ai/scripts/", import.meta.url);
const out = fileURLToPath(new URL("../src/site-knowledge.js", import.meta.url));

const one = (text) => String(text || "").replace(/\s+/g, " ").trim();
const first = (text) => one(text).split(/(?<=[.!?])\s+/)[0];
// Up to two sentences, but short: enough for the model to describe the service in its own words.
const brief = (text, cap = 170) => {
  const parts = one(text).split(/(?<=[.!?])\s+/);
  let outText = parts[0];
  if (parts[1] && (outText + " " + parts[1]).length <= cap) outText += ` ${parts[1]}`;
  return outText;
};

// Only public work. Order: the strongest examples first.
const WORK_ORDER = ["strongfoam-crm", "pirx", "strongfoam-website", "milrcorr", "renew-implants", "superpatch-products", "super-funnel", "schema", "llm-leverage"];

// Plain business reasons. Lines quoted from the site come first; the rest are general, accurate facts about Cloudflare.
export const CLOUDFLARE = [
  "Fast everywhere: the app runs on Cloudflare's global network, close to each visitor, so pages and answers load quickly.",
  "Reliable: it is built to keep running if one location has a problem.",
  "Security built in: DDoS protection, bot protection and a firewall come with the network.",
  "No servers to manage or patch, and it scales up and down with traffic on its own.",
  "Low running costs: you pay for what is used, so a small business does not carry idle servers.",
  "AI on the same network: models run on Cloudflare (Workers AI) behind one gateway, so spend is logged, capped and can be stopped.",
  "Data controls: we choose what is logged and kept. This chat stores the words, not the audio.",
  "From our site: built on Cloudflare and connected to the tools you already use, so nothing has to move. Your data goes only to the model doing the work.",
];

// Plain facts for the two newest services. Locked PIRX terms come from the PIRX owner's own glossary.
export const DETAILS = [
  "PIRX DETAIL (pirx.ca, /portfolio/pirx/): we designed and built the PIRX app and its machine learning. A runner connects the watch they already wear. PIRX gives a Projected Time for a race, a Supported Range around it, and five Structural Drivers: Aerobic Base, Threshold Density, Speed Exposure, Running Economy and Load Consistency. Personal models, including gradient boosting, learn each runner's patterns and are only used when they beat the app's safe rules. Athletic estimates, not medical advice. PIRX is the only named machine learning project; never say another project used machine learning. Use these exact names: say Projected Time (never prediction score), Supported Range (never confidence interval), Personal Best (never PR). Never give an accuracy figure or a user count.",
  "MCP DETAIL (/services/mcp-connectors/): MCP, the Model Context Protocol, is an open standard that lets AI assistants like Claude, ChatGPT, Copilot and Cursor plug into a business's tools through one connector. We build MCP connectors on Cloudflare, with sign-in, permissions and approval before any change. Three ways to use it: ask your business (plain, read-only questions), let your AI do the busywork (each change asks for a yes first), and one safe front door (one sign-in, rules for who can use what, a record of every action). No MCP client project is named yet, so never claim one.",
];

const OTHER_PAGES = [
  ["Home", "/", "the studio, the process, and how to start"],
  ["Work page", "/portfolio/", "all case studies"],
  ["Services page", "/services/", "all services"],
  ["Products page", "/products/", "Schema and Super Funnel"],
  ["Films page", "/films.html", "short films of the apps"],
  ["Notes", "/blog/", "plain guides to putting AI to work"],
  ["LLM Leverage course", "/course/llm-leverage/", "the self-paced course"],
];

// Every page the chat may link to. Anything else on the domain is dropped by the answer filter.
const BASE_PATHS = OTHER_PAGES.map(([, path]) => path);

export async function buildKnowledge() {
  const data = await import(new URL("site-data.mjs", site));
  const sales = await import(new URL("service-sales.mjs", site));
  const byCase = new Map(data.cases.map((item) => [item.slug, item]));
  const work = WORK_ORDER.map((slug) => byCase.get(slug)).filter(Boolean).map((item) => {
    const path = item.kind === "product" ? `/products/${item.slug}/` : `/portfolio/${item.slug}/`;
    return { name: item.name, path, line: brief(item.summary, 240) };
  });
  const services = Object.entries(sales.salesPages).map(([slug, page]) => ({
    name: page.short,
    path: `/services/${slug}/`,
    line: brief(page.description),
  }));
  const process = sales.processSteps.map((step) => `${step.title}: ${first(step.text)}`);
  const lines = [
    "ABOUT: Abracadabra is a studio in Toronto. Let us bring your ideas to life. Custom software and AI tools, built for how you work. We design, build and run them, so they fit your business, not the other way around.",
    "WORK (real, public examples). Format: name | page | what it is. Each page belongs only to its own project.",
    ...work.map((item) => `- ${item.name} | ${item.path} | ${item.line}`),
    ...DETAILS,
    "SERVICES. Format: name | page | what it does.",
    ...services.map((item) => `- ${item.name} | ${item.path} | ${item.line}`),
    "OTHER PAGES (the only other pages that exist):",
    ...OTHER_PAGES.map(([name, path, line]) => `- ${name} | ${path} | ${line}`),
    `PROCESS: ${process.join(" ")}`,
    "COST: Priced to the project. Tell us what you need and we'll quote it. Never give a number.",
    "NEXT STEPS (options, not a closing line: offer one only when the visitor asks about cost, timing, getting started, or talking to a person): a thirty-minute working session, booked right in this chat. Not sure where to start? The Readiness Check takes five to seven minutes, can be taken right here in this chat (or at check.abra-ca-dabra.app), and shows where the work slows down: the data, the workflow, the owner, the decision, and how visible the site is to answer engines.",
    "WHY CLOUDFLARE:",
    ...CLOUDFLARE.map((line) => `- ${line}`),
  ];
  const paths = [...new Set([...BASE_PATHS, ...work.map((item) => item.path), ...services.map((item) => item.path)])];
  return { text: lines.join("\n"), work, services, paths };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { text, work, services, paths } = await buildKnowledge();
  const body = `// Generated by scripts/build-site-knowledge.mjs from the marketing site source. Do not edit by hand.\n`
    + `export const SITE_KNOWLEDGE = ${JSON.stringify(text)};\n\n`
    + `export const SITE_WORK = ${JSON.stringify(work, null, 2)};\n\n`
    + `export const SITE_SERVICES = ${JSON.stringify(services, null, 2)};\n\n`
    + `export const SITE_PATHS = ${JSON.stringify(paths, null, 2)};\n`;
  await writeFile(out, body);
  console.log(`site-knowledge.js: ${text.length} chars, ~${Math.round(text.length / 4)} tokens`);
}
