const ALLOWED = new Set([
  "leads",
  "contacts",
  "scans",
  "scan_pages",
  "scan_findings",
  "scan_unlocks",
  "ops_queue",
  "ops_status_audit",
  "assessments",
  "assessment_events",
  "appointments",
  "intake_receipts",
]);

const COLUMNS: Record<string, Set<string>> = {
  leads: new Set(["id", "name", "domain", "website", "industry", "source", "raw", "created_at", "updated_at"]),
  contacts: new Set(["id", "lead_id", "name", "title", "email", "phone", "confidence", "created_at"]),
  scans: new Set([
    "id",
    "domain",
    "origin",
    "source",
    "status",
    "public_token",
    "lead_id",
    "score_total",
    "score_breakdown",
    "error_message",
    "created_at",
    "completed_at",
  ]),
  scan_pages: new Set([
    "id",
    "scan_id",
    "url",
    "page_type",
    "fetch_status",
    "has_json_ld",
    "schema_types",
    "evidence",
  ]),
  scan_findings: new Set(["id", "scan_id", "page_id", "code", "severity", "passed", "message", "evidence"]),
  scan_unlocks: new Set(["id", "scan_id", "email", "created_at"]),
  ops_queue: new Set([
    "id",
    "lead_id",
    "latest_scan_id",
    "assessment_id",
    "status",
    "priority_score",
    "missing_contact",
    "notes",
    "status_changed_at",
    "status_changed_by",
    "created_at",
  ]),
  ops_status_audit: new Set(["id", "ops_queue_id", "from_status", "to_status", "changed_by", "created_at"]),
  assessments: new Set([
    "id",
    "public_token",
    "config_version",
    "status",
    "lead_id",
    "scan_id",
    "domain",
    "email",
    "name",
    "answers",
    "qualifiers",
    "scores",
    "utm",
    "current_step",
    "created_at",
    "updated_at",
    "completed_at",
    "opted_in_at",
  ]),
  assessment_events: new Set(["id", "assessment_id", "kind", "data", "created_at"]),
  appointments: new Set([
    "id",
    "assessment_id",
    "lead_id",
    "provider",
    "external_id",
    "starts_at",
    "ends_at",
    "status",
    "raw",
    "created_at",
    "updated_at",
  ]),
  intake_receipts: new Set(["source", "external_id", "received_at"]),
};

const JSON_COLUMNS: Record<string, Set<string>> = {
  leads: new Set(["raw"]),
  scans: new Set(["score_breakdown"]),
  scan_pages: new Set(["schema_types", "evidence"]),
  scan_findings: new Set(["evidence"]),
  assessments: new Set(["answers", "qualifiers", "scores", "utm"]),
  assessment_events: new Set(["data"]),
  appointments: new Set(["raw"]),
};

const BOOL_COLUMNS: Record<string, Set<string>> = {
  scan_pages: new Set(["has_json_ld"]),
  scan_findings: new Set(["passed"]),
  ops_queue: new Set(["missing_contact"]),
};

const UPDATED_AT = new Set(["leads", "assessments", "appointments"]);
const CREATED_AT = new Set([
  "leads",
  "contacts",
  "scans",
  "scan_unlocks",
  "ops_queue",
  "ops_status_audit",
  "assessments",
  "assessment_events",
  "appointments",
]);

const IDENT = /^[a-z_][a-z0-9_]*$/;

export type D1Prepared = {
  bind: (...values: unknown[]) => {
    all: () => Promise<{ results?: Record<string, unknown>[] }>;
    first: <T>() => Promise<T | null>;
    run: () => Promise<{ success?: boolean }>;
  };
};

export type D1Like = {
  prepare: (sql: string) => D1Prepared;
};

type QueryError = { message: string; code?: string };

type QueryResult = {
  // Routes were written against the untyped Supabase client, which returns any.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  error: QueryError | null;
  count: number | null;
};

type Filter =
  | { kind: "eq" | "gte" | "lt"; column: string; value: unknown }
  | { kind: "json"; column: string; key: string; value: unknown };

type Op = "select" | "insert" | "update" | "delete" | "upsert";

function physicalName(table: string): string {
  if (table === "intake_receipts") return "intake_receipts";
  return `rc_${table}`;
}

function assertColumn(table: string, column: string): void {
  if (!IDENT.test(column) || !COLUMNS[table]?.has(column)) {
    throw new Error(`Unknown column ${table}.${column}`);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function splitSelect(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of input) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function isNestedSelect(table: string, columns: string): boolean {
  return table === "ops_queue" && columns.includes("leads (");
}

function writeValue(table: string, column: string, value: unknown): unknown {
  if (value === undefined) return undefined;
  if (BOOL_COLUMNS[table]?.has(column)) {
    if (value === null) return null;
    return value ? 1 : 0;
  }
  if (JSON_COLUMNS[table]?.has(column)) {
    if (value === null) return null;
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  return value;
}

function mapRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (BOOL_COLUMNS[table]?.has(key)) {
      mapped[key] = value === 1 || value === true;
      continue;
    }
    if (JSON_COLUMNS[table]?.has(key) && typeof value === "string") {
      try {
        mapped[key] = JSON.parse(value);
      } catch {
        mapped[key] = value;
      }
      continue;
    }
    mapped[key] = value;
  }
  return mapped;
}

function sqlError(error: unknown): QueryError {
  const message = error instanceof Error ? error.message : "Database error";
  const code = message.includes("UNIQUE constraint failed") ? "23505" : undefined;
  return { message, code };
}

function bindFilter(table: string, filter: Filter): unknown {
  if (filter.kind === "json") return filter.value;
  return writeValue(table, filter.column, filter.value);
}

class Query {
  private op: Op | null = null;
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private columns = "*";
  private head = false;
  private rows: Record<string, unknown>[] = [];
  private conflict: string | null = null;
  private returning: string | null = null;

  constructor(
    private readonly db: D1Like,
    private readonly table: string,
  ) {}

  select(columns = "*", options?: { count?: "exact"; head?: boolean }): this {
    if (this.op === "insert" || this.op === "update" || this.op === "upsert") {
      this.returning = columns;
      return this;
    }
    this.op = "select";
    this.columns = columns;
    this.head = Boolean(options?.head);
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]): this {
    this.op = "insert";
    this.rows = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  update(payload: Record<string, unknown>): this {
    this.op = "update";
    this.rows = [payload];
    return this;
  }

  upsert(payload: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }): this {
    this.op = "upsert";
    this.rows = Array.isArray(payload) ? payload : [payload];
    this.conflict = options?.onConflict ?? null;
    return this;
  }

  delete(): this {
    this.op = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    assertColumn(this.table, column);
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    assertColumn(this.table, column);
    this.filters.push({ kind: "gte", column, value });
    return this;
  }

  lt(column: string, value: unknown): this {
    assertColumn(this.table, column);
    this.filters.push({ kind: "lt", column, value });
    return this;
  }

  filter(column: string, operator: string, value: unknown): this {
    const match = /^([a-z_][a-z0-9_]*)->>([a-z_][a-z0-9_]*)$/.exec(column);
    if (!match || operator !== "eq") {
      throw new Error(`Unsupported filter ${column}`);
    }
    assertColumn(this.table, match[1]);
    this.filters.push({ kind: "json", column: match[1], key: match[2], value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    assertColumn(this.table, column);
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number): this {
    this.limitN = count;
    return this;
  }

  async maybeSingle(): Promise<QueryResult> {
    const result = await this.execute();
    if (result.error) return result;
    const rows = Array.isArray(result.data) ? result.data : [];
    if (rows.length > 1) {
      return {
        data: null,
        error: { message: "Multiple rows returned", code: "PGRST116" },
        count: rows.length,
      };
    }
    return { data: rows[0] ?? null, error: null, count: result.count };
  }

  async single(): Promise<QueryResult> {
    const result = await this.execute();
    if (result.error) return result;
    const rows = Array.isArray(result.data) ? result.data : [];
    if (rows.length !== 1) {
      return {
        data: null,
        error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
        count: rows.length,
      };
    }
    return { data: rows[0], error: null, count: result.count };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private whereSql(): { sql: string; values: unknown[] } {
    if (this.filters.length === 0) return { sql: "", values: [] };
    const parts = this.filters.map((filter) => {
      if (filter.kind === "json") return `json_extract(${filter.column}, '$.${filter.key}') = ?`;
      if (filter.kind === "gte") return `${filter.column} >= ?`;
      if (filter.kind === "lt") return `${filter.column} < ?`;
      return `${filter.column} = ?`;
    });
    return {
      sql: ` WHERE ${parts.join(" AND ")}`,
      values: this.filters.map((filter) => bindFilter(this.table, filter)),
    };
  }

  private async execute(): Promise<QueryResult> {
    try {
      if (this.op === "select" || this.op === null) return await this.runSelect();
      if (this.op === "insert") return await this.runInsert(false);
      if (this.op === "upsert") return await this.runInsert(true);
      if (this.op === "update") return await this.runUpdate();
      return await this.runDelete();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unknown column")) throw error;
      if (error instanceof Error && error.message.startsWith("Unsupported filter")) throw error;
      return { data: null, error: sqlError(error), count: null };
    }
  }

  private async runSelect(): Promise<QueryResult> {
    const table = physicalName(this.table);
    const where = this.whereSql();
    if (this.head) {
      const row = await this.db
        .prepare(`SELECT COUNT(*) AS count FROM ${table}${where.sql}`)
        .bind(...where.values)
        .first<{ count: number }>();
      return { data: null, error: null, count: Number(row?.count ?? 0) };
    }

    const nested = isNestedSelect(this.table, this.columns);
    const projection = nested ? "*" : this.projection(this.columns);
    let sql = `SELECT ${projection} FROM ${table}${where.sql}`;
    const values = [...where.values];
    if (this.orderBy) {
      sql += ` ORDER BY ${this.orderBy.column} ${this.orderBy.ascending ? "ASC" : "DESC"}`;
    }
    if (this.limitN != null) {
      sql += " LIMIT ?";
      values.push(this.limitN);
    }
    const selected = await this.db.prepare(sql).bind(...values).all();
    let rows = (selected.results ?? []).map((row) => mapRow(this.table, row));
    if (nested) rows = await this.hydrateQueue(rows);
    return { data: rows, error: null, count: rows.length };
  }

  private projection(columns: string): string {
    if (columns.trim() === "*") return "*";
    const names = splitSelect(columns).map((part) => part.replace(/\s+/g, " "));
    for (const name of names) {
      if (name === "*") continue;
      if (name.includes("(")) continue;
      assertColumn(this.table, name);
    }
    return names.join(", ");
  }

  private async hydrateQueue(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    const hydrated: Record<string, unknown>[] = [];
    for (const row of rows) {
      const next = { ...row };
      const leadId = typeof row.lead_id === "string" ? row.lead_id : null;
      if (leadId) {
        const lead = await this.one("leads", "id", leadId);
        const contacts = await this.many("contacts", "lead_id", leadId);
        next.leads = lead ? { ...lead, contacts } : null;
      } else {
        next.leads = null;
      }
      const scanId = typeof row.latest_scan_id === "string" ? row.latest_scan_id : null;
      if (scanId) {
        const scan = await this.one("scans", "id", scanId);
        const findings = await this.many("scan_findings", "scan_id", scanId);
        next.scans = scan ? { ...scan, scan_findings: findings } : null;
      } else {
        next.scans = null;
      }
      const assessmentId = typeof row.assessment_id === "string" ? row.assessment_id : null;
      if (assessmentId) {
        const assessment = await this.one("assessments", "id", assessmentId);
        const appointments = await this.many("appointments", "assessment_id", assessmentId);
        next.assessments = assessment ? { ...assessment, appointments } : null;
      } else {
        next.assessments = null;
      }
      hydrated.push(next);
    }
    return hydrated;
  }

  private async one(table: string, column: string, value: string): Promise<Record<string, unknown> | null> {
    const row = await this.db
      .prepare(`SELECT * FROM ${physicalName(table)} WHERE ${column} = ?`)
      .bind(value)
      .first<Record<string, unknown>>();
    return row ? mapRow(table, row) : null;
  }

  private async many(table: string, column: string, value: string): Promise<Record<string, unknown>[]> {
    const selected = await this.db
      .prepare(`SELECT * FROM ${physicalName(table)} WHERE ${column} = ?`)
      .bind(value)
      .all();
    return (selected.results ?? []).map((row) => mapRow(table, row));
  }

  private preparedRow(input: Record<string, unknown>, conflict: boolean): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      assertColumn(this.table, key);
      row[key] = writeValue(this.table, key, value);
    }
    if (!row.id && COLUMNS[this.table]?.has("id")) row.id = crypto.randomUUID();
    const stamp = nowIso();
    if (CREATED_AT.has(this.table) && row.created_at == null && !conflict) row.created_at = stamp;
    if (UPDATED_AT.has(this.table) && row.updated_at == null) row.updated_at = stamp;
    return row;
  }

  private async runInsert(conflict: boolean): Promise<QueryResult> {
    if (conflict && (!this.conflict || !IDENT.test(this.conflict))) {
      throw new Error("Upsert requires onConflict");
    }
    if (conflict) assertColumn(this.table, this.conflict as string);
    const table = physicalName(this.table);
    const returning = this.returningClause();
    const written: Record<string, unknown>[] = [];
    for (const input of this.rows) {
      const row = this.preparedRow(input, conflict);
      const keys = Object.keys(row);
      const placeholders = keys.map(() => "?").join(", ");
      let sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;
      if (conflict) {
        const updates = keys.filter((key) => key !== "id");
        if (UPDATED_AT.has(this.table) && !Object.prototype.hasOwnProperty.call(input, "updated_at")) {
          if (!updates.includes("updated_at")) updates.push("updated_at");
        }
        const assignments = updates.map((key) => `${key} = excluded.${key}`);
        sql += ` ON CONFLICT(${this.conflict}) DO UPDATE SET ${assignments.join(", ")}`;
      }
      sql += returning;
      const values = keys.map((key) => row[key]);
      if (this.returning) {
        const selected = await this.db.prepare(sql).bind(...values).all();
        written.push(...(selected.results ?? []).map((item) => mapRow(this.table, item)));
      } else {
        await this.db.prepare(sql).bind(...values).run();
      }
    }
    if (!this.returning) return { data: null, error: null, count: null };
    return { data: written, error: null, count: written.length };
  }

  private async runUpdate(): Promise<QueryResult> {
    const patch = this.preparedUpdate(this.rows[0] ?? {});
    const keys = Object.keys(patch);
    if (keys.length === 0) return { data: null, error: null, count: null };
    const where = this.whereSql();
    const table = physicalName(this.table);
    const assignments = keys.map((key) => `${key} = ?`).join(", ");
    const sql = `UPDATE ${table} SET ${assignments}${where.sql}${this.returningClause()}`;
    const values = [...keys.map((key) => patch[key]), ...where.values];
    if (!this.returning) {
      await this.db.prepare(sql).bind(...values).run();
      return { data: null, error: null, count: null };
    }
    const selected = await this.db.prepare(sql).bind(...values).all();
    const rows = (selected.results ?? []).map((row) => mapRow(this.table, row));
    return { data: rows, error: null, count: rows.length };
  }

  private preparedUpdate(input: Record<string, unknown>): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      assertColumn(this.table, key);
      row[key] = writeValue(this.table, key, value);
    }
    if (UPDATED_AT.has(this.table) && !Object.prototype.hasOwnProperty.call(input, "updated_at")) {
      row.updated_at = nowIso();
    }
    return row;
  }

  private async runDelete(): Promise<QueryResult> {
    const where = this.whereSql();
    await this.db.prepare(`DELETE FROM ${physicalName(this.table)}${where.sql}`).bind(...where.values).run();
    return { data: null, error: null, count: null };
  }

  private returningClause(): string {
    if (!this.returning) return "";
    return ` RETURNING ${this.projection(this.returning)}`;
  }
}

export function d1Admin(db: D1Like) {
  return {
    from(table: string) {
      if (!ALLOWED.has(table)) throw new Error(`Table ${table} is not available to the readiness check`);
      return new Query(db, table);
    },
  };
}
