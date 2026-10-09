import type { Sql } from "../db/sql";
import { enrichLeadFromSchema } from "./lead-enrich";
import { chunkText } from "./knowledge";
import { LIMITS } from "./policy/limits";
import type { ObjectStore } from "./store/objects";
import { storeWorkflowOutput, workflowSpacePath, type WorkflowFile } from "./workflow-files";

export type ScrapedPage = {
  url: string;
  pageType: string;
  schemaTypes: string[];
  scrapedText: string;
  facts: Record<string, unknown>;
};

const PAGE_CAP = 20;

function slug(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base.length > 0 ? base : "page";
}

function factLines(facts: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const name = typeof facts.businessName === "string" ? facts.businessName : "";
  const description = typeof facts.description === "string" ? facts.description : "";
  if (name) lines.push(`Name: ${name}`);
  if (description) lines.push(`Description: ${description}`);
  if (Array.isArray(facts.emails) && facts.emails.length > 0) lines.push(`Email: ${facts.emails.join(", ")}`);
  if (Array.isArray(facts.phones) && facts.phones.length > 0) lines.push(`Phone: ${facts.phones.join(", ")}`);
  if (Array.isArray(facts.faqPairs)) {
    for (const pair of facts.faqPairs) {
      if (!pair || typeof pair !== "object") continue;
      const row = pair as { question?: string; answer?: string };
      if (row.question && row.answer) lines.push(`Q: ${row.question}\nA: ${row.answer}`);
    }
  }
  return lines;
}

/** One knowledge note per scraped page. The body is the schema facts plus the page text. */
export function readinessContextFiles(scanId: string, pages: ScrapedPage[]): WorkflowFile[] {
  return pages.slice(0, PAGE_CAP).flatMap((page, index) => {
    const scraped = page.scrapedText.trim();
    const facts = factLines(page.facts);
    if (!scraped && facts.length === 0 && page.schemaTypes.length === 0) return [];
    const schema = page.schemaTypes.length > 0 ? page.schemaTypes.join(", ") : "none";
    const body = [
      `# ${page.url}`,
      `Page type: ${page.pageType}`,
      `Schema: ${schema}`,
      ...facts,
      scraped ? `\n${scraped}` : "",
    ]
      .filter((line) => line.length > 0)
      .join("\n");
    return [{ workflow: "schema", run: scanId, node: `${index + 1}-${slug(page.url)}`, body }];
  });
}

function jsonList(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function jsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function spaceSlug(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base.length > 0 ? base : "client";
}

/** A manual lead has no locker until the scan is filed. Open one so the scrape can land. */
async function ensureLeadSpace(sql: Sql, organizationId: string, now: number): Promise<void> {
  const existing = await sql.get<{ id: string }>(
    `SELECT id FROM workspaces
     WHERE organization_id = ? AND status = 'active'
     ORDER BY opened_at ASC LIMIT 1`,
    [organizationId],
  );
  if (existing) return;
  const org = await sql.get<{ name: string; domain: string | null }>(
    "SELECT name, domain FROM organizations WHERE id = ?",
    [organizationId],
  );
  if (!org) return;
  let slug = spaceSlug(org.domain?.trim() || org.name);
  const taken = await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE slug = ?", [slug]);
  if (taken) slug = `${slug.slice(0, 30).replace(/-+$/g, "")}-${crypto.randomUUID().slice(0, 8)}`;
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
       quota_bytes, retention_days, request_digest, status, opened_at, organization_id
     ) VALUES (?, ?, ?, ?, NULL, 'Abra-ca-dabra', 'standard', ?, ?, 0, 'active', ?, ?)`,
    [id, slug, org.name, org.name, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, now, organizationId],
  );
  await sql.run(
    `INSERT INTO requests (
       id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
     ) VALUES (?, ?, 1, 'Files', NULL, 'other', NULL, 'open', NULL, NULL)`,
    [crypto.randomUUID(), id],
  );
}

async function indexFile(sql: Sql, workspaceId: string, fileId: string, text: string, now: number): Promise<void> {
  const chunks = chunkText(text);
  await sql.run("DELETE FROM file_passages WHERE file_id = ?", [fileId]);
  for (let position = 0; position < chunks.length; position += 1) {
    const body = chunks[position];
    if (!body) continue;
    await sql.run(
      `INSERT INTO file_passages (id, file_id, workspace_id, position, body, embedding)
       VALUES (?, ?, ?, ?, ?, '[]')`,
      [crypto.randomUUID(), fileId, workspaceId, position, body],
    );
  }
  const summary = text.replace(/\s+/g, " ").trim().slice(0, 240);
  await sql.run(
    `INSERT INTO file_reads (file_id, workspace_id, status, summary, reason, source_sha, read_at)
     VALUES (?, ?, 'ready', ?, NULL, NULL, ?)
     ON CONFLICT(file_id) DO UPDATE SET status = 'ready', summary = excluded.summary, read_at = excluded.read_at`,
    [fileId, workspaceId, summary, now],
  );
}

/** Reads what the client's file space already holds, schema notes first, as brief context. */
export async function clientSpaceContext(sql: Sql, organizationId: string, cap = 6000): Promise<string> {
  const rows = await sql.all<{ path: string; body: string }>(
    `SELECT f.relative_path AS path, p.body AS body
     FROM file_passages p
     JOIN files f ON f.id = p.file_id AND f.object_deleted_at IS NULL
     JOIN batches b ON b.id = f.batch_id AND b.workspace_id = f.workspace_id
       AND b.discarded_at IS NULL AND b.deleted_at IS NULL
     JOIN workspaces w ON w.id = p.workspace_id AND w.status = 'active'
     WHERE w.organization_id = ?
     ORDER BY CASE WHEN f.relative_path LIKE 'agent/schema/%' THEN 0 ELSE 1 END, f.relative_path, p.position`,
    [organizationId],
  );
  if (rows.length === 0) return "";
  let text = "Existing client context from the file space:";
  let current = "";
  for (const row of rows) {
    const piece = (row.path === current ? "\n" : `\n\n## ${row.path}\n`) + row.body.trim();
    current = row.path;
    if (text.length + piece.length > cap) {
      text += piece.slice(0, Math.max(0, cap - text.length));
      break;
    }
    text += piece;
  }
  return text;
}

/** Files the latest schema scan into the client's knowledge base. */
export async function storeScanContext(input: {
  sql: Sql;
  store: ObjectStore;
  organizationId: string;
  now: number;
}): Promise<{ scanId: string | null; score: number | null; stored: string[] }> {
  const table = await input.sql.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'readiness_scans'",
  );
  if (!table) return { scanId: null, score: null, stored: [] };
  const scan = await input.sql.get<{ id: string; score_total: number | null }>(
    `SELECT id, score_total FROM readiness_scans
     WHERE status = 'complete'
       AND (
         organization_id = ?
         OR domain = (SELECT domain FROM organizations WHERE id = ?)
       )
     ORDER BY COALESCE(completed_at, created_at) DESC
     LIMIT 1`,
    [input.organizationId, input.organizationId],
  );
  if (!scan) return { scanId: null, score: null, stored: [] };
  const rows = await input.sql.all<{
    url: string;
    page_type: string;
    schema_types_json: string;
    evidence_json: string;
  }>(
    `SELECT url, page_type, schema_types_json, evidence_json
     FROM readiness_scan_pages WHERE scan_id = ? ORDER BY url`,
    [scan.id],
  );
  const pages: ScrapedPage[] = rows.map((row) => {
    const facts = jsonObject(row.evidence_json);
    const scrapedText = typeof facts.scrapedText === "string" ? facts.scrapedText : "";
    return {
      url: row.url,
      pageType: row.page_type,
      schemaTypes: jsonList(row.schema_types_json),
      scrapedText,
      facts,
    };
  });
  const files = readinessContextFiles(scan.id, pages);
  await ensureLeadSpace(input.sql, input.organizationId, input.now);
  const saved = await storeWorkflowOutput({
    sql: input.sql,
    store: input.store,
    organizationId: input.organizationId,
    files,
    now: input.now,
    tag: "reference",
  });
  const space = await input.sql.get<{ id: string }>(
    `SELECT id FROM workspaces WHERE organization_id = ? AND status = 'active' ORDER BY opened_at ASC LIMIT 1`,
    [input.organizationId],
  );
  if (space) {
    for (const file of files) {
      const relativePath = workflowSpacePath(file);
      if (!relativePath || !saved.stored.includes(relativePath)) continue;
      const row = await input.sql.get<{ id: string }>(
        "SELECT id FROM files WHERE workspace_id = ? AND relative_path = ? AND object_deleted_at IS NULL",
        [space.id, relativePath],
      );
      if (row) await indexFile(input.sql, space.id, row.id, file.body, input.now);
    }
  }
  await enrichLeadFromSchema(input.sql, input.organizationId, input.now);
  return { scanId: scan.id, score: scan.score_total, stored: saved.stored };
}
