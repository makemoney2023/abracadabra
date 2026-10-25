"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireHqStaffPage } from "@/lib/current";
import { mapSearchProperty, removeSearchProperty } from "@/lib/search/properties";

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
