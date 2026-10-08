import type { Sql } from "../db/sql";

export type LeadSnapshot = {
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  notes: string | null;
};

export type SchemaFacts = {
  businessName?: string;
  description?: string;
  emails?: string[];
  phones?: string[];
  sameAs?: string[];
  address?: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
  };
  openingHours?: string[];
  existingTypes?: string[];
};

export type NamedContact = {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
};

export type LeadFill = {
  name?: string;
  website?: string;
  industry?: string;
  notes?: string;
  contacts: { name: string; title: string | null; email: string | null; phone: string | null }[];
};

const SKIP_TYPES = new Set([
  "Organization",
  "WebSite",
  "WebPage",
  "Thing",
  "ItemList",
  "BreadcrumbList",
  "SearchAction",
  "ImageObject",
  "ListItem",
]);

function clean(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function industryOf(types: string[] | undefined): string | null {
  const type = (types ?? []).find((item) => item && !SKIP_TYPES.has(item));
  if (!type) return null;
  return type.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function addressOf(facts: SchemaFacts): string {
  const address = facts.address;
  if (!address) return "";
  return [address.streetAddress, address.addressLocality, address.addressRegion, address.postalCode, address.addressCountry]
    .map((part) => clean(part))
    .filter(Boolean)
    .join(", ");
}

function placeholderName(name: string, domain: string | null): boolean {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed || trimmed === "lead") return true;
  return Boolean(domain && trimmed === domain.toLowerCase());
}

/** Blank lead fields the schema pack can fill. A name staff already typed stays. */
export function leadFillFromSchema(current: LeadSnapshot, facts: SchemaFacts, people: NamedContact[], website: string): LeadFill {
  const fill: LeadFill = { contacts: [] };
  const businessName = clean(facts.businessName);
  if (businessName && placeholderName(current.name, current.domain)) fill.name = businessName.slice(0, 200);
  if (!current.website && website.startsWith("http")) fill.website = website.slice(0, 300);
  const industry = industryOf(facts.existingTypes);
  if (!current.industry && industry) fill.industry = industry.slice(0, 120);
  const lines = [
    clean(facts.description),
    addressOf(facts) ? `Address: ${addressOf(facts)}` : "",
    facts.openingHours && facts.openingHours.length > 0 ? `Hours: ${facts.openingHours.join("; ")}` : "",
    facts.sameAs && facts.sameAs.length > 0 ? `Links: ${facts.sameAs.join(", ")}` : "",
    facts.existingTypes && facts.existingTypes.length > 0 ? `Schema: ${facts.existingTypes.join(", ")}` : "",
  ].filter(Boolean);
  const notes = current.notes ?? "";
  const extra = lines.filter((line) => !notes.includes(line));
  if (extra.length > 0) fill.notes = [notes.trim(), ...extra].filter(Boolean).join("\n").slice(0, 4000);

  const seenEmail = new Set<string>();
  const seenPhone = new Set<string>();
  const contacts: LeadFill["contacts"] = [];
  function add(person: NamedContact) {
    const email = clean(person.email).toLowerCase();
    const phone = clean(person.phone);
    const name = clean(person.name) || businessName || current.name;
    if (!name) return;
    if (email && seenEmail.has(email)) return;
    if (!email && phone && seenPhone.has(phone)) return;
    if (!email && !phone) return;
    if (email) seenEmail.add(email);
    if (phone) seenPhone.add(phone);
    contacts.push({
      name: name.slice(0, 200),
      title: clean(person.title).slice(0, 120) || null,
      email: email || null,
      phone: phone.slice(0, 40) || null,
    });
  }
  for (const person of people) add(person);
  for (const email of facts.emails ?? []) add({ email, name: businessName || current.name });
  for (const phone of facts.phones ?? []) add({ phone, name: businessName || current.name });
  fill.contacts = contacts;
  return fill;
}

function asFacts(value: Record<string, unknown>): SchemaFacts {
  const address = value.address && typeof value.address === "object" ? (value.address as SchemaFacts["address"]) : undefined;
  return {
    businessName: typeof value.businessName === "string" ? value.businessName : undefined,
    description: typeof value.description === "string" ? value.description : undefined,
    emails: Array.isArray(value.emails) ? value.emails.filter((item): item is string => typeof item === "string") : [],
    phones: Array.isArray(value.phones) ? value.phones.filter((item): item is string => typeof item === "string") : [],
    sameAs: Array.isArray(value.sameAs) ? value.sameAs.filter((item): item is string => typeof item === "string") : [],
    address,
    openingHours: Array.isArray(value.openingHours) ? value.openingHours.filter((item): item is string => typeof item === "string") : [],
    existingTypes: Array.isArray(value.existingTypes) ? value.existingTypes.filter((item): item is string => typeof item === "string") : [],
  };
}

/** Writes schema details onto the lead where those fields are still empty. */
export async function enrichLeadFromSchema(sql: Sql, organizationId: string, now: number): Promise<{ filled: string[] }> {
  const table = await sql.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'readiness_scans'",
  );
  if (!table) return { filled: [] };
  const org = await sql.get<LeadSnapshot & { id: string }>(
    "SELECT name, domain, website, industry, notes FROM organizations WHERE id = ?",
    [organizationId],
  );
  if (!org) return { filled: [] };
  const scan = await sql.get<{ id: string }>(
    `SELECT id FROM readiness_scans
     WHERE status = 'complete' AND (organization_id = ? OR domain = ?)
     ORDER BY COALESCE(completed_at, created_at) DESC LIMIT 1`,
    [organizationId, org.domain],
  );
  if (!scan) return { filled: [] };
  const pages = await sql.all<{ evidence_json: string; schema_types_json: string; url: string }>(
    "SELECT url, evidence_json, schema_types_json FROM readiness_scan_pages WHERE scan_id = ? ORDER BY url",
    [scan.id],
  );
  const facts: SchemaFacts = { emails: [], phones: [], sameAs: [], openingHours: [], existingTypes: [] };
  for (const page of pages) {
    let parsed: Record<string, unknown> = {};
    try {
      const value = JSON.parse(page.evidence_json) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    const next = asFacts(parsed);
    facts.businessName = facts.businessName || next.businessName;
    facts.description = facts.description || next.description;
    facts.address = facts.address || next.address;
    facts.emails = [...(facts.emails ?? []), ...(next.emails ?? [])];
    facts.phones = [...(facts.phones ?? []), ...(next.phones ?? [])];
    facts.sameAs = [...(facts.sameAs ?? []), ...(next.sameAs ?? [])];
    facts.openingHours = [...(facts.openingHours ?? []), ...(next.openingHours ?? [])];
    facts.existingTypes = [...(facts.existingTypes ?? []), ...(next.existingTypes ?? [])];
    try {
      const types = JSON.parse(page.schema_types_json) as unknown;
      if (Array.isArray(types)) {
        facts.existingTypes.push(...types.filter((item): item is string => typeof item === "string"));
      }
    } catch {
      continue;
    }
  }
  const people: NamedContact[] = [];
  const sites = await sql.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_check_sites'",
  );
  if (sites) {
    const rows = await sql.all<{ contacts_json: string }>(
      "SELECT contacts_json FROM schema_check_sites WHERE organization_id = ? OR domain = ?",
      [organizationId, org.domain],
    );
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.contacts_json) as unknown;
        if (!Array.isArray(parsed)) continue;
        for (const item of parsed) {
          if (!item || typeof item !== "object") continue;
          const person = item as NamedContact;
          people.push(person);
        }
      } catch {
        continue;
      }
    }
  }
  const home = pages[0]?.url ?? "";
  const fill = leadFillFromSchema(org, facts, people, home.startsWith("http") ? home : "");
  const filled: string[] = [];
  if (fill.name || fill.website || fill.industry || fill.notes) {
    await sql.run(
      `UPDATE organizations
       SET name = ?, website = COALESCE(website, ?), industry = COALESCE(industry, ?), notes = ?, updated_at = ?
       WHERE id = ?`,
      [fill.name ?? org.name, fill.website ?? null, fill.industry ?? null, fill.notes ?? org.notes, now, organizationId],
    );
    if (fill.name) filled.push("name");
    if (fill.website) filled.push("website");
    if (fill.industry) filled.push("industry");
    if (fill.notes) filled.push("notes");
  }
  const existing = await sql.all<{ email: string | null; phone: string | null }>(
    "SELECT email, phone FROM contacts WHERE organization_id = ?",
    [organizationId],
  );
  const emails = new Set(existing.flatMap((row) => (row.email ? [row.email] : [])));
  const phones = new Set(existing.flatMap((row) => (row.phone ? [row.phone] : [])));
  for (const contact of fill.contacts) {
    if (contact.email && emails.has(contact.email)) continue;
    if (!contact.email && contact.phone && phones.has(contact.phone)) continue;
    try {
      await sql.run(
        `INSERT INTO contacts (id, organization_id, name, title, email, phone, is_primary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          organizationId,
          contact.name,
          contact.title,
          contact.email,
          contact.phone,
          existing.length === 0 && filled.filter((item) => item === "contact").length === 0 ? 1 : 0,
          now,
          now,
        ],
      );
      if (contact.email) emails.add(contact.email);
      if (contact.phone) phones.add(contact.phone);
      filled.push("contact");
    } catch {
      continue;
    }
  }
  return { filled };
}
