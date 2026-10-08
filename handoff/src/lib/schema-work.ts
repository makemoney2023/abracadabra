import { normalizeDomain } from "@/db/crm";
import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";

export type SchemaFileResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; error: "invalid"; retry: false };

type SchemaFile = { path: string; content: string };

function asRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

function cleanPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path || path.length > 200 || path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    return null;
  }
  return path;
}

function cleanFiles(value: unknown): SchemaFile[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 80) return null;
  const files: SchemaFile[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    const path = cleanPath(row.path);
    if (!path || typeof row.content !== "string" || row.content.length === 0 || row.content.length > 200_000) {
      return null;
    }
    files.push({ path, content: row.content });
  }
  return files;
}

function spaceSlug(domain: string): string {
  const base = domain
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base.length > 0 ? base : "site";
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

/** Match the domain to a space, or open a client, project, and space, then file the package. */
export async function fileSchemaPackage(sql: Sql, payload: unknown, now: number): Promise<SchemaFileResult> {
  const body = asRecord(payload);
  const scanId = typeof body?.scan_id === "string" ? body.scan_id.trim() : "";
  const domain = typeof body?.domain === "string" ? normalizeDomain(body.domain) : null;
  const origin = typeof body?.origin === "string" ? body.origin.trim() : "";
  const files = cleanFiles(body?.files);
  if (!scanId || scanId.length > 80 || !domain || !origin.startsWith("http") || !files) {
    return { ok: false, error: "invalid", retry: false };
  }
  const named = typeof body?.business_name === "string" ? body.business_name.trim().slice(0, 200) : "";
  const businessName = named.length > 0 ? named : domain;

  const seen = await sql.get<{ external_id: string }>(
    "SELECT external_id FROM intake_receipts WHERE source = 'schema' AND external_id = ?",
    [scanId],
  );
  if (seen) return { ok: true, duplicate: true };

  await withTx(sql, async () => {
    let org = await sql.get<{ id: string }>(
      "SELECT id FROM organizations WHERE domain = ? AND archived_at IS NULL",
      [domain],
    );
    if (!org) {
      const id = crypto.randomUUID();
      await sql.run(
        `INSERT INTO organizations (id, name, domain, website, kind, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'client', ?, ?)`,
        [id, businessName, domain, origin, now, now],
      );
      org = { id };
    }

    let project = await sql.get<{ id: string }>(
      `SELECT id FROM projects
       WHERE organization_id = ? AND status != 'cancelled'
       ORDER BY created_at DESC LIMIT 1`,
      [org.id],
    );
    if (!project) {
      const id = crypto.randomUUID();
      await sql.run(
        `INSERT INTO projects (
           id, organization_id, deal_id, name, status, owner_user_id, starts_at, due_at, created_at, updated_at
         ) VALUES (?, ?, NULL, 'Website', 'active', NULL, NULL, NULL, ?, ?)`,
        [id, org.id, now, now],
      );
      project = { id };
    }

    let space = await sql.get<{ id: string; project_id: string | null }>(
      `SELECT id, project_id FROM workspaces
       WHERE organization_id = ? AND status != 'purged'
       ORDER BY opened_at LIMIT 1`,
      [org.id],
    );
    if (!space) {
      let slug = spaceSlug(domain);
      const taken = await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE slug = ?", [slug]);
      if (taken) slug = `${slug.slice(0, 30)}-${crypto.randomUUID().slice(0, 8)}`;
      const id = crypto.randomUUID();
      await sql.run(
        `INSERT INTO workspaces (
           id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
           quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id
         ) VALUES (?, ?, ?, ?, NULL, 'Abra-ca-dabra', 'standard', ?, ?, 0, 'active', ?, ?, ?)`,
        [id, slug, businessName, businessName, LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, now, org.id, project.id],
      );
      await sql.run(
        `INSERT INTO requests (
           id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
         ) VALUES (?, ?, 1, 'Files', NULL, 'other', NULL, 'open', NULL, NULL)`,
        [crypto.randomUUID(), id],
      );
      space = { id, project_id: project.id };
    } else if (!space.project_id) {
      await sql.run("UPDATE workspaces SET project_id = ? WHERE id = ?", [project.id, space.id]);
    }

    const deliverableId = crypto.randomUUID();
    const title = `Schema for ${domain}`.slice(0, 200);
    await sql.run(
      `INSERT INTO deliverables (
         id, organization_id, project_id, workspace_id, title, kind, status, version,
         source_repo_id, source_ref, published_at, actor_kind, actor_id, created_at, updated_at, published_version
       ) VALUES (?, ?, ?, ?, ?, 'website', 'in_review', 1, NULL, NULL, ?, 'system', NULL, ?, ?, 1)`,
      [deliverableId, org.id, project.id, space.id, title, now, now, now],
    );
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!file) continue;
      await sql.run(
        `INSERT INTO deliverable_items (
           id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
         ) VALUES (?, ?, 1, 'schema', 'file', NULL, ?, ?, '[]', NULL, 'pending', ?)`,
        [crypto.randomUUID(), deliverableId, file.path, file.content, index],
      );
    }
    await sql.run(
      `INSERT INTO tasks (
         id, project_id, milestone_id, organization_id, title, status, assignee_user_id,
         due_at, created_at, updated_at, done_at, stage, skills_json, created_by_kind, round, deliverable_id
       ) VALUES (?, ?, NULL, ?, ?, 'todo', NULL, NULL, ?, ?, NULL, 'engineer', '[]', 'agent', 1, ?)`,
      [crypto.randomUUID(), project.id, org.id, title, now, now, deliverableId],
    );
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, project_id, workspace_id, kind, actor_kind, body, data_json, created_at
       ) VALUES (?, ?, ?, ?, 'schema_filed', 'system', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        org.id,
        project.id,
        space.id,
        `Filed schema for ${domain}`,
        JSON.stringify({ scanId, deliverableId }),
        now,
      ],
    );
    await sql.run(
      `INSERT INTO intake_receipts (source, external_id, received_at) VALUES ('schema', ?, ?)`,
      [scanId, now],
    );
  });

  return { ok: true, duplicate: false };
}
