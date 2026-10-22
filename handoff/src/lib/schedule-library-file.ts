import { addDeliverableItem, createDeliverable, publishDeliverable } from "@/db/deliverables";
import { workspacesFor } from "@/db/records";
import type { Sql } from "@/db/sql";
import type { Caller } from "./authz";
import { fileType } from "./file-type";
import type { ObjectStore } from "./store/objects";
import { isEligibleSocialPlatform, PLATFORM_LABEL } from "./zernio";

export type ScheduleLibraryInput = {
  workspaceId: string;
  fileId: string;
  channel: string;
  caption: string;
  confirmAnother?: boolean;
};

export type ScheduleLibraryResult =
  | { ok: true; itemId: string; organizationId: string; redirect: string }
  | { ok: false; error: "forbidden" | "invalid" | "posted" | "missing"; message: string };

type OpenItem = { id: string; deliverable_id: string; version: number; status: string; deliverable_status: string };
type PostRow = { id: string; status: string };

/** Networks that have an active account, one option per platform. */
export function schedulePlatforms(accounts: { platform: string; is_active: number | boolean }[]): { value: string; label: string }[] {
  const seen = new Set<string>();
  const options: { value: string; label: string }[] = [];
  for (const account of accounts) {
    if (!account.is_active || !isEligibleSocialPlatform(account.platform) || seen.has(account.platform)) continue;
    seen.add(account.platform);
    options.push({ value: account.platform, label: PLATFORM_LABEL[account.platform] ?? account.platform });
  }
  return options;
}

function staffRedirect(organizationId: string, itemId: string, postId?: string): string {
  const params = new URLSearchParams({ tab: "social" });
  if (postId) params.set("post", postId);
  else params.set("piece", itemId);
  return `/clients/${organizationId}?${params.toString()}`;
}

function mediaEntry(key: string, role: string, contentType: string, size: number) {
  return { r2_key: key, role, content_type: contentType, size };
}

function contentTypeFor(path: string, declared: string | null): string {
  if (declared && (declared.startsWith("image/") || declared.startsWith("video/"))) return declared;
  const kind = fileType(path);
  if (kind.kind === "video") return "video/mp4";
  if (kind.extension === "JPG" || kind.extension === "JPEG") return "image/jpeg";
  if (kind.extension === "WEBP") return "image/webp";
  if (kind.extension === "GIF") return "image/gif";
  return "image/png";
}

/**
 * Turns one Library photo or clip into one pending social piece.
 * The client sees it only after a network and a caption are saved.
 */
export async function scheduleLibraryFile(
  sql: Sql,
  store: ObjectStore,
  caller: Caller,
  input: ScheduleLibraryInput,
  now: number,
): Promise<ScheduleLibraryResult> {
  if (!caller.staff || !caller.userId) return { ok: false, error: "forbidden", message: "You can't do that." };
  const channel = input.channel.trim();
  const caption = input.caption.trim();
  if (!channel) return { ok: false, error: "invalid", message: "Pick a network." };
  if (!caption) return { ok: false, error: "invalid", message: "Write a caption." };
  if (!isEligibleSocialPlatform(channel)) return { ok: false, error: "invalid", message: "Pick a network." };

  const visible = await workspacesFor(sql, caller);
  if (!visible.some((space) => space.id === input.workspaceId)) return { ok: false, error: "forbidden", message: "You can't do that." };
  const workspace = await sql.get<{ organization_id: string | null }>(
    "SELECT organization_id FROM workspaces WHERE id = ? AND status != 'purged'",
    [input.workspaceId],
  );
  if (!workspace?.organization_id) return { ok: false, error: "missing", message: "That space is not here." };
  const organizationId = workspace.organization_id;
  const file = await sql.get<{ id: string; relative_path: string; object_key: string; declared_content_type: string | null; status: string }>(
    "SELECT id, relative_path, object_key, declared_content_type, status FROM files WHERE id = ? AND workspace_id = ?",
    [input.fileId, input.workspaceId],
  );
  if (!file) return { ok: false, error: "missing", message: "That file is not here." };
  if (file.status !== "clean") return { ok: false, error: "invalid", message: "That file is not ready." };
  const kind = fileType(file.relative_path).kind;
  if (kind !== "image" && kind !== "video") return { ok: false, error: "invalid", message: "Only a photo or a clip can be scheduled." };

  const account = await sql.get<{ id: string }>(
    "SELECT id FROM social_accounts WHERE organization_id = ? AND is_active = 1 AND platform = ? LIMIT 1",
    [organizationId, channel],
  );
  if (!account) return { ok: false, error: "invalid", message: "Pick a network." };

  const existing = await sql.get<OpenItem>(
    `SELECT i.id, i.deliverable_id, i.version, i.status, d.status AS deliverable_status
     FROM deliverable_items i
     JOIN deliverables d ON d.id = i.deliverable_id AND d.version = i.version
     WHERE i.source_file_id = ? AND d.workspace_id = ?
     ORDER BY d.updated_at DESC, i.sort DESC
     LIMIT 1`,
    [file.id, input.workspaceId],
  );
  if (existing) {
    const posts = await sql.all<PostRow>(
      "SELECT id, status FROM social_posts WHERE item_id = ? AND version = ? ORDER BY created_at DESC",
      [existing.id, existing.version],
    );
    const failed = posts.find((post) => post.status === "failed");
    const posted = posts.some((post) => post.status === "published" || post.status === "partial");
    const live = posts.some((post) => post.status === "sending" || post.status === "scheduled" || post.status === "published" || post.status === "partial");
    const openExisting = async (postId?: string): Promise<ScheduleLibraryResult> => {
      if (existing.deliverable_status === "draft") {
        const published = await publishDeliverable(sql, caller, existing.deliverable_id, now);
        if (!published.ok) return { ok: false, error: "invalid", message: "That piece could not be saved." };
      }
      return { ok: true, itemId: existing.id, organizationId, redirect: staffRedirect(organizationId, existing.id, postId) };
    };
    if (failed && !posted) return openExisting(failed.id);
    if (posted && !input.confirmAnother) {
      return { ok: false, error: "posted", message: "This file is already on the calendar. Schedule another copy?" };
    }
    if (!posted && (existing.status === "pending" || existing.status === "changes_requested" || existing.status === "approved" || live)) {
      return openExisting();
    }
  }

  const bytes = await store.read(file.object_key);
  if (!bytes) return { ok: false, error: "missing", message: "That file is not here." };
  const copied: string[] = [];
  const mainKey = `${crypto.randomUUID()}/${crypto.randomUUID()}/${crypto.randomUUID()}`;
  await store.put(mainKey, bytes);
  copied.push(mainKey);
  const media = [mediaEntry(mainKey, "main", contentTypeFor(file.relative_path, file.declared_content_type), bytes.byteLength)];
  const poster = await sql.get<{ poster_file_id: string }>("SELECT poster_file_id FROM file_posters WHERE file_id = ?", [file.id]);
  if (poster && kind === "video") {
    const still = await sql.get<{ object_key: string; relative_path: string; declared_content_type: string | null }>(
      "SELECT object_key, relative_path, declared_content_type FROM files WHERE id = ?",
      [poster.poster_file_id],
    );
    const stillBytes = still ? await store.read(still.object_key) : null;
    if (still && stillBytes) {
      const posterKey = `${crypto.randomUUID()}/${crypto.randomUUID()}/${crypto.randomUUID()}`;
      await store.put(posterKey, stillBytes);
      copied.push(posterKey);
      media.push(mediaEntry(posterKey, "poster", contentTypeFor(still.relative_path, still.declared_content_type), stillBytes.byteLength));
    }
  }
  const forgetCopy = async () => {
    await Promise.all(copied.map((key) => store.remove(key).catch(() => undefined)));
  };

  const pack = await sql.get<{ id: string }>(
    `SELECT id FROM deliverables
     WHERE workspace_id = ? AND kind = 'social_pack' AND published_version IS NULL
     ORDER BY updated_at DESC LIMIT 1`,
    [input.workspaceId],
  );
  let deliverableId = pack?.id ?? "";
  const baseName = file.relative_path.split("/").pop() ?? file.relative_path;
  if (!deliverableId) {
    const created = await createDeliverable(
      sql,
      caller,
      { organizationId, projectId: null, workspaceId: input.workspaceId, title: baseName, kind: "social_pack" },
      now,
    );
    if (!created.ok) {
      await forgetCopy();
      return { ok: false, error: created.error === "forbidden" ? "forbidden" : "invalid", message: created.error === "forbidden" ? "You can't do that." : "That piece could not be saved." };
    }
    deliverableId = created.value.id;
  }
  const added = await addDeliverableItem(
    sql,
    caller,
    {
      deliverableId,
      title: baseName,
      format: kind === "video" ? "video" : "static",
      channel,
      copyText: caption,
      mediaJson: JSON.stringify(media),
      sourceFileId: file.id,
    },
    now,
  );
  if (!added.ok) {
    await forgetCopy();
    return { ok: false, error: added.error === "forbidden" ? "forbidden" : "invalid", message: added.error === "forbidden" ? "You can't do that." : "That piece could not be saved." };
  }
  const published = await publishDeliverable(sql, caller, deliverableId, now);
  if (!published.ok) return { ok: false, error: "invalid", message: "That piece could not be saved." };
  return { ok: true, itemId: added.value.id, organizationId, redirect: staffRedirect(organizationId, added.value.id) };
}
