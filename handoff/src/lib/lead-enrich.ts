import type { Sql } from "../db/sql";
import { brandFromTitle, dedupePhones, emailsFromHtml, phoneKey, phonesFromHtml, preferPhone, publishedPhone } from "./contact-signals";

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

  const officeName = (brandFromTitle(businessName) || clean(current.name)).slice(0, 200);
  const officeNames = new Set(
    [officeName, clean(businessName), clean(current.name)].map((value) => value.toLowerCase()).filter(Boolean),
  );
  const seenEmail = new Set<string>();
  const seenPhone = new Set<string>();
  const contacts: LeadFill["contacts"] = [];
  function isOffice(name: string): boolean {
    const folded = name.trim().toLowerCase();
    return !folded || officeNames.has(folded);
  }
  function add(person: NamedContact) {
    const email = clean(person.email).toLowerCase();
    const phone = publishedPhone(person.phone ?? "") ?? "";
    if (!email && !phone) return;
    const given = clean(person.name);
    const personal = Boolean(given) && !isOffice(given);
    const name = (personal ? given : officeName).slice(0, 200);
    if (!name) return;
    const key = phone ? phoneKey(phone) : "";
    const title = clean(person.title).slice(0, 120) || null;
    const byEmail = email ? contacts.find((contact) => contact.email === email) : undefined;
    if (byEmail) {
      if (phone && !byEmail.phone) byEmail.phone = phone;
      else if (phone && byEmail.phone) byEmail.phone = preferPhone(byEmail.phone, phone);
      if (personal && isOffice(byEmail.name)) {
        byEmail.name = name;
        if (title) byEmail.title = title;
      }
      if (key) seenPhone.add(key);
      return;
    }
    const byPhone = key ? contacts.find((contact) => contact.phone && phoneKey(contact.phone) === key) : undefined;
    if (byPhone) {
      if (email && !byPhone.email) byPhone.email = email;
      if (phone && byPhone.phone) byPhone.phone = preferPhone(byPhone.phone, phone);
      if (personal && isOffice(byPhone.name)) {
        byPhone.name = name;
        if (title) byPhone.title = title;
      }
      if (email) seenEmail.add(email);
      return;
    }
    if (!personal) {
      const office = contacts.find((contact) => isOffice(contact.name));
      if (office) {
        if (email && !office.email) office.email = email;
        if (phone && !office.phone) office.phone = phone;
        else if (phone && office.phone) office.phone = preferPhone(office.phone, phone);
        if (email) seenEmail.add(email);
        if (key) seenPhone.add(key);
        return;
      }
    }
    if (email) seenEmail.add(email);
    if (key) seenPhone.add(key);
    contacts.push({
      name,
      title: personal ? title : null,
      email: email || null,
      phone: phone || null,
    });
  }
  for (const person of people) add(person);
  for (const email of facts.emails ?? []) add({ email, name: officeName || current.name });
  for (const phone of dedupePhones(facts.phones ?? [])) add({ phone, name: officeName || current.name });
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
  const scrapedPages: string[] = [];
  const pageTitles: string[] = [];
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
    if (next.businessName) pageTitles.push(clean(next.businessName));
    if (typeof parsed.scrapedText === "string" && parsed.scrapedText.trim()) scrapedPages.push(parsed.scrapedText);
    try {
      const types = JSON.parse(page.schema_types_json) as unknown;
      if (Array.isArray(types)) {
        facts.existingTypes.push(...types.filter((item): item is string => typeof item === "string"));
      }
    } catch {
      continue;
    }
  }
  const scraped = scrapedPages.join("\n");
  if (scraped) {
    facts.emails = [...(facts.emails ?? []), ...emailsFromHtml(scraped)];
    facts.phones = [...(facts.phones ?? []), ...phonesFromHtml(scraped)];
  }
  facts.phones = dedupePhones(facts.phones ?? []);
  facts.emails = [...new Set((facts.emails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean))];
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
  const titles = new Set(pageTitles.map((title) => title.toLowerCase()).filter(Boolean));
  const existing = await sql.all<{ id: string; name: string | null; email: string | null; phone: string | null; is_primary: number }>(
    "SELECT id, name, email, phone, is_primary FROM contacts WHERE organization_id = ?",
    [organizationId],
  );
  const dropped = new Set<string>();
  for (const row of existing) {
    const name = (row.name ?? "").trim().toLowerCase();
    if (row.email || !name.includes("|") || !titles.has(name)) continue;
    for (const table of ["activities", "assessments", "appointments", "invoices"]) {
      await sql.run(`UPDATE ${table} SET contact_id = NULL WHERE contact_id = ?`, [row.id]);
    }
    await sql.run("DELETE FROM contacts WHERE id = ?", [row.id]);
    dropped.add(row.id);
  }
  const live = existing.filter((row) => !dropped.has(row.id));
  const emails = new Set(live.flatMap((row) => (row.email ? [row.email] : [])));
  const phones = new Set(live.flatMap((row) => (row.phone && publishedPhone(row.phone) ? [phoneKey(row.phone)] : [])));
  let hasPrimary = live.some((row) => row.is_primary === 1);
  for (const contact of fill.contacts) {
    const key = contact.phone ? phoneKey(contact.phone) : "";
    if (contact.email && emails.has(contact.email)) continue;
    if (key && phones.has(key)) continue;
    try {
      const primary = hasPrimary ? 0 : 1;
      await sql.run(
        `INSERT INTO contacts (id, organization_id, name, title, email, phone, is_primary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), organizationId, contact.name, contact.title, contact.email, contact.phone, primary, now, now],
      );
      if (primary === 1) hasPrimary = true;
      if (contact.email) emails.add(contact.email);
      if (key) phones.add(key);
      filled.push("contact");
    } catch {
      continue;
    }
  }
  return { filled };
}
