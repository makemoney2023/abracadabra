import type { Sql } from "../db/sql";
import { adaptArtifact } from "./artifact-adapter";
import { validateManifest } from "./batches";
import { inspectFileName, type PolicyProfile } from "./policy/profiles";
import type { ObjectStore } from "./store/objects";

const ACTOR = "agent";
const LABEL = "From the swarm";

export type WorkflowFile = {
  workflow: string;
  run: string;
  node: string;
  body: string;
};

export type StoredWorkflowFiles = {
  batchId: string | null;
  stored: string[];
};

function profileOf(value: string): PolicyProfile | null {
  if (value === "standard" || value === "software") return value;
  return null;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Path inside the client space. A blank name returns null. */
export function workflowSpacePath(
  file: Pick<WorkflowFile, "workflow" | "run" | "node">,
  extension = "md",
): string | null {
  const workflow = slug(file.workflow);
  const run = slug(file.run);
  const node = slug(file.node);
  if (!workflow || !run || !node || !/^[a-z0-9]{1,8}$/.test(extension)) return null;
  return `agent/${workflow}/${run}/${node}.${extension}`;
}

async function note(sql: Sql, organizationId: string, body: string, now: number): Promise<void> {
  await sql.run(
    `INSERT INTO activities (
      id, organization_id, kind, actor_kind, actor_id, body, created_at
    ) VALUES (?, ?, 'agent.note', 'agent', 'swarm', ?, ?)`,
    [crypto.randomUUID(), organizationId, body, now],
  );
}

/** Writes swarm output into the client's oldest active space and leaves it for the scan. */
export async function storeWorkflowOutput(input: {
  sql: Sql;
  store: ObjectStore;
  organizationId: string;
  files: WorkflowFile[];
  now: number;
  tag?: "copy" | "reference";
  projectId?: string | null;
}): Promise<StoredWorkflowFiles> {
  const prepared = input.files.flatMap((file) => {
    const adapted = adaptArtifact(file.body);
    if (!adapted) return [];
    const relativePath = workflowSpacePath(file, adapted.extension);
    if (!relativePath) return [];
    return [{ relativePath, bytes: adapted.bytes, contentType: adapted.contentType }];
  });
  if (prepared.length === 0) return { batchId: null, stored: [] };

  const projectId = input.projectId?.trim() || null;
  const space = await input.sql.get<{ id: string; policy_profile: string; quota_bytes: number }>(
    `SELECT id, policy_profile, quota_bytes FROM workspaces
     WHERE organization_id = ? AND status = 'active'
       AND (? IS NULL OR project_id = ? OR project_id IS NULL)
     ORDER BY CASE WHEN project_id = ? THEN 0 ELSE 1 END, opened_at ASC
     LIMIT 1`,
    [input.organizationId, projectId, projectId, projectId],
  );
  const profile = space ? profileOf(space.policy_profile) : null;
  if (!space || !profile) {
    await note(input.sql, input.organizationId, "Swarm output is waiting because this client has no file space.", input.now);
    return { batchId: null, stored: [] };
  }

  const accepted = prepared.flatMap((file) => {
    const inspected = inspectFileName(file.relativePath, profile);
    if (!inspected.ok) return [];
    return [{ ...file, extension: inspected.extension }];
  });
  if (accepted.length === 0) return { batchId: null, stored: [] };

  const used = await input.sql.get<{ n: number }>(
    `SELECT coalesce(sum(f.size_bytes), 0) AS n
     FROM files f
     JOIN batches b ON b.id = f.batch_id
     WHERE f.workspace_id = ? AND f.object_deleted_at IS NULL AND b.deleted_at IS NULL`,
    [space.id],
  );
  const manifest = validateManifest({
    files: accepted.map((file) => ({
      relativePath: file.relativePath,
      sizeBytes: file.bytes.byteLength,
      contentType: file.contentType,
      tag: input.tag ?? "copy",
    })),
    profile,
    workspaceUsedBytes: used?.n ?? 0,
    workspaceQuotaBytes: space.quota_bytes,
  });
  if (!manifest.ok) {
    await note(input.sql, input.organizationId, "Swarm output did not fit in the client's space.", input.now);
    return { batchId: null, stored: [] };
  }

  const batchId = crypto.randomUUID();
  const rows = accepted.map((file) => ({ ...file, id: crypto.randomUUID() }));
  await input.sql.exec("BEGIN");
  try {
    await input.sql.run(
      `INSERT INTO batches (
        id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
      ) VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, NULL, NULL)`,
      [batchId, space.id, ACTOR, LABEL, input.now, input.now],
    );
    for (const file of rows) {
      await input.sql.run(
        `INSERT INTO files (
          id, batch_id, workspace_id, relative_path, extension, declared_content_type,
          size_bytes, object_key, tag, status, scan_attempts, created_at, uploaded_at, next_scan_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', 0, ?, ?, ?)`,
        [
          file.id,
          batchId,
          space.id,
          file.relativePath,
          file.extension,
          file.contentType,
          file.bytes.byteLength,
          `${space.id}/${batchId}/${file.id}`,
          input.tag ?? "copy",
          input.now,
          input.now,
          input.now,
        ],
      );
    }
    await input.sql.exec("COMMIT");
  } catch (error) {
    await input.sql.exec("ROLLBACK");
    throw error;
  }

  const stored: string[] = [];
  for (const file of rows) {
    const key = `${space.id}/${batchId}/${file.id}`;
    try {
      await input.store.put(key, file.bytes);
      stored.push(file.relativePath);
    } catch {
      await input.sql.run("UPDATE files SET status = 'failed', scan_reason = ? WHERE id = ?", ["The file did not save.", file.id]);
    }
  }
  return { batchId, stored };
}
