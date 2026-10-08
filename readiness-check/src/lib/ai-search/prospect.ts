import "server-only";

import type { ParallelLead } from "@/lib/parallel/types";
import { instanceIdForDomain, type AiSearchEnv } from "@/lib/ai-search/scan-client";

const API = "https://api.cloudflare.com/client/v4";
const MAX_SITES = 8;

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

function hostOf(value: string): string {
  return value.toLowerCase().replace(/^www\./, "").replace(/\.+$/, "");
}

/** Sites named in a prospect note. Email addresses are not sites. */
export function domainsFromObjective(objective: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const text = objective.replace(/[^\s@]+@[^\s@]+/g, " ");

  function add(raw: string) {
    const host = hostOf(raw);
    if (!host.includes(".") || host.startsWith(".") || seen.has(host) || found.length >= MAX_SITES) return;
    seen.add(host);
    found.push(host);
  }

  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    try {
      add(new URL(match[0].replace(/[),.;]+$/, "")).hostname);
    } catch {
      continue;
    }
  }
  for (const match of text.matchAll(/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi)) {
    add(match[0].replace(/[),.;]+$/, ""));
  }
  return found;
}

/** True when AI Search says this business needs a follow-up. */
export function needsFollowUp(answer: string): boolean {
  return /NEEDS_US/i.test(answer);
}

function pageTitle(html: string, domain: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  return title.length > 0 ? title.slice(0, 200) : domain;
}

function chatAnswer(body: unknown): string {
  const root = body && typeof body === "object" ? (body as { result?: unknown; choices?: unknown }) : null;
  const result = root?.result && typeof root.result === "object" ? (root.result as { choices?: unknown }) : root;
  const choices = result?.choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return typeof message?.content === "string" ? message.content : "";
}

async function judgeDomain(input: {
  fetchImpl: FetchImpl;
  accountId: string;
  token: string;
  domain: string;
  objective: string;
}): Promise<ParallelLead | null> {
  const { fetchImpl, accountId, token, domain, objective } = input;
  const homepage = `https://${domain}/`;
  let html = "";
  try {
    const page = await fetchImpl(homepage, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8_000) });
    if (!page.ok) return null;
    html = await page.text();
  } catch {
    return null;
  }

  const auth = { Authorization: `Bearer ${token}` };
  const instance = `${API}/accounts/${accountId}/ai-search/namespaces/default/instances/${instanceIdForDomain(domain)}`;
  const existing = await fetchImpl(instance, { method: "GET", headers: auth });
  if (!existing.ok) {
    const created = await fetchImpl(
      `${API}/accounts/${accountId}/ai-search/namespaces/default/instances`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ id: instanceIdForDomain(domain) }),
      },
    );
    if (!created.ok) return null;
  }

  const form = new FormData();
  form.set("file", new File([html], "home.html", { type: "text/html" }));
  form.set("metadata", JSON.stringify({ url: homepage, domain }));
  form.set("wait_for_completion", "true");
  const uploaded = await fetchImpl(`${instance}/items`, { method: "POST", headers: auth, body: form });
  if (!uploaded.ok) return null;

  const asked = await fetchImpl(`${instance}/chat/completions`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: `The staff asked: ${objective}\nDoes this business need help so answer engines can quote the site? Reply with NEEDS_US or COVERED on the first line, then one sentence.`,
        },
      ],
    }),
  });
  if (!asked.ok) return null;
  let answer = "";
  try {
    answer = chatAnswer(await asked.json());
  } catch {
    return null;
  }
  if (!needsFollowUp(answer)) return null;
  return {
    name: pageTitle(html, domain),
    domain,
    website: `https://${domain}`,
    contacts: [],
    raw: { source: "ai_search", answer },
  };
}

export function createAiSearchProspectFinder(options?: { env?: AiSearchEnv; fetchImpl?: FetchImpl }) {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const env = options?.env ?? {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
  };

  return {
    async findProspects(objective: string): Promise<ParallelLead[]> {
      const accountId = env.accountId?.trim() ?? "";
      const token = env.apiToken?.trim() ?? "";
      if (!accountId || !token) return [];
      const leads: ParallelLead[] = [];
      for (const domain of domainsFromObjective(objective)) {
        const lead = await judgeDomain({ fetchImpl, accountId, token, domain, objective });
        if (lead) leads.push(lead);
      }
      return leads;
    },
  };
}
