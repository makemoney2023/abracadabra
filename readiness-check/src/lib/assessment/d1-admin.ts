import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { AssessmentAdmin } from "@/lib/assessment/repository";
import type { BoundSql, CheckBindings } from "@/lib/cloudflare/sql";
import { insertScan } from "@/lib/scan/d1-store";

type Filter = { op: "eq" | "gte"; col: string; value: unknown };

type Spec = {
  table: string;
  op: "select" | "insert" | "update" | "upsert";
  columns: string;
  head: boolean;
  values: Record<string, unknown> | null;
  onConflict: string | null;
  filters: Filter[];
  order: { col: string; ascending: boolean } | null;
  limit: number | null;
  returning: boolean;
};

type Chain = {
  select(columns?: string, opts?: { count?: string; head?: boolean }): Chain;
  insert(values: Record<string, unknown>): Chain;
  update(values: Record<string, unknown>): Chain;
  upsert(values: Record<string, unknown>, opts?: { onConflict?: string }): Chain;
  eq(col: string, value: unknown): Chain;
  gte(col: string, value: unknown): Chain;
  order(col: string, opts?: { ascending?: boolean }): Chain;
  limit(n: number): Chain;
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
  single(): Promise<{ data: unknown; error: { message: string } | null }>;
  then<T>(
    resolve: (value: { data: unknown; error: { message: string } | null; count: number | null }) => T,
    reject?: (reason: unknown) => T,
  ): Promise<T>;
};

function blank(table: string): Spec {
  return {
    table,
    op: "select",
    columns: "*",
    head: false,
    values: null,
    onConflict: null,
    filters: [],
    order: null,
    limit: null,
    returning: false,
  };
}

function jsonParse(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function iso(value: unknown): string | null {
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string") return value;
  return null;
}

function millis(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function assessmentRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    public_token: row.public_token,
    config_version: row.config_version,
    status: row.status,
    lead_id: row.lead_id,
    scan_id: row.scan_id,
    domain: row.domain,
    email: row.email,
    name: row.name,
    answers: jsonParse(row.answers_json) ?? {},
    qualifiers: jsonParse(row.qualifiers_json) ?? {},
    scores: jsonParse(row.scores_json),
    utm: jsonParse(row.utm_json) ?? {},
    current_step: row.current_step,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    opted_in_at: row.opted_in_at,
  };
}

function scanRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    public_token: row.public_token,
    status: row.status,
    score_total: row.score_total,
    score_breakdown: jsonParse(row.score_breakdown_json),
    domain: row.domain,
    origin: row.origin,
    source: row.source,
    lead_id: row.organization_id,
    created_at: iso(row.created_at),
  };
}

function where(filters: Filter[], columns: Record<string, string>): { sql: string; args: unknown[] } {
  if (filters.length === 0) return { sql: "", args: [] };
  const parts: string[] = [];
  const args: unknown[] = [];
  for (const filter of filters) {
    const column = columns[filter.col];
    if (!column) throw new Error(`Unknown column ${filter.col}`);
    let value = filter.value;
    if (column === "created_at" && typeof value === "string") value = millis(value);
    parts.push(`${column} ${filter.op === "gte" ? ">=" : "="} ?`);
    args.push(value ?? null);
  }
  return { sql: ` WHERE ${parts.join(" AND ")}`, args };
}

async function runAssessments(db: BoundSql, spec: Spec, single: "many" | "maybe" | "one") {
  const columns: Record<string, string> = {
    id: "id",
    public_token: "public_token",
    status: "status",
    lead_id: "lead_id",
    scan_id: "scan_id",
    domain: "domain",
    email: "email",
    name: "name",
    current_step: "current_step",
    created_at: "created_at",
    updated_at: "updated_at",
    completed_at: "completed_at",
    opted_in_at: "opted_in_at",
  };
  if (spec.op === "insert" && spec.values) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const values = spec.values;
    await db
      .prepare(
        `INSERT INTO check_assessments
          (id, public_token, config_version, status, answers_json, qualifiers_json, utm_json, current_step, created_at, updated_at)
         VALUES (?, ?, ?, 'in_progress', '{}', '{}', ?, ?, ?, ?)`,
      )
      .bind(
        id,
        values.public_token,
        values.config_version,
        JSON.stringify(values.utm ?? {}),
        values.current_step ?? null,
        now,
        now,
      )
      .run();
    const row = await db.prepare("SELECT * FROM check_assessments WHERE id = ?").bind(id).first<Record<string, unknown>>();
    return { data: row ? assessmentRow(row) : null, error: null, count: null };
  }
  if (spec.op === "update" && spec.values) {
    const sets: string[] = [];
    const args: unknown[] = [];
    const jsonCols: Record<string, string> = {
      answers: "answers_json",
      qualifiers: "qualifiers_json",
      scores: "scores_json",
      utm: "utm_json",
    };
    for (const [key, value] of Object.entries(spec.values)) {
      const column = jsonCols[key] ?? columns[key];
      if (!column) throw new Error(`Unknown assessment field ${key}`);
      sets.push(`${column} = ?`);
      args.push(jsonCols[key] ? JSON.stringify(value ?? null) : (value ?? null));
    }
    sets.push("updated_at = ?");
    args.push(new Date().toISOString());
    const clause = where(spec.filters, columns);
    await db.prepare(`UPDATE check_assessments SET ${sets.join(", ")}${clause.sql}`).bind(...args, ...clause.args).run();
    return { data: null, error: null, count: null };
  }
  const clause = where(spec.filters, columns);
  const row = await db
    .prepare(`SELECT * FROM check_assessments${clause.sql} LIMIT 1`)
    .bind(...clause.args)
    .first<Record<string, unknown>>();
  if (single === "one" && !row) return { data: null, error: { message: "not found" }, count: null };
  return { data: row ? assessmentRow(row) : null, error: null, count: null };
}

async function runEvents(db: BoundSql, spec: Spec) {
  if (spec.op === "insert" && spec.values) {
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO check_assessment_events (id, assessment_id, kind, data_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, spec.values.assessment_id, spec.values.kind, JSON.stringify(spec.values.data ?? {}), new Date().toISOString())
      .run();
    return { data: null, error: null, count: null };
  }
  const rows = await db
    .prepare(
      `SELECT id, kind, data_json, created_at FROM check_assessment_events
       WHERE assessment_id = ? ORDER BY created_at ASC`,
    )
    .bind(spec.filters.find((filter) => filter.col === "assessment_id")?.value ?? "")
    .all<Record<string, unknown>>();
  return {
    data: (rows.results ?? []).map((row) => ({
      id: row.id,
      kind: row.kind,
      data: jsonParse(row.data_json) ?? {},
      created_at: row.created_at,
    })),
    error: null,
    count: null,
  };
}

async function runScans(db: BoundSql, spec: Spec, single: "many" | "maybe" | "one") {
  if (spec.op === "insert" && spec.values) {
    const created = await insertScan(db, {
      domain: String(spec.values.domain),
      origin: String(spec.values.origin),
      source: spec.values.source === "ops" ? "ops" : "public",
      organizationId: typeof spec.values.lead_id === "string" ? spec.values.lead_id : null,
    });
    if (typeof spec.values.public_token === "string") {
      await db
        .prepare("UPDATE readiness_scans SET public_token = ? WHERE id = ?")
        .bind(spec.values.public_token, created.id)
        .run();
    }
    const row = await db.prepare("SELECT * FROM readiness_scans WHERE id = ?").bind(created.id).first<Record<string, unknown>>();
    return { data: row ? scanRow(row) : null, error: null, count: null };
  }
  if (spec.op === "update" && spec.values) {
    if ("lead_id" in spec.values) {
      const clause = where(spec.filters, { id: "id" });
      await db
        .prepare(`UPDATE readiness_scans SET organization_id = ?${clause.sql}`)
        .bind(spec.values.lead_id ?? null, ...clause.args)
        .run();
    }
    return { data: null, error: null, count: null };
  }
  const columns = {
    id: "id",
    domain: "domain",
    source: "source",
    status: "status",
    created_at: "created_at",
  };
  const clause = where(spec.filters, columns);
  if (spec.head) {
    const row = await db
      .prepare(`SELECT COUNT(*) AS n FROM readiness_scans${clause.sql}`)
      .bind(...clause.args)
      .first<{ n: number }>();
    return { data: null, error: null, count: Number(row?.n ?? 0) };
  }
  const direction = spec.order?.ascending === false ? "DESC" : "ASC";
  const order = spec.order ? ` ORDER BY created_at ${direction}` : "";
  const limit = spec.limit ? ` LIMIT ${spec.limit}` : "";
  const listed = await db
    .prepare(`SELECT * FROM readiness_scans${clause.sql}${order}${limit}`)
    .bind(...clause.args)
    .all<Record<string, unknown>>();
  const rows = (listed.results ?? []).map(scanRow);
  if (single === "many") return { data: rows, error: null, count: null };
  return { data: rows[0] ?? null, error: null, count: null };
}

async function runFindings(db: BoundSql, spec: Spec) {
  const scanId = spec.filters.find((filter) => filter.col === "scan_id")?.value ?? "";
  const rows = await db
    .prepare("SELECT code, severity, passed, message FROM readiness_scan_findings WHERE scan_id = ?")
    .bind(scanId)
    .all<Record<string, unknown>>();
  return {
    data: (rows.results ?? []).map((row) => ({
      code: row.code,
      severity: row.severity,
      passed: row.passed === 1,
      message: row.message,
    })),
    error: null,
    count: null,
  };
}

async function runLeads(db: BoundSql, spec: Spec) {
  const values = spec.values ?? {};
  const domain = String(values.domain ?? "");
  const now = Date.now();
  const existing = await db
    .prepare("SELECT id FROM organizations WHERE domain = ? AND archived_at IS NULL")
    .bind(domain)
    .first<{ id: string }>();
  const name = typeof values.name === "string" && values.name.trim() ? values.name.trim().slice(0, 200) : domain;
  const website = typeof values.website === "string" ? values.website : null;
  if (existing) {
    await db
      .prepare("UPDATE organizations SET name = ?, website = ?, updated_at = ? WHERE id = ?")
      .bind(name, website, now, existing.id)
      .run();
    return { data: { id: existing.id }, error: null, count: null };
  }
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO organizations (id, name, domain, website, kind, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'lead', ?, ?)`,
    )
    .bind(id, name, domain, website, now, now)
    .run();
  return { data: { id }, error: null, count: null };
}

async function runQueue(db: BoundSql, spec: Spec, single: "many" | "maybe" | "one") {
  const leadId = String(
    spec.values?.lead_id ?? spec.filters.find((filter) => filter.col === "lead_id")?.value ?? "",
  );
  if (spec.op === "select") {
    const row = await db
      .prepare("SELECT id FROM deals WHERE organization_id = ? AND stage = 'new' LIMIT 1")
      .bind(leadId)
      .first<{ id: string }>();
    if (single === "many") return { data: row ? [row] : [], error: null, count: null };
    return { data: row ?? null, error: null, count: null };
  }
  const priority = spec.values?.priority_score;
  const nextStep = typeof priority === "number" ? `Readiness check. Priority ${priority}.` : "Readiness check.";
  const now = Date.now();
  const existing = await db
    .prepare("SELECT id FROM deals WHERE organization_id = ? AND stage = 'new' LIMIT 1")
    .bind(leadId)
    .first<{ id: string }>();
  if (existing) {
    await db.prepare("UPDATE deals SET next_step = ?, updated_at = ? WHERE id = ?").bind(nextStep, now, existing.id).run();
    return { data: null, error: null, count: null };
  }
  await db
    .prepare(
      `INSERT INTO deals (id, organization_id, title, stage, source, next_step, created_at, updated_at)
       VALUES (?, ?, 'Readiness check', 'new', 'readiness_check', ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), leadId, nextStep, now, now)
    .run();
  return { data: null, error: null, count: null };
}

async function execute(db: BoundSql, spec: Spec, single: "many" | "maybe" | "one") {
  try {
    if (spec.table === "assessments") return await runAssessments(db, spec, single);
    if (spec.table === "assessment_events") return await runEvents(db, spec);
    if (spec.table === "scans") return await runScans(db, spec, single);
    if (spec.table === "scan_findings") return await runFindings(db, spec);
    if (spec.table === "leads") return await runLeads(db, spec);
    if (spec.table === "ops_queue") return await runQueue(db, spec, single);
    if (spec.table === "appointments") return { data: single === "many" ? [] : null, error: null, count: null };
    return { data: null, error: { message: `Unknown table ${spec.table}` }, count: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : "query failed" }, count: null };
  }
}

function chain(db: BoundSql, spec: Spec): Chain {
  const next = (patch: Partial<Spec>) => chain(db, { ...spec, ...patch, filters: patch.filters ?? spec.filters });
  const api = {
    select(columns = "*", opts?: { count?: string; head?: boolean }) {
      return next({ columns, head: Boolean(opts?.head), returning: spec.op !== "select" });
    },
    insert(values: Record<string, unknown>) {
      return next({ op: "insert", values });
    },
    update(values: Record<string, unknown>) {
      return next({ op: "update", values });
    },
    upsert(values: Record<string, unknown>, opts?: { onConflict?: string }) {
      return next({ op: "upsert", values, onConflict: opts?.onConflict ?? null });
    },
    eq(col: string, value: unknown) {
      return next({ filters: [...spec.filters, { op: "eq", col, value }] });
    },
    gte(col: string, value: unknown) {
      return next({ filters: [...spec.filters, { op: "gte", col, value }] });
    },
    order(col: string, opts?: { ascending?: boolean }) {
      return next({ order: { col, ascending: opts?.ascending !== false } });
    },
    limit(n: number) {
      return next({ limit: n });
    },
    maybeSingle() {
      return execute(db, spec, "maybe");
    },
    single() {
      return execute(db, spec, "one");
    },
    then(resolve, reject) {
      return execute(db, spec, "many").then(resolve, reject);
    },
  };
  return api;
}

export type CheckAdmin = AssessmentAdmin & { db: BoundSql };

export function createD1AssessmentAdmin(db: BoundSql): CheckAdmin {
  return {
    db,
    from(table: string) {
      return chain(db, blank(table));
    },
  };
}

/** Copy a finished check that has an email onto the Handoff client record. */
export async function copyCompletedCheckToCrm(db: BoundSql, assessmentId: string): Promise<{ filed: boolean }> {
  const row = await db
    .prepare("SELECT * FROM check_assessments WHERE id = ?")
    .bind(assessmentId)
    .first<Record<string, unknown>>();
  if (!row) return { filed: false };
  const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
  if (!email) return { filed: false };
  const domain = typeof row.domain === "string" && row.domain.trim() ? row.domain.trim() : null;
  const name = typeof row.name === "string" && row.name.trim() ? row.name.trim().slice(0, 200) : email;
  const now = Date.now();
  let orgId: string | null = null;
  if (domain) {
    const existing = await db
      .prepare("SELECT id FROM organizations WHERE domain = ? AND archived_at IS NULL")
      .bind(domain)
      .first<{ id: string }>();
    orgId = existing?.id ?? null;
  }
  if (!orgId) {
    orgId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO organizations (id, name, domain, website, kind, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'lead', ?, ?)`,
      )
      .bind(orgId, name, domain, domain ? `https://${domain}` : null, now, now)
      .run();
  }
  const contact = await db
    .prepare("SELECT id FROM contacts WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  const contactId = contact?.id ?? crypto.randomUUID();
  if (!contact) {
    await db
      .prepare(
        `INSERT INTO contacts
          (id, organization_id, name, email, is_primary, opted_in, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
      )
      .bind(contactId, orgId, name, email, now, now)
      .run();
  }
  const deal = await db
    .prepare("SELECT id FROM deals WHERE organization_id = ? AND stage = 'new' LIMIT 1")
    .bind(orgId)
    .first<{ id: string }>();
  const dealId = deal?.id ?? crypto.randomUUID();
  if (!deal) {
    await db
      .prepare(
        `INSERT INTO deals (id, organization_id, title, stage, source, next_step, created_at, updated_at)
         VALUES (?, ?, 'Readiness check', 'new', 'readiness_check', 'Review the finished check', ?, ?)`,
      )
      .bind(dealId, orgId, now, now)
      .run();
  }
  const scores = jsonParse(row.scores_json);
  const total =
    scores && typeof scores === "object" && scores !== null && "overall" in scores
      ? Number((scores as { overall?: { total?: number } }).overall?.total ?? null)
      : null;
  const completed = millis(row.completed_at) ?? now;
  const token = String(row.public_token ?? "");
  const report = token ? `https://check.abra-ca-dabra.app/check/${token}` : null;
  const already = await db.prepare("SELECT id FROM assessments WHERE id = ?").bind(assessmentId).first<{ id: string }>();
  if (already) {
    await db
      .prepare(
        `UPDATE assessments
         SET organization_id = ?, contact_id = ?, deal_id = ?, domain = ?, answers_json = ?, scores_json = ?,
             total_score = ?, utm_json = ?, report_url = ?, completed_at = ?, received_at = ?
         WHERE id = ?`,
      )
      .bind(
        orgId,
        contactId,
        dealId,
        domain,
        String(row.answers_json ?? "{}"),
        String(row.scores_json ?? "{}"),
        Number.isFinite(total) ? total : null,
        String(row.utm_json ?? "{}"),
        report,
        completed,
        now,
        assessmentId,
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO assessments
          (id, organization_id, contact_id, deal_id, domain, answers_json, scores_json, total_score, utm_json, report_url, completed_at, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        assessmentId,
        orgId,
        contactId,
        dealId,
        domain,
        String(row.answers_json ?? "{}"),
        String(row.scores_json ?? "{}"),
        Number.isFinite(total) ? total : null,
        String(row.utm_json ?? "{}"),
        report,
        completed,
        now,
      )
      .run();
  }
  await db.prepare("UPDATE check_assessments SET lead_id = ? WHERE id = ?").bind(orgId, assessmentId).run();
  return { filed: true };
}

export async function questionnaireAdmin(): Promise<CheckAdmin> {
  const env = (await getCloudflareContext({ async: true })).env as CheckBindings;
  if (!env.DB) throw new Error("Check store unavailable");
  return createD1AssessmentAdmin(env.DB);
}
