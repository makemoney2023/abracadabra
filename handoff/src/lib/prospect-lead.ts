import { normalizeDomain } from "@/db/crm";
import type { Sql } from "@/db/sql";
import { dueMillis } from "./channel-plan";
import { leadScanTarget, startLeadSchemaScan, type ScanQueue } from "./lead-schema";

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

const PRICE = /\$\s?\d|\b\d[\d,]*\s*(?:dollars|usd)\b/i;
const BUDGET = /\b(budget|price range|spend|investment)\b/i;
const YES = /^(please\s+)?(yes|yep|yeah|confirm|confirmed)[.!]?$/i;
const NO = /^(no|nope|wrong|not me)[.!]?$/i;
const PENDING_BODY = "Waiting to confirm this address.";
const DECLINED_BODY = "This address declined the client match.";

export type OrgKind = "lead" | "client" | "past_client" | "partner";

export type OpenedProspect = {
  organizationId: string | null;
  name: string;
  created: boolean;
  kind: OrgKind;
  pending: boolean;
  declined?: boolean;
  organizations?: { id: string; name: string }[];
};

type DomainOrg = { id: string; name: string; kind: OrgKind };

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

function orgKind(value: string): OrgKind {
  if (value === "client" || value === "past_client" || value === "partner" || value === "lead") return value;
  return "lead";
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

async function prospectByEmail(
  sql: Sql,
  email: string,
): Promise<{ organizationId: string; name: string; kind: OrgKind } | null> {
  const known = await sql.get<{ organization_id: string; name: string; kind: string }>(
    `SELECT c.organization_id, o.name, o.kind
     FROM contacts c
     JOIN organizations o ON o.id = c.organization_id
     WHERE c.email = ? AND o.archived_at IS NULL`,
    [email],
  );
  if (!known?.organization_id) return null;
  return { organizationId: known.organization_id, name: known.name, kind: orgKind(known.kind) };
}

async function organizationsOnDomain(sql: Sql, domain: string): Promise<DomainOrg[]> {
  const rows = await sql.all<{ id: string; name: string; kind: string }>(
    "SELECT id, name, kind FROM organizations WHERE domain = ? AND archived_at IS NULL",
    [domain],
  );
  return rows.map((row) => ({ id: row.id, name: row.name, kind: orgKind(row.kind) }));
}

function sameThread(stored: string | null, threadId: string, references: string): boolean {
  if (!stored) return false;
  if (stored === threadId) return true;
  return references.includes(stored);
}

async function notedThreads(
  sql: Sql,
  input: { body: string; emailField: "pendingEmail" | "declinedEmail"; email: string },
): Promise<{ threadId: string | null }[]> {
  const column = input.emailField === "pendingEmail" ? "$.pendingEmail" : "$.declinedEmail";
  return sql.all<{ threadId: string | null }>(
    `SELECT json_extract(data_json, '$.threadId') AS threadId
     FROM activities
     WHERE kind = 'agent.note' AND body = ?
       AND json_extract(data_json, '${column}') = ?`,
    [input.body, input.email],
  );
}

/** One open confirmation follows the reply even when the client drops the thread root. */
function awaitingReply(
  notes: { threadId: string | null }[],
  threadId: string,
  references: string,
): boolean {
  if (notes.length === 0) return false;
  if (notes.length === 1) return true;
  return notes.some((note) => sameThread(note.threadId, threadId, references));
}

async function writeNote(
  sql: Sql,
  input: { organizationId: string | null; body: string; data: Record<string, unknown>; now: number },
): Promise<void> {
  await sql.run(
    `INSERT INTO activities (
       id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
     ) VALUES (?, ?, 'agent.note', 'agent', 'client-desk', ?, ?, ?)`,
    [crypto.randomUUID(), input.organizationId, input.body, JSON.stringify(input.data), input.now],
  );
}

async function attachPerson(
  sql: Sql,
  org: DomainOrg,
  email: string,
  contactName: string,
  now: number,
): Promise<OpenedProspect> {
  const already = await prospectByEmail(sql, email);
  if (already) return { ...already, created: false, pending: false };
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
  return { organizationId: org.id, name: org.name, created: false, kind: org.kind, pending: false };
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
  return { organizationId, name: input.orgName, created: true, kind: "lead", pending: false };
}

async function recognizeClient(
  sql: Sql,
  clients: DomainOrg[],
  input: { email: string; contactName: string; text: string; subject: string; threadId: string; references: string; now: number },
): Promise<OpenedProspect> {
  const text = input.text.trim();
  if (clients.length > 1) {
    const folded = `${input.subject}\n${text}`.toLowerCase();
    const named = clients.filter((org) => org.name && folded.includes(org.name.toLowerCase()));
    if (named.length === 1) return attachPerson(sql, named[0]!, input.email, input.contactName, input.now);
    return {
      organizationId: null,
      name: "",
      created: false,
      kind: "client",
      pending: true,
      organizations: clients.map((org) => ({ id: org.id, name: org.name })),
    };
  }
  const org = clients[0]!;
  const declined = await notedThreads(sql, { body: DECLINED_BODY, emailField: "declinedEmail", email: input.email });
  if (awaitingReply(declined, input.threadId, input.references)) {
    return { organizationId: null, name: org.name, created: false, kind: org.kind, pending: false, declined: true };
  }
  const pendingNotes = await notedThreads(sql, { body: PENDING_BODY, emailField: "pendingEmail", email: input.email });
  const pending = awaitingReply(pendingNotes, input.threadId, input.references);
  if (pending && YES.test(text)) return attachPerson(sql, org, input.email, input.contactName, input.now);
  if (pending && NO.test(text)) {
    await writeNote(sql, {
      organizationId: org.id,
      body: DECLINED_BODY,
      data: { declinedEmail: input.email, threadId: input.threadId },
      now: input.now,
    });
    return { organizationId: null, name: org.name, created: false, kind: org.kind, pending: false, declined: true };
  }
  if (pendingNotes.length === 0) {
    await writeNote(sql, {
      organizationId: org.id,
      body: PENDING_BODY,
      data: { pendingEmail: input.email, threadId: input.threadId },
      now: input.now,
    });
  }
  return { organizationId: null, name: org.name, created: false, kind: org.kind, pending: true };
}

/** One lead for a company address. A client domain waits for a yes before the contact is added. */
export async function openEmailProspect(
  sql: Sql,
  input: {
    email: string;
    name: string | null;
    now: number;
    text?: string | null;
    subject?: string | null;
    threadId?: string | null;
    references?: string | null;
  },
): Promise<OpenedProspect> {
  const email = cleanEmail(input.email);
  if (!email) throw new Error("invalid email");
  const domain = companyHost(email);
  const known = await prospectByEmail(sql, email);
  if (known) return { ...known, created: false, pending: false };
  const orgName = labelFrom(input.name, email, domain);
  const contactName = input.name?.trim() ? input.name.trim().slice(0, 200) : orgName;
  const text = input.text ?? "";
  const subject = input.subject ?? "";
  const threadId = input.threadId ?? "";
  const references = input.references ?? "";
  const orgs = domain ? await organizationsOnDomain(sql, domain) : [];
  const clients = orgs.filter((org) => org.kind === "client" || org.kind === "past_client");
  try {
    if (clients.length > 0) {
      return await recognizeClient(sql, clients, {
        email,
        contactName,
        text,
        subject,
        threadId,
        references,
        now: input.now,
      });
    }
    const existing = orgs[0];
    if (existing) return await attachPerson(sql, existing, email, contactName, input.now);
    const created = await createLead(sql, { email, contactName, orgName, domain, now: input.now });
    if (!domain && created.organizationId) {
      await writeNote(sql, {
        organizationId: created.organizationId,
        body: email,
        data: { freemail: email },
        now: input.now,
      });
    }
    return created;
  } catch (error) {
    if (!isUnique(error)) throw error;
    const again = await prospectByEmail(sql, email);
    if (again) return { ...again, created: false, pending: false };
    const raced = domain ? await organizationsOnDomain(sql, domain) : [];
    const racedClients = raced.filter((org) => org.kind === "client" || org.kind === "past_client");
    if (racedClients.length > 0) {
      return recognizeClient(sql, racedClients, {
        email,
        contactName,
        text,
        subject,
        threadId,
        references,
        now: input.now,
      });
    }
    const lead = raced[0];
    if (!lead) throw error;
    return attachPerson(sql, lead, email, contactName, input.now);
  }
}

/** Stores the next step on the open deal. A readable time wins, then a booking offer, then the brief. */
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
  const when = due ? dueMillis(due, input.now) : null;
  const step = due
    ? (when != null ? `Call ${due}` : due).slice(0, 200)
    : input.bookingOffered
      ? "Book a working session"
      : brief
        ? brief.slice(0, 200)
        : null;
  if (!step) return;
  const open = await sql.get<{ id: string }>(
    "SELECT id FROM deals WHERE organization_id = ? AND stage NOT IN ('won', 'lost') ORDER BY updated_at DESC LIMIT 1",
    [input.organizationId],
  );
  if (!open) return;
  await sql.run(
    "UPDATE deals SET next_step = ?, next_step_at = ?, updated_at = ? WHERE id = ?",
    [step, when, input.now, open.id],
  );
}

/** A budget in their words. A dollar amount is not stored. */
export async function noteProspectBudget(
  sql: Sql,
  input: { organizationId: string; text: string; now: number },
): Promise<void> {
  const body = input.text.trim();
  if (!body || PRICE.test(body) || !BUDGET.test(body)) return;
  await sql.run(
    `INSERT INTO activities (
       id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
     ) VALUES (?, ?, 'email', 'system', NULL, ?, '{}', ?)`,
    [crypto.randomUUID(), input.organizationId, body.slice(0, 2000), input.now],
  );
}

const OWN_HOST = "abra-ca-dabra.app";

function originAt(text: string, index: number, raw: string): string | null {
  if (index > 0 && text[index - 1] === "@") return null;
  const cleaned = raw.replace(/[),.;:!?]+$/g, "");
  if (cleaned.includes("@")) return null;
  const target = leadScanTarget(cleaned);
  if (!target || FREEMAIL.has(target.domain)) return null;
  if (target.domain === OWN_HOST || target.domain.endsWith(`.${OWN_HOST}`)) return null;
  return target.origin;
}

/** The first website in the message that a schema scan can open. An email address is not a site. */
export function hostInMessage(text: string): string | null {
  for (const match of text.matchAll(/https?:\/\/[^\s<>]+/gi)) {
    const origin = originAt(text, match.index ?? 0, match[0]);
    if (origin) return origin;
  }
  for (const match of text.matchAll(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi)) {
    const origin = originAt(text, match.index ?? 0, match[0]);
    if (origin) return origin;
  }
  return null;
}

async function tableExists(sql: Sql, name: string): Promise<boolean> {
  const row = await sql.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [name],
  );
  return row?.name === name;
}

/** A freemail lead with no site gets one scan when the message names a host. No swarm wake. */
export async function captureProspectWebsite(
  sql: Sql,
  input: { organizationId: string; text: string; now: number; queue?: ScanQueue | null },
): Promise<void> {
  if (!(await tableExists(sql, "readiness_scans"))) return;
  const org = await sql.get<{ kind: string; domain: string | null; website: string | null }>(
    "SELECT kind, domain, website FROM organizations WHERE id = ?",
    [input.organizationId],
  );
  if (!org || org.kind !== "lead" || org.domain || org.website?.trim()) return;
  const existing = await sql.get<{ id: string }>(
    "SELECT id FROM readiness_scans WHERE organization_id = ? LIMIT 1",
    [input.organizationId],
  );
  if (existing) return;
  const origin = hostInMessage(input.text);
  if (!origin) return;
  await sql.run(
    `UPDATE organizations SET website = ?, updated_at = ?
     WHERE id = ? AND (website IS NULL OR trim(website) = '')`,
    [origin, input.now, input.organizationId],
  );
  const again = await sql.get<{ website: string | null }>("SELECT website FROM organizations WHERE id = ?", [
    input.organizationId,
  ]);
  if (!again?.website?.trim()) return;
  const raced = await sql.get<{ id: string }>(
    "SELECT id FROM readiness_scans WHERE organization_id = ? LIMIT 1",
    [input.organizationId],
  );
  if (raced) return;
  await startLeadSchemaScan({
    sql,
    organizationId: input.organizationId,
    website: again.website,
    now: input.now,
    queue: input.queue ?? null,
  });
}
