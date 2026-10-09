"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DELIVERABLE_ERRORS, openDeliverable, recordFeedback, type FeedbackDecision } from "@/db/deliverables";
import { briefWakeReason, wakeOrganization } from "@/lib/agent-wake";
import { startRevision } from "@/lib/cursor-build";
import { openSession } from "@/lib/current";

export type FormState = { message: string };

function isDecision(value: string): value is FeedbackDecision {
  return value === "approve" || value === "changes" || value === "comment";
}

export async function feedbackAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await openSession();
  const decision = String(formData.get("decision") ?? "");
  if (!isDecision(decision)) return { message: DELIVERABLE_ERRORS.invalid };
  const itemId = String(formData.get("itemId") ?? "");
  const version = Number(formData.get("version"));
  const slug = String(formData.get("slug") ?? "");
  const saved = await recordFeedback(
    sql,
    caller,
    {
      deliverableId: String(formData.get("deliverableId") ?? ""),
      itemId: itemId || null,
      version: Number.isFinite(version) ? version : -1,
      decision,
      body: String(formData.get("body") ?? ""),
    },
    Date.now(),
  );
  if (!saved.ok) return { message: DELIVERABLE_ERRORS[saved.error] };
  const opened = await openDeliverable(sql, caller, saved.value.id, caller.staff ? "working" : "published");
  const organizationId = opened?.deliverable.organization_id ?? "";
  const paused = organizationId
    ? await sql.get<{ agent_paused_at: number | null }>(
        "SELECT agent_paused_at FROM organizations WHERE id = ?",
        [organizationId],
      )
    : null;
  const planned = organizationId
    ? await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE organization_id = ?", [organizationId])
    : null;
  const reason = opened
    ? briefWakeReason({
        kind: opened.deliverable.kind,
        status: opened.deliverable.status,
        decision,
        paused: paused?.agent_paused_at != null,
        planned: (planned?.n ?? 0) > 0,
      })
    : null;
  if (reason && opened) {
    await wakeOrganization(
      { AGENT_URL: process.env.AGENT_URL, AGENT_WAKE_SECRET: process.env.AGENT_WAKE_SECRET },
      opened.deliverable.organization_id,
      reason,
      Date.now(),
    );
  }
  if (
    opened &&
    opened.deliverable.status === "changes_requested" &&
    opened.deliverable.kind !== "brief" &&
    opened.deliverable.kind !== "design_system"
  ) {
    const sentAt = Date.now();
    await startRevision(sql, opened.deliverable.id, sentAt, (organizationId, revisionReason) =>
      wakeOrganization(
        { AGENT_URL: process.env.AGENT_URL, AGENT_WAKE_SECRET: process.env.AGENT_WAKE_SECRET },
        organizationId,
        revisionReason,
        sentAt,
      ),
    );
  }
  revalidatePath(`/w/${slug}/work`);
  revalidatePath(`/w/${slug}/work/${saved.value.id}`);
  redirect(`/w/${slug}/work/${saved.value.id}`);
}
