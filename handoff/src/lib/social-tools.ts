import type { Sql } from "@/db/sql";
import type { Caller } from "./authz";
import { listSocialAccounts, listSocialPosts, sendPieces, zonedTimeToUtc, type SendMode } from "./social";
import { asPostType } from "./social-plan";
import type { ObjectStore } from "./store/objects";
import type { ZernioClient } from "./zernio";

export const SOCIAL_READ_TOOLS = ["list_social_accounts", "list_social_posts"] as const;
export const SOCIAL_WRITE_TOOLS = ["schedule_social"] as const;

export type SocialToolDeps = { zernio: ZernioClient | null; store: ObjectStore };

type Result = { ok: true; value: unknown } | { ok: false; error: "missing" | "invalid" | "unknown" };

function text(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === "string" ? value.trim() : "";
}

function list(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  if (typeof value === "string") return value.split(/[\s,]+/).filter(Boolean);
  return [];
}

/** HQ chat tools for social posting. Returns null for any other tool name. */
export async function runSocialTool(
  sql: Sql,
  caller: Caller,
  tool: string,
  input: Record<string, unknown>,
  now: number,
  deps: () => SocialToolDeps,
): Promise<Result | null> {
  if (tool === "list_social_accounts" || tool === "list_social_posts") {
    const organizationId = text(input, "organizationId");
    const org = await sql.get<{ id: string }>("SELECT id FROM organizations WHERE id = ?", [organizationId]);
    if (!org) return { ok: false, error: "missing" };
    if (tool === "list_social_accounts") {
      const accounts = await listSocialAccounts(sql, organizationId);
      return {
        ok: true,
        value: accounts.map((row) => ({ id: row.id, platform: row.platform, username: row.username, active: row.is_active === 1 })),
      };
    }
    const posts = await listSocialPosts(sql, { organizationId }, 50);
    return {
      ok: true,
      value: posts.map((row) => ({
        id: row.id,
        piece: row.item_title,
        deliverableId: row.deliverable_id,
        type: row.post_type,
        status: row.status,
        scheduledFor: row.scheduled_for ? new Date(row.scheduled_for).toISOString() : null,
        timezone: row.timezone,
        error: row.error,
      })),
    };
  }
  if (tool !== "schedule_social") return null;
  const { zernio, store } = deps();
  if (!zernio) return { ok: true, value: { sent: 0, error: "Zernio is not set up. Add ZERNIO_API_KEY to the staff app." } };
  const deliverableId = text(input, "deliverableId");
  const deliverable = await sql.get<{ id: string; version: number }>("SELECT id, version FROM deliverables WHERE id = ?", [deliverableId]);
  if (!deliverable) return { ok: false, error: "missing" };
  const mode = text(input, "mode") || "draft";
  if (mode !== "draft" && mode !== "scheduled" && mode !== "now") return { ok: false, error: "invalid" };
  const timezone = text(input, "timezone") || "UTC";
  const startAt = mode === "scheduled" ? zonedTimeToUtc(text(input, "startAt"), timezone) : null;
  if (mode === "scheduled" && startAt == null) return { ok: false, error: "invalid" };
  const rawType = text(input, "postType") || "auto";
  const postType = rawType === "auto" ? null : asPostType(rawType);
  if (rawType !== "auto" && !postType) return { ok: false, error: "invalid" };
  let itemIds = list(input, "itemIds");
  if (itemIds.length === 0) {
    itemIds = (
      await sql.all<{ id: string }>(
        "SELECT id FROM deliverable_items WHERE deliverable_id = ? AND version = ? AND format NOT IN ('page', 'link', 'file')",
        [deliverable.id, deliverable.version],
      )
    ).map((row) => row.id);
  }
  let accountIds = list(input, "accountIds");
  if (accountIds.length === 0) {
    const org = await sql.get<{ organization_id: string }>("SELECT organization_id FROM deliverables WHERE id = ?", [deliverable.id]);
    accountIds = (await listSocialAccounts(sql, org?.organization_id ?? ""))
      .filter((row) => row.is_active === 1 && row.platform !== "wordpress" && row.platform !== "wix")
      .map((row) => row.id);
  }
  const gap = Number(input.gapMinutes ?? 1440);
  const result = await sendPieces(
    sql,
    zernio,
    store,
    caller,
    {
      deliverableId: deliverable.id,
      itemIds,
      accountIds,
      mode: mode as SendMode,
      postType,
      startAt,
      gapMinutes: Number.isFinite(gap) ? gap : 1440,
      timezone,
    },
    now,
  );
  return { ok: true, value: result };
}
