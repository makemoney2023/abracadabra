"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { organizationById } from "@/db/crm";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireHqStaffPage } from "@/lib/current";
import { hostnameOf, hqOriginForHost } from "@/lib/host";
import { connectLink, disconnectSocialAccount, sendPieces, zonedTimeToUtc, type SendMode } from "@/lib/social";
import { asPostType } from "@/lib/social-plan";
import { openObjectStore } from "@/lib/store/objects";
import { CONNECT_PLATFORMS, openZernio, type ConnectPlatform } from "@/lib/zernio";

const NOT_SET_UP = "Zernio is not set up. Add ZERNIO_API_KEY to the staff app.";
const PLATFORM_SET = new Set<string>(CONNECT_PLATFORMS);
const MODES = new Set<string>(["draft", "scheduled", "now"]);

async function staffOrigin(): Promise<string> {
  const host = (await headers()).get("host") ?? "";
  const name = hostnameOf(host);
  if (name === "hq.localhost" || name === "localhost" || name === "127.0.0.1") return `http://${host}`;
  return hqOriginForHost(host);
}

function socialTab(organizationId: string, extra = ""): string {
  return `/clients/${organizationId}?tab=social${extra}`;
}

/** Opens Zernio's sign-in for one network. Zernio sends the browser back to the client's Social tab. */
export async function connectSocialAction(formData: FormData): Promise<void> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const platform = String(formData.get("platform") ?? "");
  const organization = await organizationById(sql, caller, organizationId);
  if (!organization) redirect("/clients");
  const zernio = openZernio();
  if (!zernio || !PLATFORM_SET.has(platform)) redirect(socialTab(organization.id, "&social=setup"));
  let authUrl: string;
  try {
    authUrl = await connectLink(
      sql,
      zernio,
      organization,
      platform as ConnectPlatform,
      `${await staffOrigin()}${socialTab(organization.id, "&social=connected")}`,
      Date.now(),
    );
  } catch {
    redirect(socialTab(organization.id, "&social=failed"));
  }
  redirect(authUrl);
}

export async function disconnectSocialAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const organization = await organizationById(sql, caller, organizationId);
  if (!organization) return fail("That client is not here.");
  const zernio = openZernio();
  if (!zernio) return fail(NOT_SET_UP);
  try {
    const removed = await disconnectSocialAccount(sql, zernio, organization.id, String(formData.get("accountId") ?? ""));
    if (!removed) return fail("That account is not on this client.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Zernio did not answer.");
  }
  revalidatePath(socialTab(organization.id));
  return ok("This account is disconnected.");
}

/**
 * Sends one piece or every picked piece of a finished-work round to the picked accounts.
 * Scheduled pieces start at the picked time and each next one waits the picked gap.
 */
export async function sendToSocialAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const zernio = openZernio();
  if (!zernio) return fail(NOT_SET_UP);
  const deliverableId = String(formData.get("deliverableId") ?? "");
  const deliverable = await sql.get<{ organization_id: string; project_id: string | null }>(
    "SELECT organization_id, project_id FROM deliverables WHERE id = ?",
    [deliverableId],
  );
  if (!deliverable || !caller.staff) return fail("That finished work is not here.");
  const itemIds = formData.getAll("itemId").map(String).filter(Boolean);
  const accountIds = formData.getAll("accountId").map(String).filter(Boolean);
  if (itemIds.length === 0) return fail("Pick at least one piece.", "itemId");
  if (accountIds.length === 0) return fail("Pick at least one account.", "accountId");
  const mode = String(formData.get("mode") ?? "draft");
  if (!MODES.has(mode)) return fail("Pick draft, schedule, or post now.");
  const timezone = String(formData.get("timezone") ?? "UTC") || "UTC";
  const rawType = String(formData.get("postType") ?? "auto");
  const postType = rawType === "auto" ? null : asPostType(rawType);
  if (rawType !== "auto" && !postType) return fail("Pick a post type.", "postType");
  let startAt: number | null = null;
  if (mode === "scheduled") {
    startAt = zonedTimeToUtc(String(formData.get("startAt") ?? ""), timezone);
    if (startAt == null) return fail("Pick a date and time.", "startAt");
  }
  const gapMinutes = Number(formData.get("gapMinutes") ?? 0);
  const result = await sendPieces(
    sql,
    zernio,
    openObjectStore(),
    caller,
    {
      deliverableId,
      itemIds,
      accountIds,
      mode: mode as SendMode,
      postType,
      startAt,
      gapMinutes: Number.isFinite(gapMinutes) ? gapMinutes : 0,
      timezone,
    },
    Date.now(),
  );
  revalidatePath(`/deliverables/${deliverableId}`);
  revalidatePath(socialTab(deliverable.organization_id));
  const verb = mode === "draft" ? "Saved" : mode === "now" ? "Sent" : "Scheduled";
  const notes = [...result.failed.map((row) => row.error), ...result.skipped];
  if (result.sent === 0) return fail(notes.join(" ") || "Nothing was sent.");
  const summary = `${verb} ${result.sent} piece${result.sent === 1 ? "" : "s"}.`;
  return ok(notes.length > 0 ? `${summary} Not sent: ${notes.join(" ")}` : summary);
}
