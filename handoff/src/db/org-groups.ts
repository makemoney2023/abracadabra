import type { Caller } from "@/lib/authz";
import type { CrmResult } from "./crm";
import type { Sql } from "./sql";

/**
 * Holding groups: a company can sit under one parent company (for example LioCorr Holdings over Strong Foam).
 * One level only. A parent never has a parent, and a company with children never gets one, so there is no cycle.
 * Each company keeps its own domain, spaces, projects and agents; the link only groups them.
 */

export type GroupMember = { id: string; name: string; kind: string; domain: string | null };

export type OrganizationGroup = {
  parent: GroupMember | null;
  children: GroupMember[];
};

/** A name like "LioCorr Holdings Inc." already ends a sentence. */
function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

function staffId(caller: Caller): string | null {
  return caller.staff && caller.userId ? caller.userId : null;
}

type Row = { id: string; name: string; parent_organization_id: string | null };

async function liveRow(sql: Sql, id: string): Promise<Row | undefined> {
  return sql.get<Row>(
    "SELECT id, name, parent_organization_id FROM organizations WHERE id = ? AND archived_at IS NULL",
    [id],
  );
}

/** The parent of this company and the companies under it. Archived companies are left out. */
export async function organizationGroup(sql: Sql, caller: Caller, organizationId: string): Promise<OrganizationGroup> {
  if (!staffId(caller)) return { parent: null, children: [] };
  const self = await liveRow(sql, organizationId);
  if (!self) return { parent: null, children: [] };
  const parent = self.parent_organization_id
    ? await sql.get<GroupMember>(
        "SELECT id, name, kind, domain FROM organizations WHERE id = ? AND archived_at IS NULL",
        [self.parent_organization_id],
      )
    : undefined;
  const children = await sql.all<GroupMember>(
    `SELECT id, name, kind, domain FROM organizations
     WHERE parent_organization_id = ? AND archived_at IS NULL
     ORDER BY name`,
    [organizationId],
  );
  return { parent: parent ?? null, children };
}

/** Companies that can be picked as a parent: live, not themselves under a parent, and not this company. */
export async function parentChoices(
  sql: Sql,
  caller: Caller,
  exceptId?: string,
): Promise<{ id: string; name: string }[]> {
  if (!staffId(caller)) return [];
  return sql.all<{ id: string; name: string }>(
    `SELECT id, name FROM organizations
     WHERE archived_at IS NULL AND parent_organization_id IS NULL AND id != ?
     ORDER BY name`,
    [exceptId ?? ""],
  );
}

/**
 * Put a company under a parent, or take it out of its group with parentId null.
 * Both companies get a timeline note so the change is visible on each page.
 */
export async function setParentOrganization(
  sql: Sql,
  caller: Caller,
  input: { organizationId: string; parentId: string | null },
  now: number,
): Promise<CrmResult<OrganizationGroup>> {
  const actorId = staffId(caller);
  if (!actorId) return { ok: false, error: "forbidden" };
  const child = await liveRow(sql, input.organizationId);
  if (!child) return { ok: false, error: "missing" };
  const parentId = input.parentId?.trim() || null;
  if (parentId === child.parent_organization_id) return { ok: true, value: await organizationGroup(sql, caller, child.id) };

  let parent: Row | undefined;
  if (parentId) {
    if (parentId === child.id) return { ok: false, error: "invalid" };
    parent = await liveRow(sql, parentId);
    if (!parent) return { ok: false, error: "missing" };
    if (parent.parent_organization_id) return { ok: false, error: "invalid" };
    const hasChildren = await sql.get<{ id: string }>(
      "SELECT id FROM organizations WHERE parent_organization_id = ? AND archived_at IS NULL LIMIT 1",
      [child.id],
    );
    if (hasChildren) return { ok: false, error: "invalid" };
  }
  const previous = child.parent_organization_id ? await liveRow(sql, child.parent_organization_id) : undefined;

  const note = async (organizationId: string, body: string) =>
    sql.run(
      `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, created_at)
       VALUES (?, ?, 'note', 'staff', ?, ?, ?)`,
      [crypto.randomUUID(), organizationId, actorId, body, now],
    );

  try {
    await sql.exec("BEGIN");
    await sql.run("UPDATE organizations SET parent_organization_id = ?, updated_at = ? WHERE id = ?", [
      parentId,
      now,
      child.id,
    ]);
    if (parent) {
      await note(child.id, sentence(`Now part of ${parent.name}`));
      await note(parent.id, `Added ${child.name} to the group.`);
    } else {
      await note(child.id, previous ? sentence(`No longer part of ${previous.name}`) : "No longer part of a group.");
    }
    if (previous) await note(previous.id, `${child.name} left the group.`);
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
  return { ok: true, value: await organizationGroup(sql, caller, child.id) };
}
