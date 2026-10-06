import type { Caller } from "@/lib/authz";
import type { Sql } from "./sql";

export type OrgKind = "lead" | "client" | "past_client" | "partner";

export type Organization = {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  kind: OrgKind;
  created_at: number;
  updated_at: number;
};

export type WorkspaceLink = {
  id: string;
  slug: string;
  display_name: string;
};

export type CrmError = "forbidden" | "invalid" | "taken" | "space_taken" | "missing";

export type CrmResult<T> = { ok: true; value: T } | { ok: false; error: CrmError };

export const CRM_ERRORS: Record<CrmError, string> = {
  forbidden: "You can't do that.",
  invalid: "Check the name and website.",
  taken: "That website is already on a client.",
  space_taken: "That space is already linked to a client.",
  missing: "That client or space is not here.",
};

const KINDS = new Set<OrgKind>(["lead", "client", "past_client", "partner"]);

const ORG_COLUMNS = "id, name, domain, website, kind, created_at, updated_at";

function staffUserId(caller: Caller): string | null {
  if (!caller.staff || !caller.userId) return null;
  return caller.userId;
}

function isUnique(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE");
}

/** Bare host for matching. Blank stays empty. A bad website is null. */
export function normalizeDomain(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  let hostname: string;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    hostname = new URL(withScheme).hostname;
  } catch {
    return null;
  }
  if (hostname.startsWith("www.")) hostname = hostname.slice(4);
  if (
    hostname.length === 0 ||
    !hostname.includes(".") ||
    hostname.startsWith(".") ||
    hostname.endsWith(".") ||
    hostname.includes("..")
  ) {
    return null;
  }
  return hostname;
}

export async function listOrganizations(sql: Sql, caller: Caller): Promise<Organization[]> {
  if (!staffUserId(caller)) return [];
  return sql.all<Organization>(
    `SELECT ${ORG_COLUMNS} FROM organizations WHERE archived_at IS NULL ORDER BY name`,
  );
}

export async function organizationById(
  sql: Sql,
  caller: Caller,
  id: string,
): Promise<Organization | undefined> {
  if (!staffUserId(caller)) return undefined;
  return sql.get<Organization>(
    `SELECT ${ORG_COLUMNS} FROM organizations WHERE id = ? AND archived_at IS NULL`,
    [id],
  );
}

export async function createOrganization(
  sql: Sql,
  caller: Caller,
  input: { name: string; website?: string; kind?: OrgKind },
  now: number,
): Promise<CrmResult<Organization>> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  const name = input.name.trim();
  if (name.length < 1 || name.length > 200) return { ok: false, error: "invalid" };
  const kind = input.kind ?? "client";
  if (!KINDS.has(kind)) return { ok: false, error: "invalid" };
  const websiteRaw = (input.website ?? "").trim();
  let domain: string | null = null;
  let website: string | null = null;
  if (websiteRaw.length > 0) {
    domain = normalizeDomain(websiteRaw);
    if (!domain) return { ok: false, error: "invalid" };
    website = websiteRaw;
  }
  const id = crypto.randomUUID();
  try {
    await sql.exec("BEGIN");
    await sql.run(
      `INSERT INTO organizations (id, name, domain, website, kind, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, domain, website, kind, now, now],
    );
    await sql.run(
      `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, created_at)
       VALUES (?, ?, 'note', 'staff', ?, ?)`,
      [crypto.randomUUID(), id, actorId, now],
    );
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    if (isUnique(error)) return { ok: false, error: "taken" };
    throw error;
  }
  const row = await organizationById(sql, caller, id);
  if (!row) return { ok: false, error: "missing" };
  return { ok: true, value: row };
}

export async function unlinkedWorkspaces(sql: Sql, caller: Caller): Promise<WorkspaceLink[]> {
  if (!staffUserId(caller)) return [];
  return sql.all<WorkspaceLink>(
    `SELECT id, slug, display_name FROM workspaces
     WHERE organization_id IS NULL AND status != 'purged'
     ORDER BY display_name`,
  );
}

export async function linkWorkspace(
  sql: Sql,
  caller: Caller,
  input: { organizationId: string; workspaceId: string },
  now: number,
): Promise<{ ok: true } | { ok: false; error: CrmError }> {
  const actorId = staffUserId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  const org = await organizationById(sql, caller, input.organizationId);
  if (!org) return { ok: false, error: "missing" };
  const space = await sql.get<{ id: string; organization_id: string | null }>(
    "SELECT id, organization_id FROM workspaces WHERE id = ?",
    [input.workspaceId],
  );
  if (!space) return { ok: false, error: "missing" };
  if (space.organization_id === input.organizationId) return { ok: true };
  if (space.organization_id) return { ok: false, error: "space_taken" };
  try {
    await sql.exec("BEGIN");
    await sql.run(
      "UPDATE workspaces SET organization_id = ? WHERE id = ? AND organization_id IS NULL",
      [input.organizationId, input.workspaceId],
    );
    await sql.run(
      `INSERT INTO activities (
         id, organization_id, workspace_id, kind, actor_kind, actor_id, body, created_at
       ) VALUES (?, ?, ?, 'note', 'staff', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        input.organizationId,
        input.workspaceId,
        actorId,
        "Linked a space.",
        now,
      ],
    );
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
  return { ok: true };
}
