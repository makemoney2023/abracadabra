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
  /** Raw file bytes. When set, the body is not used. */
  bytes?: Uint8Array;
  /** Content type for bytes HQ already decoded (a still or a clip). */
  contentType?: string;
  /**
   * The name the sender gave (an agent attachment). A text body named with an allowed text extension (html, csv,
   * txt, ...) keeps that extension instead of becoming .md. Data URLs still go by their content.
   */
  name?: string;
  /**
   * Exact place in the space without the extension, like "Social/Facebook/post-1" (agent filings with folders).
   * When set, workflow, run and node only label the file; the extension still comes from the content.
   */
  path?: string;
};

/** Text types whose given extension is kept. HTML and SVG stay download-only (see preview.ts). */
export const KEPT_TEXT_EXTENSIONS: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  csv: "text/csv",
  txt: "text/plain",
  xml: "application/xml",
  css: "text/css",
  md: "text/markdown",
  json: "application/json",
  svg: "image/svg+xml",
};

/** The kept extension for a named text body, or null when content detection decides. */
export function keptTextExtension(name: string | undefined, body: string): string | null {
  if (!name) return null;
  const match = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  const extension = match?.[1]?.toLowerCase() ?? "";
  if (!KEPT_TEXT_EXTENSIONS[extension]) return null;
  const trimmed = body.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("%PDF")) return null;
  if (extension === "json") {
    try {
      JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return extension;
}

/** The extension storeWorkflowOutput will give this file, or null when it would be skipped. Same order as below. */
const STORED_BYTES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

export function workflowFileExtension(file: Pick<WorkflowFile, "body" | "bytes" | "name" | "contentType">): string | null {
  const typed = file.bytes && file.contentType ? STORED_BYTES[file.contentType] : undefined;
  if (typed) return typed;
  if (file.bytes && isPdfBytes(file.bytes)) return "pdf";
  if (file.bytes && isPngBytes(file.bytes)) return "png";
  const kept = keptTextExtension(file.name, file.body);
  if (kept) return kept;
  return adaptArtifact(file.body)?.extension ?? null;
}

export type StoredWorkflowFiles = {
  batchId: string | null;
  stored: string[];
};

function isPdfBytes(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function isPngBytes(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

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
  file: Pick<WorkflowFile, "workflow" | "run" | "node" | "path">,
  extension = "md",
): string | null {
  if (file.path) return /^[a-z0-9]{1,8}$/.test(extension) ? `${file.path}.${extension}` : null;
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
  /** File into this exact space (must be active and in the organization). Skips the oldest-space pick. */
  workspaceId?: string | null;
  /** Batch label shown in the space. Defaults to "From the swarm". */
  label?: string;
  /** Agent filings: held (staff, Client Services and agents only) until Client Services approves. */
  hold?: boolean;
  /** The agent_work_items row this batch carries. */
  workItemId?: string | null;
}): Promise<StoredWorkflowFiles> {
  const prepared = input.files.flatMap((file) => {
    const typed = file.bytes && file.contentType ? STORED_BYTES[file.contentType] : undefined;
    if (file.bytes && typed) {
      const relativePath = workflowSpacePath(file, typed);
      if (!relativePath) return [];
      return [{ relativePath, bytes: file.bytes, contentType: file.contentType! }];
    }
    if (file.bytes && isPdfBytes(file.bytes)) {
      const relativePath = workflowSpacePath(file, "pdf");
      if (!relativePath) return [];
      return [{ relativePath, bytes: file.bytes, contentType: "application/pdf" }];
    }
    if (file.bytes && isPngBytes(file.bytes)) {
      const relativePath = workflowSpacePath(file, "png");
      if (!relativePath) return [];
      return [{ relativePath, bytes: file.bytes, contentType: "image/png" }];
    }
    const kept = keptTextExtension(file.name, file.body);
    if (kept) {
      const relativePath = workflowSpacePath(file, kept);
      if (!relativePath) return [];
      return [{ relativePath, bytes: new TextEncoder().encode(file.body), contentType: KEPT_TEXT_EXTENSIONS[kept]! }];
    }
    const adapted = adaptArtifact(file.body);
    if (!adapted) return [];
    const relativePath = workflowSpacePath(file, adapted.extension);
    if (!relativePath) return [];
    return [{ relativePath, bytes: adapted.bytes, contentType: adapted.contentType }];
  });
  if (prepared.length === 0) return { batchId: null, stored: [] };

  const projectId = input.projectId?.trim() || null;
  const workspaceId = input.workspaceId?.trim() || null;
  const space = workspaceId
    ? await input.sql.get<{ id: string; policy_profile: string; quota_bytes: number }>(
        "SELECT id, policy_profile, quota_bytes FROM workspaces WHERE id = ? AND organization_id = ? AND status = 'active'",
        [workspaceId, input.organizationId],
      )
    : await input.sql.get<{ id: string; policy_profile: string; quota_bytes: number }>(
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
        id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at,
        held_at, work_item_id
      ) VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?)`,
      [batchId, space.id, ACTOR, input.label ?? LABEL, input.now, input.now, input.hold ? input.now : null, input.workItemId ?? null],
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
