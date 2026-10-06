import { normalizeDomain } from "../../db/crm";
import type { Sql } from "../../db/sql";

export type ConsumeResult =
  | { ok: true; duplicate: boolean; filled_email?: boolean }
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

function cleanEmail(raw: unknown): string | null {
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

function companyDomain(raw: unknown, email: string | null): string | null {
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
  input: { email: string | null; name: string | null; domain: string | null; now: number },
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
    name: leadName(input.name, input.domain),
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

  const existing = await sql.get<{ id: string; contact_id: string | null }>(
    "SELECT id, contact_id FROM assessments WHERE id = ?",
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

  try {
    await withTx(sql, async () => {
      const placed = await placeLead(sql, { email, name, domain, now });
      let deal = await openDeal(sql, placed.organizationId);
      if (!deal) {
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
      await sql.run(
        "INSERT INTO intake_receipts (source, external_id, received_at) VALUES ('assessment', ?, ?)",
        [assessmentId, now],
      );
    });
  } catch (error) {
    if (isUnique(error)) return { ok: true, duplicate: true };
    throw error;
  }
  return { ok: true, duplicate: false };
}

async function moveDealToCall(sql: Sql, deal: DealRow, now: number): Promise<void> {
  if (deal.stage !== "new" && deal.stage !== "contacted") return;
  await sql.run("UPDATE deals SET stage = 'call_booked', updated_at = ? WHERE id = ?", [now, deal.id]);
}

async function consumeBooking(sql: Sql, payload: unknown, now: number): Promise<ConsumeResult> {
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
    return { ok: true, duplicate: true };
  }
  if (!current && !email && !domain) return { ok: false, error: "invalid", retry: false };

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
    if (isUnique(error)) return { ok: true, duplicate: true };
    throw error;
  }
  return { ok: true, duplicate: false };
}

export async function consumeIntake(
  sql: Sql,
  message: { source: string; payload: unknown },
  now: number,
): Promise<ConsumeResult> {
  if (message.source === "assessment") return consumeAssessment(sql, message.payload, now);
  if (message.source === "booking") return consumeBooking(sql, message.payload, now);
  return { ok: false, error: "invalid", retry: false };
}
