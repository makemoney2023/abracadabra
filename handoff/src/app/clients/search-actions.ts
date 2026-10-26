"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireHqStaffPage } from "@/lib/current";
import { mapSearchProperty, removeSearchProperty } from "@/lib/search/properties";
import { requestSearchSync, type RequestSyncError, type SearchQueue } from "@/lib/search/sync";

const MAP_ERROR: Record<"invalid" | "missing" | "taken" | "duplicate", string> = {
  invalid: "Use sc-domain:example.com or https://www.example.com/.",
  missing: "That client was not found.",
  taken: "That property is already mapped to another client.",
  duplicate: "That property is already mapped here.",
};

/** Staff map a Search Console property to this client. HQ checks access on the next hourly run. */
export async function mapSearchPropertyAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const result = await mapSearchProperty(sql, caller, {
    organizationId,
    siteUrl: String(formData.get("siteUrl") ?? ""),
    now: Date.now(),
  });
  if (!result.ok) return fail(MAP_ERROR[result.error], result.error === "invalid" ? "siteUrl" : undefined);
  revalidatePath(`/clients/${organizationId}`);
  return ok(`Mapped ${result.property.site_url}. HQ checks access within the hour.`);
}

export async function removeSearchPropertyAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const result = await removeSearchProperty(sql, caller, {
    organizationId,
    propertyId: String(formData.get("propertyId") ?? ""),
    now: Date.now(),
  });
  if (!result.ok) return fail("That property is not mapped to this client.");
  revalidatePath(`/clients/${organizationId}`);
  return ok("Removed the mapping. Data already pulled stays until it is purged.");
}

const SYNC_ERROR: Record<RequestSyncError, string> = {
  missing: "That property is not mapped to this client.",
  inactive: "HQ can only sync a connected property. Wait for the hourly access check.",
  no_queue: "The search-sync queue is not set up on this Worker yet.",
  running: "History is already loading for this property.",
};

/**
 * Staff "Sync now" (last 4 days) and "Load history" (16 months). handoff-hq never holds the Google key: this only puts
 * a message on the search-sync queue; the handoff Worker's consumer does the Google calls.
 */
export async function requestSearchSyncAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const mode = formData.get("mode") === "backfill" ? "backfill" : "daily";
  let queue: SearchQueue | undefined;
  try {
    queue = ((await getCloudflareContext({ async: true })).env as { SEARCH_SYNC?: SearchQueue }).SEARCH_SYNC;
  } catch {
    queue = undefined;
  }
  const result = await requestSearchSync(sql, caller, {
    organizationId,
    propertyId: String(formData.get("propertyId") ?? ""),
    mode,
    queue,
  });
  if (!result.ok) return fail(SYNC_ERROR[result.error]);
  revalidatePath(`/clients/${organizationId}`);
  return ok(mode === "backfill" ? "Queued. HQ loads 16 months of history, newest days first." : "Queued. HQ pulls the last 4 days within a few minutes.");
}
