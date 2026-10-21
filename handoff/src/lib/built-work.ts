import type { Sql } from "@/db/sql";
import { cleanAgentLabel } from "@/lib/filing-summary";
import { clientVisibleBatch } from "@/lib/held-work";

/**
 * Built work: websites and other things we built for a client, filed by an agent with POST /api/agent-work
 * `built_work` and shown as cards in the client space and in HQ.
 * - Each item has a title, a live URL and/or a preview URL, an optional repo URL, a short description, a status,
 *   and an optional screenshot. The screenshot is an image attachment of the same filing, so it is stored in R2 with
 *   the filing's other files and counts toward the filing size limit (AGENT_WORK_MAX_MB, 10 MB by default).
 * - Visibility follows the filing's batch (see held-work.ts): held until Client Services approves the card, hidden
 *   when the filing is superseded (once the replacement is approved) or withdrawn.
 */

export const BUILT_WORK_STATUSES = ["live", "preview", "in_progress", "archived"] as const;
export type BuiltWorkStatus = (typeof BUILT_WORK_STATUSES)[number];
const STATUSES = new Set<string>(BUILT_WORK_STATUSES);

export const BUILT_WORK_STATUS_LABEL: Record<BuiltWorkStatus, string> = {
  live: "Live",
  preview: "Preview",
  in_progress: "In progress",
  archived: "Archived",
};

export const MAX_BUILT_WORK = 12;
const SCREENSHOT_DATA_URL = /^data:image\/(png|jpeg|webp);base64,/i;
const EXTENSION: Record<string, string> = { png: "png", jpeg: "jpg", webp: "webp" };

export type BuiltWorkInput = {
  title: string;
  liveUrl: string | null;
  previewUrl: string | null;
  repoUrl: string | null;
  description: string | null;
  status: BuiltWorkStatus;
  /** Name of the filing attachment that holds the screenshot, or null. */
  screenshot: string | null;
};

function text(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value ? value.slice(0, max) : null;
}

function httpsUrl(raw: unknown, field: string, index: number): { ok: true; url: string | null } | { ok: false; message: string } {
  if (raw == null || raw === "") return { ok: true, url: null };
  if (typeof raw !== "string") return { ok: false, message: `built_work[${index}].${field} must be an https URL.` };
  const value = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, message: `built_work[${index}].${field} must be an https URL.` };
  }
  if (parsed.protocol !== "https:" || value.length > 2000) return { ok: false, message: `built_work[${index}].${field} must be an https URL.` };
  return { ok: true, url: parsed.toString() };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "site";
}

/**
 * Reads `built_work` (one object or a list of up to 12). `screenshot` is either the name of an image attachment in
 * the same filing, or a data:image/png|jpeg|webp;base64 URL, which becomes an attachment named "<title> screenshot.<ext>".
 * Returns the items plus the attachments to add.
 */
export function parseBuiltWork(
  raw: unknown,
  attachments: { name: string; body: string }[],
): { ok: true; items: BuiltWorkInput[]; added: { name: string; body: string }[] } | { ok: false; message: string } {
  if (raw == null) return { ok: true, items: [], added: [] };
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length === 0) return { ok: true, items: [], added: [] };
  if (list.length > MAX_BUILT_WORK) return { ok: false, message: `built_work takes up to ${MAX_BUILT_WORK} items a filing.` };
  const names = new Set(attachments.map((file) => file.name.toLowerCase()));
  const items: BuiltWorkInput[] = [];
  const added: { name: string; body: string }[] = [];
  for (const [index, entry] of list.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return { ok: false, message: `built_work[${index}] must be an object.` };
    const item = entry as Record<string, unknown>;
    const title = text(item.title, 200);
    if (!title) return { ok: false, message: `built_work[${index}].title is required.` };
    const live = httpsUrl(item.live_url ?? item.url, "live_url", index);
    if (!live.ok) return live;
    const preview = httpsUrl(item.preview_url, "preview_url", index);
    if (!preview.ok) return preview;
    const repo = httpsUrl(item.repo_url, "repo_url", index);
    if (!repo.ok) return repo;
    if (!live.url && !preview.url) return { ok: false, message: `built_work[${index}] needs a live_url or a preview_url.` };
    const statusRaw = (text(item.status, 20) ?? (live.url ? "live" : "preview")).toLowerCase().replace(/[\s-]+/g, "_");
    if (!STATUSES.has(statusRaw)) return { ok: false, message: `built_work[${index}].status must be one of ${BUILT_WORK_STATUSES.join(", ")}.` };
    let screenshot: string | null = null;
    const shot = typeof item.screenshot === "string" ? item.screenshot.trim() : "";
    if (shot) {
      const match = SCREENSHOT_DATA_URL.exec(shot);
      if (match) {
        const extension = EXTENSION[match[1].toLowerCase()]!;
        let name = `${slug(title)}-screenshot.${extension}`;
        for (let n = 2; names.has(name.toLowerCase()); n += 1) name = `${slug(title)}-screenshot-${n}.${extension}`;
        names.add(name.toLowerCase());
        added.push({ name, body: shot });
        screenshot = name;
      } else {
        const named = attachments.find((file) => file.name.toLowerCase() === shot.toLowerCase());
        if (!named) return { ok: false, message: `built_work[${index}].screenshot names no attachment. Send an attachment name or a data:image/png;base64 URL.` };
        if (!SCREENSHOT_DATA_URL.test(named.body.trim())) {
          return { ok: false, message: `built_work[${index}].screenshot must be a PNG, JPEG or WebP image (data:image/png;base64,...).` };
        }
        screenshot = named.name;
      }
    } else if (item.screenshot != null && typeof item.screenshot !== "string") {
      return { ok: false, message: `built_work[${index}].screenshot must be an attachment name or an image data URL.` };
    }
    items.push({
      title,
      liveUrl: live.url,
      previewUrl: preview.url,
      repoUrl: repo.url,
      description: text(item.description, 600),
      status: statusRaw as BuiltWorkStatus,
      screenshot,
    });
  }
  return { ok: true, items, added };
}

/** Lines for the filing's summary page. */
export function builtWorkMarkdown(items: BuiltWorkInput[]): string[] {
  if (items.length === 0) return [];
  const lines = ["", "## Built work", ""];
  for (const item of items) {
    lines.push(`### ${item.title.replace(/[\r\n]+/g, " ")}`, "", `- Status: ${BUILT_WORK_STATUS_LABEL[item.status]}`);
    if (item.liveUrl) lines.push(`- Live: ${item.liveUrl}`);
    if (item.previewUrl) lines.push(`- Preview: ${item.previewUrl}`);
    if (item.repoUrl) lines.push(`- Repo: ${item.repoUrl}`);
    if (item.screenshot) lines.push(`- Screenshot: ${item.screenshot}`);
    if (item.description) lines.push("", item.description);
    lines.push("");
  }
  return lines;
}

type Write = { statement: string; params: readonly unknown[] };

/** Rows for a filed item. screenshotFiles maps an attachment name to its stored file id in the filing's batch. */
export function builtWorkWrites(input: {
  workItemId: string;
  batchId: string;
  organizationId: string;
  workspaceId: string;
  projectId: string | null;
  items: BuiltWorkInput[];
  screenshotFiles: Map<string, string>;
  now: number;
}): Write[] {
  return input.items.map((item, position) => ({
    statement: `INSERT INTO built_work (id, work_item_id, batch_id, organization_id, workspace_id, project_id, position, title, live_url,
                  preview_url, repo_url, description, status, screenshot_file_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      crypto.randomUUID(), input.workItemId, input.batchId, input.organizationId, input.workspaceId, input.projectId, position, item.title,
      item.liveUrl, item.previewUrl, item.repoUrl, item.description, item.status,
      item.screenshot ? input.screenshotFiles.get(item.screenshot.toLowerCase()) ?? null : null, input.now,
    ],
  }));
}

export type BuiltWorkCard = {
  id: string;
  workItemId: string;
  title: string;
  liveUrl: string | null;
  previewUrl: string | null;
  repoUrl: string | null;
  description: string | null;
  status: BuiltWorkStatus;
  statusLabel: string;
  screenshotFileId: string | null;
  /** client: the client sees it. held: waiting on Client Services. hidden: superseded or withdrawn (staff only). */
  visibility: "client" | "held" | "hidden";
  spaceSlug: string;
  spaceName: string;
  agentLabel: string | null;
  filedAt: number;
};

type Row = {
  id: string; work_item_id: string; title: string; live_url: string | null; preview_url: string | null; repo_url: string | null;
  description: string | null; status: string; screenshot_file_id: string | null; created_at: number; held_at: number | null;
  released_at: number | null; hidden_at: number | null; slug: string; display_name: string; agent_label: string | null;
  screenshot_ok: number | null;
};

/**
 * Built work for one space or one client, newest filing first, then filed order. clientView: only what client
 * members may see (released or never held, not hidden). Staff views include held and (with includeHidden) retired items.
 */
export async function listBuiltWork(
  sql: Sql,
  input: { workspaceId?: string; organizationId?: string; clientView: boolean; includeHidden?: boolean; limit?: number },
): Promise<BuiltWorkCard[]> {
  if (!input.workspaceId && !input.organizationId) return [];
  const where: string[] = ["w.state = 'filed'", "b.discarded_at IS NULL", "b.deleted_at IS NULL"];
  const params: unknown[] = [];
  if (input.workspaceId) {
    where.push("bw.workspace_id = ?");
    params.push(input.workspaceId);
  }
  if (input.organizationId) {
    where.push("bw.organization_id = ?");
    params.push(input.organizationId);
  }
  if (input.clientView) where.push(clientVisibleBatch("b"));
  else if (!input.includeHidden) where.push("b.hidden_at IS NULL");
  const limit = Math.min(Math.max(Math.floor(input.limit ?? 60), 1), 200);
  const rows = await sql.all<Row>(
    `SELECT bw.id, bw.work_item_id, bw.title, bw.live_url, bw.preview_url, bw.repo_url, bw.description, bw.status, bw.screenshot_file_id,
            bw.created_at, b.held_at, b.released_at, b.hidden_at, s.slug, s.display_name, a.label AS agent_label,
            (SELECT 1 FROM files f WHERE f.id = bw.screenshot_file_id AND f.object_deleted_at IS NULL) AS screenshot_ok
     FROM built_work bw
     JOIN agent_work_items w ON w.id = bw.work_item_id
     JOIN batches b ON b.id = bw.batch_id
     JOIN workspaces s ON s.id = bw.workspace_id
     LEFT JOIN client_agents a ON a.id = w.agent_id
     WHERE ${where.join(" AND ")}
     ORDER BY bw.created_at DESC, bw.position ASC
     LIMIT ${limit}`,
    params,
  );
  return rows.map((row) => {
    const status = (STATUSES.has(row.status) ? row.status : "live") as BuiltWorkStatus;
    const visibility = row.hidden_at != null ? "hidden" : row.held_at != null && row.released_at == null ? "held" : "client";
    return {
      id: row.id,
      workItemId: row.work_item_id,
      title: row.title,
      liveUrl: row.live_url,
      previewUrl: row.preview_url,
      repoUrl: row.repo_url,
      description: row.description,
      status,
      statusLabel: BUILT_WORK_STATUS_LABEL[status],
      screenshotFileId: row.screenshot_ok === 1 ? row.screenshot_file_id : null,
      visibility,
      spaceSlug: row.slug,
      spaceName: row.display_name,
      agentLabel: input.clientView || !row.agent_label ? null : cleanAgentLabel(row.agent_label),
      filedAt: row.created_at,
    };
  });
}

/** Host name for a card ("renewimplants.ca"), without www. */
export function displayHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** For the agent read-back (GET /api/agent-work): built work on these filings, by work item id. */
export async function builtWorkByItem(sql: Sql, ids: string[]): Promise<Map<string, Record<string, unknown>[]>> {
  const out = new Map<string, Record<string, unknown>[]>();
  if (ids.length === 0) return out;
  const rows = await sql.all<{
    work_item_id: string; title: string; live_url: string | null; preview_url: string | null; repo_url: string | null;
    description: string | null; status: string; screenshot_file_id: string | null;
  }>(
    `SELECT work_item_id, title, live_url, preview_url, repo_url, description, status, screenshot_file_id FROM built_work
     WHERE work_item_id IN (${ids.map(() => "?").join(", ")}) ORDER BY position`,
    ids,
  );
  for (const row of rows) {
    const list = out.get(row.work_item_id) ?? [];
    list.push({
      title: row.title, live_url: row.live_url, preview_url: row.preview_url, repo_url: row.repo_url, description: row.description,
      status: row.status, screenshot_file_id: row.screenshot_file_id,
    });
    out.set(row.work_item_id, list);
  }
  return out;
}
