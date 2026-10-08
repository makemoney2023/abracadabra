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

export type ScrapedContact = {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
};

function cleanEmail(value: string | undefined): string | undefined {
  const email = value?.trim().toLowerCase().replace(/^mailto:/, "");
  if (!email || !email.includes("@") || email.startsWith("@") || !email.split("@")[1]?.includes(".")) return undefined;
  return email;
}

function cleanPhone(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/^tel:/i, "");
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return undefined;
  return `${plus ? "+" : ""}${digits}`;
}

function remember(contacts: ScrapedContact[], next: ScrapedContact) {
  const email = cleanEmail(next.email);
  const phone = cleanPhone(next.phone);
  const name = next.name?.replace(/\s+/g, " ").trim().slice(0, 200) || undefined;
  const title = next.title?.replace(/\s+/g, " ").trim().slice(0, 120) || undefined;
  if (!email && !phone && !name) return;
  const existing = contacts.find(
    (contact) => (email && contact.email === email) || (phone && contact.phone === phone),
  );
  if (existing) {
    existing.name = existing.name ?? name;
    existing.title = existing.title ?? title;
    existing.email = existing.email ?? email;
    existing.phone = existing.phone ?? phone;
    return;
  }
  const contact: ScrapedContact = {};
  if (name) contact.name = name;
  if (title) contact.title = title;
  if (email) contact.email = email;
  if (phone) contact.phone = phone;
  contacts.push(contact);
}

function readJsonLd(html: string, contacts: ScrapedContact[]) {
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      walkLd(JSON.parse(match[1] ?? ""), contacts);
    } catch {
      continue;
    }
  }
}

function walkLd(value: unknown, contacts: ScrapedContact[]) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkLd(item, contacts);
    return;
  }
  const row = value as Record<string, unknown>;
  const type = row["@type"];
  const isPerson = type === "Person" || (Array.isArray(type) && type.includes("Person"));
  const contactType = typeof row.contactType === "string" ? row.contactType : undefined;
  const jobTitle = typeof row.jobTitle === "string" ? row.jobTitle : undefined;
  const name = typeof row.name === "string" && (isPerson || contactType) ? row.name : undefined;
  remember(contacts, {
    name,
    title: contactType ?? jobTitle,
    email: typeof row.email === "string" ? row.email : undefined,
    phone: typeof row.telephone === "string" ? row.telephone : undefined,
  });
  if (row.contactPoint) walkLd(row.contactPoint, contacts);
  if (row["@graph"]) walkLd(row["@graph"], contacts);
}

/** Email, phone, and named people published on a scraped page. */
export function contactsFromHtml(html: string): ScrapedContact[] {
  const contacts: ScrapedContact[] = [];
  readJsonLd(html, contacts);
  for (const match of html.matchAll(/mailto:([^"'?\s>]+)/gi)) remember(contacts, { email: match[1] });
  for (const match of html.matchAll(/tel:([^"'?\s>]+)/gi)) remember(contacts, { phone: match[1] });
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  for (const match of withoutScripts.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    remember(contacts, { email: match[0] });
  }
  return contacts.filter((contact) => contact.email || contact.phone);
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

export type SiteReview = {
  name: string;
  domain: string;
  website: string;
  needsUs: boolean;
  answer: string;
  contacts: ScrapedContact[];
};

function unread(domain: string, answer: string): SiteReview {
  return {
    name: domain,
    domain,
    website: `https://${domain}`,
    needsUs: false,
    answer,
    contacts: [],
  };
}

async function judgeDomain(input: {
  fetchImpl: FetchImpl;
  accountId: string;
  token: string;
  domain: string;
  objective: string;
}): Promise<SiteReview> {
  const { fetchImpl, accountId, token, domain, objective } = input;
  const homepage = `https://${domain}/`;
  let html = "";
  try {
    const page = await fetchImpl(homepage, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8_000) });
    if (!page.ok) return unread(domain, "Could not read the homepage.");
    html = await page.text();
  } catch {
    return unread(domain, "Could not read the homepage.");
  }

  const contacts = contactsFromHtml(html);
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
    if (!created.ok) return { ...unread(domain, "Could not index the homepage."), name: pageTitle(html, domain), contacts };
  }

  const form = new FormData();
  form.set("file", new File([html], "home.html", { type: "text/html" }));
  form.set("metadata", JSON.stringify({ url: homepage, domain }));
  form.set("wait_for_completion", "true");
  const uploaded = await fetchImpl(`${instance}/items`, { method: "POST", headers: auth, body: form });
  if (!uploaded.ok) return { ...unread(domain, "Could not index the homepage."), name: pageTitle(html, domain), contacts };

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
  if (!asked.ok) return { ...unread(domain, "Could not judge the homepage."), name: pageTitle(html, domain), contacts };
  let answer = "";
  try {
    answer = chatAnswer(await asked.json());
  } catch {
    return { ...unread(domain, "Could not judge the homepage."), name: pageTitle(html, domain), contacts };
  }
  return {
    name: pageTitle(html, domain),
    domain,
    website: homepage.replace(/\/$/, ""),
    needsUs: needsFollowUp(answer),
    answer,
    contacts,
  };
}

function asLead(review: SiteReview): ParallelLead {
  return {
    name: review.name,
    domain: review.domain,
    website: review.website,
    contacts: review.contacts.map((contact) => ({
      name: contact.name,
      title: contact.title,
      email: contact.email,
      phone: contact.phone,
    })),
    raw: { source: "ai_search", answer: review.answer },
  };
}

export function createAiSearchProspectFinder(options?: { env?: AiSearchEnv; fetchImpl?: FetchImpl }) {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const env = options?.env ?? {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
  };

  async function reviewSites(objective: string): Promise<SiteReview[]> {
    const accountId = env.accountId?.trim() ?? "";
    const token = env.apiToken?.trim() ?? "";
    const domains = domainsFromObjective(objective);
    if (!accountId || !token) return domains.map((domain) => unread(domain, "Cloudflare AI Search is not configured."));
    const reviews: SiteReview[] = [];
    for (const domain of domains) {
      reviews.push(await judgeDomain({ fetchImpl, accountId, token, domain, objective }));
    }
    return reviews;
  }

  return {
    reviewSites,
    async findProspects(objective: string): Promise<ParallelLead[]> {
      const reviews = await reviewSites(objective);
      return reviews.filter((review) => review.needsUs).map(asLead);
    },
  };
}
