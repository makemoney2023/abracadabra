import { normalizeDomain } from "../../db/crm";
import type { Sql } from "../../db/sql";
import { fileSchemaPackage } from "../schema-work";
import { consumeWorkRequest } from "../client-work";
import { planProjectSpace } from "../project-space";
import { queueReply } from "../lead-routing";

export type ConsumeResult =
  | { ok: true; duplicate: boolean; filled_email?: boolean; leadOrganizationId?: string; kickoffOrganizationId?: string }
  | { ok: false; error: "invalid"; retry: false };

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

type ContactRow = {
  id: string;
  organization_id: string | null;
  email: string | null;
  name: string | null;
};

type DealRow = { id: string; stage: string };

type AppointmentRow = {
  id: string;
  organization_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  starts_at: number;
  status: string;
};

function isUnique(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE");
}

export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (name.length === 0) return null;
  return name.slice(0, 200);
}

export function companyDomain(raw: unknown, email: string | null): string | null {
  const fromField = typeof raw === "string" ? normalizeDomain(raw) : null;
  if (fromField && !FREEMAIL.has(fromField)) return fromField;
  if (!email) return null;
  const host = normalizeDomain(email.split("@")[1] ?? "");
  if (!host || FREEMAIL.has(host)) return null;
  return host;
}

function asRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

function jsonText(value: unknown): string {
  if (value == null) return "{}";
  return JSON.stringify(value);
}

function bookingStatus(kind: unknown): string | null {
  if (kind === "created" || kind === "scheduled" || kind === "booked") return "booked";
  if (kind === "rescheduled") return "rescheduled";
  if (kind === "cancelled" || kind === "canceled") return "cancelled";
  if (kind === "done") return "done";
  if (kind === "no_show") return "no_show";
  return null;
}

function cleanStarts(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim().length > 0) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function callIsLive(status: string): boolean {
  return status === "booked" || status === "rescheduled";
}

export type BookingMail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  headers?: Record<string, string>;
};

export type BookingMailer = {
  send(message: BookingMail): Promise<void>;
};

const APP_ADDRESS = "hq@mail.abra-ca-dabra.app";

/** Booking confirmations come from the app address in HANDOFF_FROM_EMAIL, named Abracadabra HQ. */
export function bookingFrom(): string {
  const address = process.env.HANDOFF_FROM_EMAIL?.trim() || APP_ADDRESS;
  return `Abracadabra HQ <${address}>`;
}

/** UTC clock time for a booking confirmation. Seconds are dropped. */
export function formatSessionUtc(startsAt: number): string {
  const date = new Date(startsAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

async function sendBookingConfirmation(
  sql: Sql,
  mailer: BookingMailer,
  input: { organizationId: string; email: string; externalId: string; startsAt: number },
  now: number,
): Promise<void> {
  const sent = await sql.get<{ id: string }>(
    `SELECT id FROM activities
     WHERE kind = 'agent.reply'
       AND json_extract(data_json, '$.external_id') = ?
       AND cast(json_extract(data_json, '$.starts_at') AS INTEGER) = ?
     LIMIT 1`,
    [input.externalId, input.startsAt],
  );
  if (sent) return;
  const thread = await sql.get<{ thread_id: string }>(
    `SELECT thread_id FROM work_requests
     WHERE organization_id = ? AND channel = 'email'
     ORDER BY updated_at DESC LIMIT 1`,
    [input.organizationId],
  );
  const text = `Your working session is ${formatSessionUtc(input.startsAt)}.`;
  await mailer.send({
    from: bookingFrom(),
    to: input.email,
    subject: "Your working session",
    text,
    headers: thread?.thread_id
      ? { "In-Reply-To": thread.thread_id, References: thread.thread_id }
      : undefined,
  });
  await sql.run(
    `INSERT INTO activities (
       id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
     ) VALUES (?, ?, 'agent.reply', 'agent', 'client-desk', ?, ?, ?)`,
    [crypto.randomUUID(), input.organizationId, text, JSON.stringify({ external_id: input.externalId, starts_at: input.startsAt }), now],
  );
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

async function contactByEmail(sql: Sql, email: string): Promise<ContactRow | undefined> {
  return sql.get<ContactRow>(
    "SELECT id, organization_id, email, name FROM contacts WHERE email = ?",
    [email],
  );
}

async function orgByDomain(
  sql: Sql,
  domain: string,
): Promise<{ id: string; name: string } | undefined> {
  return sql.get<{ id: string; name: string }>(
    "SELECT id, name FROM organizations WHERE domain = ? AND archived_at IS NULL",
    [domain],
  );
}

/** Unarchives an archived org and logs it. Returns true when one was reopened. */
async function reopenArchivedOrg(
  sql: Sql,
  input: { where: "domain" | "id"; value: string; now: number },
): Promise<boolean> {
  const row = await sql.get<{ id: string }>(
    `SELECT id FROM organizations WHERE ${input.where} = ? AND archived_at IS NOT NULL`,
    [input.value],
  );
  if (!row) return false;
  await sql.run("UPDATE organizations SET archived_at = NULL, updated_at = ? WHERE id = ?", [input.now, row.id]);
  await sql.run(
    `INSERT INTO activities (
       id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
     ) VALUES (?, ?, 'org.reopened', 'agent', 'bdr', ?, ?, ?)`,
    [crypto.randomUUID(), row.id, "Reopened an archived org for a new BDR lead.", JSON.stringify({ reason: "bdr_lead" }), input.now],
  );
  return true;
}

async function openDeal(sql: Sql, organizationId: string): Promise<DealRow | undefined> {
  return sql.get<DealRow>(
    `SELECT id, stage FROM deals
     WHERE organization_id = ? AND stage NOT IN ('won', 'lost')
     ORDER BY updated_at DESC LIMIT 1`,
    [organizationId],
  );
}

async function hasPrimary(sql: Sql, organizationId: string): Promise<boolean> {
  const row = await sql.get<{ id: string }>(
    "SELECT id FROM contacts WHERE organization_id = ? AND is_primary = 1 LIMIT 1",
    [organizationId],
  );
  return Boolean(row);
}

async function insertOrg(
  sql: Sql,
  input: { name: string; domain: string | null; now: number },
): Promise<string> {
  const id = crypto.randomUUID();
  const website = input.domain ? `https://${input.domain}` : null;
  await sql.run(
    `INSERT INTO organizations (id, name, domain, website, kind, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'lead', ?, ?)`,
    [id, input.name, input.domain, website, input.now, input.now],
  );
  return id;
}

async function insertContact(
  sql: Sql,
  input: {
    organizationId: string;
    name: string | null;
    email: string | null;
    primary: boolean;
    now: number;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO contacts (id, organization_id, name, email, is_primary, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.organizationId, input.name, input.email, input.primary ? 1 : 0, input.now, input.now],
  );
  return id;
}

async function insertDeal(
  sql: Sql,
  input: { organizationId: string; title: string; stage: string; source: string; now: number },
): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO deals (id, organization_id, title, stage, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.organizationId, input.title, input.stage, input.source, input.now, input.now],
  );
  return id;
}

async function insertActivity(
  sql: Sql,
  input: {
    organizationId: string;
    contactId: string | null;
    dealId: string | null;
    kind: string;
    body: string;
    data: Record<string, unknown>;
    now: number;
  },
): Promise<void> {
  await sql.run(
    `INSERT INTO activities (
       id, organization_id, contact_id, deal_id, kind, actor_kind, body, data_json, created_at
     ) VALUES (?, ?, ?, ?, ?, 'system', ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.organizationId,
      input.contactId,
      input.dealId,
      input.kind,
      input.body,
      JSON.stringify(input.data),
      input.now,
    ],
  );
}

function leadName(name: string | null, domain: string | null): string {
  return name ?? domain ?? "Lead";
}

function bookingBody(status: string): string {
  if (status === "rescheduled") return "Moved a call.";
  if (status === "cancelled") return "Cancelled a call.";
  if (status === "done") return "Finished a call.";
  if (status === "no_show") return "Missed a call.";
  return "Booked a call.";
}

async function placeLead(
  sql: Sql,
  input: { email: string | null; name: string | null; domain: string | null; now: number; orgName?: string | null },
): Promise<{ organizationId: string; contactId: string; created: boolean }> {
  if (input.email) {
    const known = await contactByEmail(sql, input.email);
    if (known?.organization_id) {
      return { organizationId: known.organization_id, contactId: known.id, created: false };
    }
  }
  const existing = input.domain ? await orgByDomain(sql, input.domain) : undefined;
  if (existing) {
    const primary = !(await hasPrimary(sql, existing.id));
    const contactId = await insertContact(sql, {
      organizationId: existing.id,
      name: input.name,
      email: input.email,
      primary,
      now: input.now,
    });
    return { organizationId: existing.id, contactId, created: false };
  }
  const organizationId = await insertOrg(sql, {
    name: input.orgName || leadName(input.name, input.domain),
    domain: input.domain,
    now: input.now,
  });
  const contactId = await insertContact(sql, {
    organizationId,
    name: input.name,
    email: input.email,
    primary: true,
    now: input.now,
  });
  return { organizationId, contactId, created: true };
}

async function consumeAssessment(sql: Sql, payload: unknown, now: number): Promise<ConsumeResult> {
  const body = asRecord(payload);
  const assessmentId = typeof body?.assessment_id === "string" ? body.assessment_id.trim() : "";
  if (!assessmentId) return { ok: false, error: "invalid", retry: false };
  const email = cleanEmail(body?.email);
  const name = cleanName(body?.name);
  const domain = companyDomain(body?.domain, email);
  if (!email && !domain) return { ok: false, error: "invalid", retry: false };

  const existing = await sql.get<{ id: string; contact_id: string | null; deal_id: string | null }>(
    "SELECT id, contact_id, deal_id FROM assessments WHERE id = ?",
    [assessmentId],
  );
  if (existing) {
    if (!email || !existing.contact_id) return { ok: true, duplicate: true };
    const contact = await sql.get<ContactRow>(
      "SELECT id, organization_id, email, name FROM contacts WHERE id = ?",
      [existing.contact_id],
    );
    if (!contact || contact.email) return { ok: true, duplicate: true };
    try {
      await withTx(sql, async () => {
        await sql.run(
          "UPDATE contacts SET email = ?, name = ?, updated_at = ? WHERE id = ? AND email IS NULL",
          [email, name ?? contact.name, now, contact.id],
        );
        if (name && contact.organization_id) {
          const org = await sql.get<{ name: string; domain: string | null }>(
            "SELECT name, domain FROM organizations WHERE id = ?",
            [contact.organization_id],
          );
          if (org && (org.name === org.domain || org.name === "Lead")) {
            await sql.run("UPDATE organizations SET name = ?, updated_at = ? WHERE id = ?", [
              name,
              now,
              contact.organization_id,
            ]);
          }
        }
        // The email just arrived, so the reply can go out now.
        if (existing.deal_id) await queueReply(sql, { dealId: existing.deal_id, kind: "readiness_check", now });
      });
    } catch (error) {
      if (isUnique(error)) return { ok: false, error: "invalid", retry: false };
      throw error;
    }
    return { ok: true, duplicate: true, filled_email: true };
  }

  const totalScore = typeof body?.total_score === "number" ? body.total_score : null;
  const completedAt = typeof body?.completed_at === "number" ? body.completed_at : now;
  const reportUrl = typeof body?.report_url === "string" ? body.report_url : null;
  let leadOrganizationId: string | undefined;

  try {
    await withTx(sql, async () => {
      const placed = await placeLead(sql, { email, name, domain, now });
      let deal = await openDeal(sql, placed.organizationId);
      if (!deal) {
        leadOrganizationId = placed.organizationId;
        const dealId = await insertDeal(sql, {
          organizationId: placed.organizationId,
          title: `${leadName(name, domain)} readiness check`,
          stage: "new",
          source: "readiness_check",
          now,
        });
        deal = { id: dealId, stage: "new" };
      }
      await sql.run(
        `INSERT INTO assessments (
           id, organization_id, contact_id, deal_id, domain, answers_json, scores_json,
           total_score, utm_json, report_url, completed_at, received_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assessmentId,
          placed.organizationId,
          placed.contactId,
          deal.id,
          domain,
          jsonText(body?.answers),
          jsonText(body?.scores),
          totalScore,
          body?.utm == null ? null : JSON.stringify(body.utm),
          reportUrl,
          completedAt,
          now,
        ],
      );
      await insertActivity(sql, {
        organizationId: placed.organizationId,
        contactId: placed.contactId,
        dealId: deal.id,
        kind: "assessment",
        body: "Finished the readiness check.",
        data: { assessment_id: assessmentId, total_score: totalScore },
        now,
      });
      if (email) await queueReply(sql, { dealId: deal.id, kind: "readiness_check", now });
      await sql.run(
        "INSERT INTO intake_receipts (source, external_id, received_at) VALUES ('assessment', ?, ?)",
        [assessmentId, now],
      );
    });
  } catch (error) {
    if (isUnique(error)) return { ok: true, duplicate: true };
    throw error;
  }
  return { ok: true, duplicate: false, leadOrganizationId };
}

async function moveDealToCall(sql: Sql, deal: DealRow, now: number): Promise<void> {
  if (deal.stage !== "new" && deal.stage !== "contacted") return;
  await sql.run("UPDATE deals SET stage = 'call_booked', updated_at = ? WHERE id = ?", [now, deal.id]);
}

async function consumeBooking(
  sql: Sql,
  payload: unknown,
  now: number,
  mailer?: BookingMailer | null,
): Promise<ConsumeResult> {
  const body = asRecord(payload);
  const externalId = typeof body?.external_id === "string" ? body.external_id.trim() : "";
  const startsAt = cleanStarts(body?.starts_at);
  const status = bookingStatus(body?.kind);
  if (!externalId || startsAt == null || !status) return { ok: false, error: "invalid", retry: false };
  const email = cleanEmail(body?.email);
  const name = cleanName(body?.name);
  const domain = companyDomain(body?.domain, email);

  const current = await sql.get<AppointmentRow>(
    `SELECT id, organization_id, contact_id, deal_id, starts_at, status
     FROM appointments WHERE provider = 'calcom' AND external_id = ?`,
    [externalId],
  );
  if (current && current.status === status && current.starts_at === startsAt) {
    await confirmLiveBooking(sql, mailer, { externalId, startsAt, status, email }, now);
    return { ok: true, duplicate: true };
  }
  if (!current && !email && !domain) return { ok: false, error: "invalid", retry: false };
  let leadOrganizationId: string | undefined;

  try {
    await withTx(sql, async () => {
      let organizationId = current?.organization_id ?? null;
      let contactId = current?.contact_id ?? null;
      let dealId = current?.deal_id ?? null;

      if (!organizationId) {
        const placed = await placeLead(sql, { email, name, domain, now });
        organizationId = placed.organizationId;
        contactId = placed.contactId;
      } else if (email && !contactId) {
        const known = await contactByEmail(sql, email);
        contactId = known?.id ?? contactId;
      }

      let deal = dealId
        ? await sql.get<DealRow>("SELECT id, stage FROM deals WHERE id = ?", [dealId])
        : await openDeal(sql, organizationId);
      if (!deal) {
        leadOrganizationId = organizationId ?? undefined;
        const createdId = await insertDeal(sql, {
          organizationId,
          title: `${leadName(name, domain)} call`,
          stage: callIsLive(status) ? "call_booked" : "new",
          source: "calcom",
          now,
        });
        deal = { id: createdId, stage: callIsLive(status) ? "call_booked" : "new" };
      } else if (callIsLive(status)) {
        await moveDealToCall(sql, deal, now);
      }
      dealId = deal.id;

      if (current) {
        await sql.run(
          `UPDATE appointments
           SET status = ?, starts_at = ?, organization_id = ?, contact_id = ?, deal_id = ?
           WHERE id = ?`,
          [status, startsAt, organizationId, contactId, dealId, current.id],
        );
      } else {
        await sql.run(
          `INSERT INTO appointments (
             id, provider, external_id, organization_id, contact_id, deal_id, starts_at, status
           ) VALUES (?, 'calcom', ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), externalId, organizationId, contactId, dealId, startsAt, status],
        );
      }
      await insertActivity(sql, {
        organizationId,
        contactId,
        dealId,
        kind: "call",
        body: bookingBody(status),
        data: { external_id: externalId, starts_at: startsAt, status },
        now,
      });
      await sql.run(
        `INSERT INTO intake_receipts (source, external_id, received_at)
         SELECT 'booking', ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM intake_receipts WHERE source = 'booking' AND external_id = ?
         )`,
        [externalId, now, externalId],
      );
    });
  } catch (error) {
    if (isUnique(error)) {
      await confirmLiveBooking(sql, mailer, { externalId, startsAt, status, email }, now);
      return { ok: true, duplicate: true };
    }
    throw error;
  }
  await confirmLiveBooking(sql, mailer, { externalId, startsAt, status, email }, now);
  return { ok: true, duplicate: false, leadOrganizationId };
}

async function confirmLiveBooking(
  sql: Sql,
  mailer: BookingMailer | null | undefined,
  input: { externalId: string; startsAt: number; status: string; email: string | null },
  now: number,
): Promise<void> {
  if (!mailer || !callIsLive(input.status) || !input.email) return;
  const row = await sql.get<{ organization_id: string | null }>(
    `SELECT organization_id FROM appointments
     WHERE provider = 'calcom' AND external_id = ? AND status = ? AND starts_at = ?`,
    [input.externalId, input.status, input.startsAt],
  );
  if (!row?.organization_id) return;
  await sendBookingConfirmation(
    sql,
    mailer,
    {
      organizationId: row.organization_id,
      email: input.email,
      externalId: input.externalId,
      startsAt: input.startsAt,
    },
    now,
  );
}

function textList(raw: unknown): string[] {
  if (typeof raw === "string") return raw.trim() ? [raw.trim().slice(0, 500)] : [];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 500))
    .slice(0, 50);
}

/** A BDR agent prospect. Opens a lead and a deal from source bdr. The schema scan starts in the queue handler. */
async function consumeLead(sql: Sql, payload: unknown, now: number): Promise<ConsumeResult> {
  const body = asRecord(payload);
  const externalId = typeof body?.external_id === "string" ? body.external_id.trim().slice(0, 200) : "";
  if (!externalId) return { ok: false, error: "invalid", retry: false };
  const email = cleanEmail(body?.email);
  const domain = companyDomain(body?.domain ?? body?.website, email);
  if (!email && !domain) return { ok: false, error: "invalid", retry: false };
  const receipt = await sql.get<{ external_id: string }>(
    "SELECT external_id FROM intake_receipts WHERE source = 'lead' AND external_id = ?",
    [externalId],
  );
  if (receipt) return { ok: true, duplicate: true };
  const company = cleanName(body?.company) ?? cleanName(body?.name);
  const contactName = cleanName(body?.contact_name);
  const source = cleanName(body?.source) ?? "bdr";
  const fit = typeof body?.bdr_fit_score === "number" ? body.bdr_fit_score : null;
  const data = {
    external_id: externalId,
    company,
    website: cleanName(body?.website),
    industry: cleanName(body?.industry),
    location: cleanName(body?.location),
    contact_name: contactName,
    contact_title: cleanName(body?.contact_title),
    fit_reasons: textList(body?.fit_reasons),
    signals: textList(body?.signals),
    source_urls: textList(body?.source_urls),
    bdr_fit_score: fit,
    source,
  };
  // An archived org still owns its domain (organizations.domain is UNIQUE), so reopen it
  // instead of inserting a second org and tripping the constraint. This runs before the
  // transaction because D1 buffers writes until COMMIT, so reads inside it see the old row.
  const knownContact = email ? await contactByEmail(sql, email) : undefined;
  if (knownContact?.organization_id) {
    await reopenArchivedOrg(sql, { where: "id", value: knownContact.organization_id, now });
  } else if (domain && !(await orgByDomain(sql, domain))) {
    await reopenArchivedOrg(sql, { where: "domain", value: domain, now });
  }
  let leadOrganizationId: string | undefined;
  try {
    await withTx(sql, async () => {
      const placed = await placeLead(sql, { email, name: contactName ?? company, domain, now });
      if (placed.created && company) {
        await sql.run("UPDATE organizations SET name = ?, updated_at = ? WHERE id = ?", [company, now, placed.organizationId]);
      }
      if (placed.created && data.website) {
        const site = /^https?:\/\//i.test(data.website) ? data.website : `https://${data.website}`;
        await sql.run("UPDATE organizations SET website = ? WHERE id = ?", [site, placed.organizationId]);
      }
      let deal = await openDeal(sql, placed.organizationId);
      if (!deal) {
        leadOrganizationId = placed.organizationId;
        const dealId = await insertDeal(sql, {
          organizationId: placed.organizationId,
          title: `${company ?? leadName(contactName, domain)} prospect`,
          stage: "new",
          source,
          now,
        });
        deal = { id: dealId, stage: "new" };
      }
      await sql.run(
        `INSERT INTO activities (
           id, organization_id, contact_id, deal_id, kind, actor_kind, actor_id, body, data_json, created_at
         ) VALUES (?, ?, ?, ?, 'lead.prospected', 'agent', 'bdr', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          placed.organizationId,
          placed.contactId,
          deal.id,
          "BDR found this prospect.",
          JSON.stringify(data),
          now,
        ],
      );
      await sql.run(
        "INSERT INTO intake_receipts (source, external_id, received_at) VALUES ('lead', ?, ?)",
        [externalId, now],
      );
    });
  } catch (error) {
    // Only a receipt that landed concurrently is a real duplicate. Anything else must surface
    // so the queue retries it instead of acking a lead that was never stored.
    if (isUnique(error)) {
      const raced = await sql.get<{ external_id: string }>(
        "SELECT external_id FROM intake_receipts WHERE source = 'lead' AND external_id = ?",
        [externalId],
      );
      if (raced) return { ok: true, duplicate: true };
    }
    console.error("lead intake insert failed", {
      external_id: externalId,
      domain,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  return { ok: true, duplicate: false, leadOrganizationId };
}

function plainValue(raw: unknown, depth = 0): unknown {
  if (raw == null || depth > 4) return null;
  if (typeof raw === "string") return raw.slice(0, 4000);
  if (typeof raw === "number" || typeof raw === "boolean") return raw;
  if (Array.isArray(raw)) return raw.slice(0, 100).map((item) => plainValue(item, depth + 1));
  if (typeof raw === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, 50)) {
      out[key.slice(0, 100)] = plainValue(value, depth + 1);
    }
    return out;
  }
  return null;
}

const ENRICHMENT_FIELDS = ["company_summary", "decision_makers", "pain_points", "tech_stack", "talking_points", "sources"] as const;

/** Account Research enrichment. Logs lead.enriched and moves ready_for_outbound to enriched. */
async function consumeEnrichment(sql: Sql, payload: unknown, now: number): Promise<ConsumeResult> {
  const body = asRecord(payload);
  const externalId = typeof body?.external_id === "string" ? body.external_id.trim().slice(0, 200) : "";
  const dealId = typeof body?.deal_id === "string" ? body.deal_id.trim() : "";
  const domain = typeof body?.domain === "string" ? normalizeDomain(body.domain) : null;
  if (!externalId || (!dealId && !domain)) return { ok: false, error: "invalid", retry: false };
  const receipt = await sql.get<{ external_id: string }>(
    "SELECT external_id FROM intake_receipts WHERE source = 'enrichment' AND external_id = ?",
    [externalId],
  );
  if (receipt) return { ok: true, duplicate: true };
  const deal = dealId
    ? await sql.get<{ id: string; organization_id: string; routing_status: string | null }>(
        "SELECT id, organization_id, routing_status FROM deals WHERE id = ?",
        [dealId],
      )
    : await sql.get<{ id: string; organization_id: string; routing_status: string | null }>(
        `SELECT d.id, d.organization_id, d.routing_status FROM deals d
         JOIN organizations o ON o.id = d.organization_id
         WHERE o.domain = ? AND o.archived_at IS NULL AND d.stage NOT IN ('won', 'lost')
         ORDER BY d.updated_at DESC LIMIT 1`,
        [domain],
      );
  if (!deal) return { ok: false, error: "invalid", retry: false };
  const data: Record<string, unknown> = {
    external_id: externalId,
    deal_id: deal.id,
    brief: typeof body?.brief === "string" ? body.brief.slice(0, 20000) : null,
    enriched_at: typeof body?.enriched_at === "string" ? body.enriched_at : new Date(now).toISOString(),
  };
  for (const field of ENRICHMENT_FIELDS) data[field] = plainValue(body?.[field]);
  try {
    await withTx(sql, async () => {
      await sql.run(
        `INSERT INTO activities (
           id, organization_id, deal_id, kind, actor_kind, actor_id, body, data_json, created_at
         ) VALUES (?, ?, ?, 'lead.enriched', 'agent', 'account-research', ?, ?, ?)`,
        [crypto.randomUUID(), deal.organization_id, deal.id, "Account Research enriched this lead.", JSON.stringify(data), now],
      );
      if (deal.routing_status === "ready_for_outbound") {
        await sql.run("UPDATE deals SET routing_status = 'enriched', updated_at = ? WHERE id = ?", [now, deal.id]);
      }
      await sql.run(
        "INSERT INTO intake_receipts (source, external_id, received_at) VALUES ('enrichment', ?, ?)",
        [externalId, now],
      );
    });
  } catch (error) {
    if (isUnique(error)) return { ok: true, duplicate: true };
    throw error;
  }
  return { ok: true, duplicate: false };
}

type TargetDeal = { id: string; organization_id: string; stage: string; routing_status: string | null };

async function targetDeal(sql: Sql, body: Record<string, unknown> | null): Promise<TargetDeal | undefined> {
  const dealId = typeof body?.deal_id === "string" ? body.deal_id.trim() : "";
  if (dealId) {
    return sql.get<TargetDeal>("SELECT id, organization_id, stage, routing_status FROM deals WHERE id = ?", [dealId]);
  }
  const domain = typeof body?.domain === "string" ? normalizeDomain(body.domain) : null;
  if (!domain) return undefined;
  return sql.get<TargetDeal>(
    `SELECT d.id, d.organization_id, d.stage, d.routing_status FROM deals d
     JOIN organizations o ON o.id = d.organization_id
     WHERE o.domain = ? AND o.archived_at IS NULL AND d.stage NOT IN ('won', 'lost')
     ORDER BY d.updated_at DESC LIMIT 1`,
    [domain],
  );
}

async function seenReceipt(sql: Sql, source: string, externalId: string): Promise<boolean> {
  const row = await sql.get<{ external_id: string }>(
    "SELECT external_id FROM intake_receipts WHERE source = ? AND external_id = ?",
    [source, externalId],
  );
  return Boolean(row);
}

/**
 * Sales Outbound reports a send. Moves new to contacted and logs lead.contacted.
 * A reply_needed deal (Readiness Check or /start/ inquiry) moves to replied, so it leaves that export.
 */
async function consumeOutreach(sql: Sql, payload: unknown, now: number): Promise<ConsumeResult> {
  const body = asRecord(payload);
  const externalId = typeof body?.external_id === "string" ? body.external_id.trim().slice(0, 200) : "";
  const channel = body?.channel === "email" || body?.channel === "linkedin" ? body.channel : null;
  if (!externalId || !channel) return { ok: false, error: "invalid", retry: false };
  if (await seenReceipt(sql, "outreach", externalId)) return { ok: true, duplicate: true };
  const deal = await targetDeal(sql, body);
  if (!deal) return { ok: false, error: "invalid", retry: false };
  const sentAt = typeof body?.sent_at === "string" ? body.sent_at : new Date(now).toISOString();
  const summary = typeof body?.summary === "string" ? body.summary.slice(0, 4000) : null;
  try {
    await withTx(sql, async () => {
      if (deal.stage === "new") {
        await sql.run("UPDATE deals SET stage = 'contacted', updated_at = ? WHERE id = ?", [now, deal.id]);
      }
      if (deal.routing_status === "reply_needed") {
        await sql.run("UPDATE deals SET routing_status = 'replied', updated_at = ? WHERE id = ?", [now, deal.id]);
      }
      await sql.run(
        `INSERT INTO activities (
           id, organization_id, deal_id, kind, actor_kind, actor_id, body, data_json, created_at
         ) VALUES (?, ?, ?, 'lead.contacted', 'agent', 'sales-outbound', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          deal.organization_id,
          deal.id,
          summary ?? `Contacted by ${channel}.`,
          JSON.stringify({ external_id: externalId, deal_id: deal.id, channel, sent_at: sentAt, summary }),
          now,
        ],
      );
      await sql.run("INSERT INTO intake_receipts (source, external_id, received_at) VALUES ('outreach', ?, ?)", [externalId, now]);
    });
  } catch (error) {
    if (isUnique(error)) return { ok: true, duplicate: true };
    throw error;
  }
  return { ok: true, duplicate: false };
}

/** Sales Outbound reports a won deal. Stage won, org becomes a client, logs deal.won. */
async function consumeDealClosed(sql: Sql, payload: unknown, now: number): Promise<ConsumeResult> {
  const body = asRecord(payload);
  const externalId = typeof body?.external_id === "string" ? body.external_id.trim().slice(0, 200) : "";
  if (!externalId) return { ok: false, error: "invalid", retry: false };
  if (await seenReceipt(sql, "deal_closed", externalId)) return { ok: true, duplicate: true };
  const deal = await targetDeal(sql, body);
  if (!deal || deal.stage === "lost") return { ok: false, error: "invalid", retry: false };
  const closedRaw = typeof body?.closed_at === "string" ? Date.parse(body.closed_at) : NaN;
  const closedAt = Number.isFinite(closedRaw) ? closedRaw : now;
  const valueCents = typeof body?.value_cents === "number" && Number.isInteger(body.value_cents) ? body.value_cents : null;
  const data = {
    external_id: externalId,
    deal_id: deal.id,
    closed_at: new Date(closedAt).toISOString(),
    value_cents: valueCents,
    products: plainValue(body?.products ?? body?.services ?? null),
    notes: typeof body?.notes === "string" ? body.notes.slice(0, 20000) : null,
  };
  // A won deal gets its project and Space the same way a client work request does. Reads happen
  // before the transaction because D1 buffers writes until COMMIT.
  const dealProject = await sql.get<{ id: string }>(
    "SELECT id FROM projects WHERE deal_id = ? AND status != 'cancelled' ORDER BY created_at LIMIT 1",
    [deal.id],
  );
  const dealTitle = await sql.get<{ title: string }>("SELECT title FROM deals WHERE id = ?", [deal.id]);
  const plan = await planProjectSpace(sql, {
    organizationId: deal.organization_id,
    name: dealTitle?.title ?? "Client project",
    projectId: dealProject?.id ?? null,
    dealId: deal.id,
    status: "planned",
    now,
  });
  try {
    await withTx(sql, async () => {
      for (const write of plan.writes) await sql.run(write.statement, write.params);
      await sql.run(
        `UPDATE deals SET stage = 'won', closed_at = ?, value_cents = COALESCE(?, value_cents), updated_at = ?
         WHERE id = ?`,
        [closedAt, valueCents, now, deal.id],
      );
      await sql.run("UPDATE organizations SET kind = 'client', updated_at = ? WHERE id = ? AND kind = 'lead'", [
        now,
        deal.organization_id,
      ]);
      await sql.run(
        `INSERT INTO activities (
           id, organization_id, deal_id, kind, actor_kind, actor_id, body, data_json, created_at
         ) VALUES (?, ?, ?, 'deal.won', 'agent', 'sales-outbound', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          deal.organization_id,
          deal.id,
          "Deal won.",
          JSON.stringify({ ...data, project_id: plan.projectId, workspace_id: plan.workspaceId, created_project: plan.createdProject, created_space: plan.createdSpace }),
          now,
        ],
      );
      await sql.run("INSERT INTO intake_receipts (source, external_id, received_at) VALUES ('deal_closed', ?, ?)", [externalId, now]);
    });
  } catch (error) {
    if (isUnique(error)) return { ok: true, duplicate: true };
    throw error;
  }
  return { ok: true, duplicate: false };
}

function inquiryText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return text ? text.slice(0, max) : null;
}

/**
 * The website's /start/ form (abracadabra-marketing worker). Opens or reuses an open deal, logs a
 * project_inquiry activity with the form fields, and queues the reply (routing_status reply_needed).
 * A new deal gets source start_form. Dedup on external_id.
 */
async function consumeProjectInquiry(sql: Sql, payload: unknown, now: number): Promise<ConsumeResult> {
  const body = asRecord(payload);
  const externalId = inquiryText(body?.external_id, 200) ?? "";
  const email = cleanEmail(body?.email);
  if (!externalId || !email) return { ok: false, error: "invalid", retry: false };
  if (await seenReceipt(sql, "project_inquiry", externalId)) return { ok: true, duplicate: true };
  const name = cleanName(body?.name);
  const company = inquiryText(body?.company, 160);
  const domain = companyDomain(body?.domain, email);
  const submittedRaw = typeof body?.submitted_at === "string" ? Date.parse(body.submitted_at) : NaN;
  const data = {
    external_id: externalId,
    name,
    email,
    company,
    need: inquiryText(body?.need, 40),
    budget: inquiryText(body?.budget, 40),
    timeline: inquiryText(body?.timeline, 40),
    message: inquiryText(body?.message, 4000),
    page: inquiryText(body?.page, 300),
    submitted_at: new Date(Number.isFinite(submittedRaw) ? submittedRaw : now).toISOString(),
  };
  // Reads before the transaction: D1 buffers writes until COMMIT, so a read inside it would not see them.
  const known = await contactByEmail(sql, email);
  const knownOrg = known?.organization_id ?? (domain ? (await orgByDomain(sql, domain))?.id : undefined);
  const existingDeal = knownOrg ? await openDeal(sql, knownOrg) : undefined;
  let leadOrganizationId: string | undefined;
  try {
    await withTx(sql, async () => {
      const placed = await placeLead(sql, { email, name, domain, now, orgName: company });
      let dealId = existingDeal?.id;
      if (!dealId) {
        if (placed.created) leadOrganizationId = placed.organizationId;
        dealId = await insertDeal(sql, {
          organizationId: placed.organizationId,
          title: `${company ?? leadName(name, domain)} project inquiry`,
          stage: "new",
          source: "start_form",
          now,
        });
      }
      await insertActivity(sql, {
        organizationId: placed.organizationId,
        contactId: placed.contactId,
        dealId,
        kind: "project_inquiry",
        body: `Asked about a project on the website${data.need ? ` (${data.need})` : ""}.`,
        data: { ...data, deal_id: dealId },
        now,
      });
      await queueReply(sql, { dealId, kind: "start_form", now });
      await sql.run("INSERT INTO intake_receipts (source, external_id, received_at) VALUES ('project_inquiry', ?, ?)", [
        externalId,
        now,
      ]);
    });
  } catch (error) {
    if (isUnique(error)) return { ok: true, duplicate: true };
    throw error;
  }
  return { ok: true, duplicate: false, leadOrganizationId };
}

export async function consumeIntake(
  sql: Sql,
  message: { source: string; payload: unknown },
  now: number,
  mailer?: BookingMailer | null,
): Promise<ConsumeResult> {
  if (message.source === "assessment") return consumeAssessment(sql, message.payload, now);
  if (message.source === "booking") return consumeBooking(sql, message.payload, now, mailer);
  if (message.source === "lead") return consumeLead(sql, message.payload, now);
  if (message.source === "outreach") return consumeOutreach(sql, message.payload, now);
  if (message.source === "deal_closed") return consumeDealClosed(sql, message.payload, now);
  if (message.source === "enrichment") return consumeEnrichment(sql, message.payload, now);
  if (message.source === "schema") return fileSchemaPackage(sql, message.payload, now);
  if (message.source === "work_request") return consumeWorkRequest(sql, message.payload, now);
  if (message.source === "project_inquiry") return consumeProjectInquiry(sql, message.payload, now);
  return { ok: false, error: "invalid", retry: false };
}
