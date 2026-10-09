import { normalizeDomain } from "@/db/crm";
import type { Sql } from "@/db/sql";
import { dueMillis } from "./channel-plan";

const FREEMAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "msn.com",
]);

export type OpenedProspect = {
  organizationId: string;
  name: string;
  created: boolean;
};

function isUnique(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE");
}

function cleanEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function companyHost(email: string): string | null {
  const host = normalizeDomain(email.split("@")[1] ?? "");
  if (!host || FREEMAIL.has(host)) return null;
  return host;
}

function labelFrom(name: string | null, email: string, domain: string | null): string {
  const given = name?.trim() ?? "";
  if (given) return given.slice(0, 200);
  const local = (email.split("@")[0] ?? "").replace(/[._+-]+/g, " ").trim();
  if (local) return local.slice(0, 200);
  return domain ?? "Lead";
}

async function withTx<T>(sql: Sql, work: () => Promise<T>): Promise<T> {
  await sql.exec("BEGIN");
  try {
    const value = await work();
    await sql.exec("COMMIT");
    return value;
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
}

async function organizationName(sql: Sql, organizationId: string): Promise<string> {
  const row = await sql.get<{ name: string }>("SELECT name FROM organizations WHERE id = ?", [organizationId]);
  return row?.name ?? "Lead";
}

async function prospectByEmail(sql: Sql, email: string): Promise<{ organizationId: string; name: string } | null> {
  const known = await sql.get<{ organization_id: string | null }>(
    "SELECT organization_id FROM contacts WHERE email = ?",
    [email],
  );
  if (!known?.organization_id) return null;
  return { organizationId: known.organization_id, name: await organizationName(sql, known.organization_id) };
}

async function organizationByDomain(
  sql: Sql,
  domain: string,
): Promise<{ id: string; name: string } | undefined> {
  return sql.get<{ id: string; name: string }>(
    "SELECT id, name FROM organizations WHERE domain = ? AND archived_at IS NULL",
    [domain],
  );
}

async function attachPerson(
  sql: Sql,
  org: { id: string; name: string },
  email: string,
  contactName: string,
  now: number,
): Promise<OpenedProspect> {
  const already = await prospectByEmail(sql, email);
  if (already) return { ...already, created: false };
  const primary = await sql.get<{ id: string }>(
    "SELECT id FROM contacts WHERE organization_id = ? AND is_primary = 1 LIMIT 1",
    [org.id],
  );
  const openDeal = await sql.get<{ id: string }>(
    "SELECT id FROM deals WHERE organization_id = ? AND stage NOT IN ('won', 'lost') LIMIT 1",
    [org.id],
  );
  await withTx(sql, async () => {
    await sql.run(
      `INSERT INTO contacts (id, organization_id, name, email, is_primary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), org.id, contactName, email, primary ? 0 : 1, now, now],
    );
    if (!openDeal) {
      await sql.run(
        `INSERT INTO deals (id, organization_id, title, stage, source, created_at, updated_at)
         VALUES (?, ?, ?, 'new', 'email', ?, ?)`,
        [crypto.randomUUID(), org.id, `${org.name} from email`, now, now],
      );
    }
  });
  return { organizationId: org.id, name: org.name, created: false };
}

async function createLead(
  sql: Sql,
  input: { email: string; contactName: string; orgName: string; domain: string | null; now: number },
): Promise<OpenedProspect> {
  const organizationId = crypto.randomUUID();
  const contactId = crypto.randomUUID();
  const dealId = crypto.randomUUID();
  const website = input.domain ? `https://${input.domain}` : null;
  await withTx(sql, async () => {
    await sql.run(
      `INSERT INTO organizations (id, name, domain, website, kind, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'lead', ?, ?)`,
      [organizationId, input.orgName, input.domain, website, input.now, input.now],
    );
    await sql.run(
      `INSERT INTO contacts (id, organization_id, name, email, is_primary, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [contactId, organizationId, input.contactName, input.email, input.now, input.now],
    );
    await sql.run(
      `INSERT INTO deals (id, organization_id, title, stage, source, created_at, updated_at)
       VALUES (?, ?, ?, 'new', 'email', ?, ?)`,
      [dealId, organizationId, `${input.orgName} from email`, input.now, input.now],
    );
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, contact_id, deal_id, kind, actor_kind, body, data_json, created_at
       ) VALUES (?, ?, ?, ?, 'email', 'system', ?, '{}', ?)`,
      [crypto.randomUUID(), organizationId, contactId, dealId, "Opened from an email to magic@.", input.now],
    );
  });
  return { organizationId, name: input.orgName, created: true };
}

/** One lead for a company address. A second person at that domain joins the same lead. */
export async function openEmailProspect(
  sql: Sql,
  input: { email: string; name: string | null; now: number },
): Promise<OpenedProspect> {
  const email = cleanEmail(input.email);
  if (!email) throw new Error("invalid email");
  const domain = companyHost(email);
  const known = await prospectByEmail(sql, email);
  if (known) return { ...known, created: false };
  const orgName = labelFrom(input.name, email, domain);
  const contactName = input.name?.trim() ? input.name.trim().slice(0, 200) : orgName;
  const existing = domain ? await organizationByDomain(sql, domain) : undefined;
  try {
    if (existing) return await attachPerson(sql, existing, email, contactName, input.now);
    return await createLead(sql, { email, contactName, orgName, domain, now: input.now });
  } catch (error) {
    if (!isUnique(error)) throw error;
    const again = await prospectByEmail(sql, email);
    if (again) return { ...again, created: false };
    const raced = domain ? await organizationByDomain(sql, domain) : undefined;
    if (!raced) throw error;
    return attachPerson(sql, raced, email, contactName, input.now);
  }
}

/** Stores the next step on the open deal. A named time wins, then a booking offer, then the brief. */
export async function noteProspectTurn(
  sql: Sql,
  input: {
    organizationId: string;
    brief: string | null;
    dueText: string | null;
    bookingOffered: boolean;
    now: number;
  },
): Promise<void> {
  const due = input.dueText?.trim() || null;
  const brief = input.brief?.trim() || null;
  const step = due ? `Call ${due}` : input.bookingOffered ? "Book a working session" : brief ? brief.slice(0, 200) : null;
  if (!step) return;
  const open = await sql.get<{ id: string }>(
    "SELECT id FROM deals WHERE organization_id = ? AND stage NOT IN ('won', 'lost') ORDER BY updated_at DESC LIMIT 1",
    [input.organizationId],
  );
  if (!open) return;
  await sql.run(
    "UPDATE deals SET next_step = ?, next_step_at = ?, updated_at = ? WHERE id = ?",
    [step, due ? dueMillis(due, input.now) : null, input.now, open.id],
  );
}
