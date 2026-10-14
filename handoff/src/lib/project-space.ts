import type { Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";

export type ProjectSpacePlan = {
  projectId: string;
  workspaceId: string;
  createdProject: boolean;
  createdSpace: boolean;
  /** Writes to run inside the caller's transaction. D1 buffers writes until COMMIT, so reads all happen first. */
  writes: { statement: string; params: readonly unknown[] }[];
};

function slugBase(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base.length > 0 ? base : "client";
}

async function freeSlug(sql: Sql, name: string): Promise<string> {
  const base = slugBase(name);
  const taken = await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE slug = ?", [base]);
  if (!taken) return base;
  return `${base.slice(0, 30).replace(/-+$/g, "")}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Plans a project and its Space for one org. Reuses `projectId` when given, else creates one.
 * Reuses the project's Space, then an unlinked Space of the org, else creates one.
 * Used by Client Services work requests and by the deal-closed intake.
 */
export async function planProjectSpace(
  sql: Sql,
  input: {
    organizationId: string;
    name: string;
    projectId?: string | null;
    dealId?: string | null;
    description?: string | null;
    status?: "planned" | "active";
    now: number;
  },
): Promise<ProjectSpacePlan> {
  const writes: ProjectSpacePlan["writes"] = [];
  const name = input.name.trim().slice(0, 200) || "Client work";
  const org = await sql.get<{ name: string }>("SELECT name FROM organizations WHERE id = ?", [input.organizationId]);
  const orgName = org?.name ?? name;
  let projectId = input.projectId ?? null;
  const createdProject = !projectId;
  if (!projectId) {
    projectId = crypto.randomUUID();
    writes.push({
      statement: `INSERT INTO projects (
         id, organization_id, deal_id, name, status, owner_user_id, starts_at, due_at, created_at, updated_at, description
       ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
      params: [
        projectId,
        input.organizationId,
        input.dealId ?? null,
        name,
        input.status ?? "active",
        input.now,
        input.now,
        input.description?.slice(0, 4000) ?? null,
      ],
    });
  }
  const linked = createdProject
    ? undefined
    : await sql.get<{ id: string }>(
        "SELECT id FROM workspaces WHERE project_id = ? AND status = 'active' ORDER BY opened_at LIMIT 1",
        [projectId],
      );
  if (linked) return { projectId, workspaceId: linked.id, createdProject, createdSpace: false, writes };
  const loose = await sql.get<{ id: string }>(
    `SELECT id FROM workspaces WHERE organization_id = ? AND project_id IS NULL AND status = 'active'
     ORDER BY opened_at LIMIT 1`,
    [input.organizationId],
  );
  if (loose) {
    writes.push({
      statement: "UPDATE workspaces SET project_id = ? WHERE id = ? AND project_id IS NULL",
      params: [projectId, loose.id],
    });
    return { projectId, workspaceId: loose.id, createdProject, createdSpace: false, writes };
  }
  const workspaceId = crypto.randomUUID();
  const slug = await freeSlug(sql, `${orgName} ${createdProject ? name : ""}`.trim());
  writes.push({
    statement: `INSERT INTO workspaces (
       id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
       quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id
     ) VALUES (?, ?, ?, ?, NULL, 'Abra-ca-dabra', 'standard', ?, ?, 0, 'active', ?, ?, ?)`,
    params: [
      workspaceId,
      slug,
      orgName,
      orgName,
      LIMITS.defaultQuotaBytes,
      LIMITS.defaultRetentionDays,
      input.now,
      input.organizationId,
      projectId,
    ],
  });
  writes.push({
    statement: `INSERT INTO requests (
       id, workspace_id, position, title, guidance, suggested_tag, due_on, status, received_at, closed_at
     ) VALUES (?, ?, 1, 'Files', NULL, 'other', NULL, 'open', NULL, NULL)`,
    params: [crypto.randomUUID(), workspaceId],
  });
  return { projectId, workspaceId, createdProject, createdSpace: true, writes };
}
