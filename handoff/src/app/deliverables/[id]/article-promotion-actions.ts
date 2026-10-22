"use server";

import { revalidatePath } from "next/cache";
import { requireHqStaffPage } from "@/lib/current";
import { articleSocialPromoEnabled, createArticlePromotionDraft, promotionRequestId } from "@/lib/article-promotions";
import { inspectCanonicalUrl } from "@/lib/library-artifacts";
import { recordLibraryMetric } from "@/lib/library-metrics";

export type PromotionState = { message: string; href?: string };

export async function createArticlePromotionAction(_previous: PromotionState, formData: FormData): Promise<PromotionState> {
  if (!articleSocialPromoEnabled()) return { message: "Promotion is off." };
  const { sql, caller } = await requireHqStaffPage();
  const sourceItemId = String(formData.get("sourceItemId") ?? "");
  const sourceVersion = Number(formData.get("sourceVersion") ?? "");
  const shown = String(formData.get("canonicalUrl") ?? "");
  const platforms = formData.getAll("platforms").map((value) => String(value));
  const selectedMediaKeys = formData.getAll("selectedMediaKeys").map((value) => String(value));
  const source = await sql.get<{ canonical_url: string | null; link_url: string | null; organization_id: string; workspace_id: string; slug: string }>(
    `SELECT m.canonical_url, i.link_url, d.organization_id, d.workspace_id, w.slug
     FROM deliverable_items i
     JOIN deliverables d ON d.id = i.deliverable_id
     JOIN workspaces w ON w.id = d.workspace_id
     LEFT JOIN deliverable_artifact_metadata m ON m.item_id = i.id AND m.version = i.version
     WHERE i.id = ? AND i.version = ?`,
    [sourceItemId, sourceVersion],
  );
  const canonical = inspectCanonicalUrl(source?.canonical_url ?? source?.link_url, "legacy");
  if (!source || !canonical.ok || canonical.url !== shown) return { message: "The article link changed. Refresh and try again." };
  const result = await createArticlePromotionDraft(sql, caller, {
    sourceItemId,
    sourceVersion,
    targetDeliverableId: String(formData.get("targetDeliverableId") ?? "") || null,
    platforms,
    selectedMediaKeys: formData.has("mediaSelectionPresented") ? selectedMediaKeys : undefined,
    externalId: promotionRequestId({
      requested: String(formData.get("externalId") ?? ""),
      sourceItemId,
      sourceVersion,
      platforms,
    }),
    tracking: { source: platforms[0]?.toLowerCase(), medium: "social", campaign: "article" },
  }, Date.now());
  if (!result.ok) {
    const message = result.error === "invalid"
      ? "Choose an approved or published article, a valid draft, and media from this article."
      : result.error === "forbidden"
        ? "You do not have permission to create this draft."
        : "Could not create the draft.";
    return { message };
  }
  await recordLibraryMetric(sql, {
    name: "article_promotion_created",
    organizationId: source.organization_id,
    workspaceId: source.workspace_id,
    actorKind: "staff",
    actorId: caller.userId,
    artifactType: "article",
  });
  revalidatePath(`/deliverables/${result.deliverableId}`);
  if (source.slug) revalidatePath(`/w/${source.slug}/library`);
  const href = source.slug ? `/w/${source.slug}/work/${result.deliverableId}` : undefined;
  return {
    message: result.duplicate ? "That draft is already saved." : "Draft saved. Review it before anyone posts it.",
    href,
  };
}
