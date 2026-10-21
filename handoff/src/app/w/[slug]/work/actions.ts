"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DELIVERABLE_ERRORS, openDeliverable, recordFeedback, type FeedbackDecision } from "@/db/deliverables";
import { legacyStartsAllowed } from "@/lib/agent-mode";
import { briefWakeReason, wakeOrganization } from "@/lib/agent-wake";
import { openClientChangeRequest } from "@/lib/client-change-request";
import { startRevision } from "@/lib/cursor-build";
import { openSession } from "@/lib/current";
import { FEEDBACK_SAVE_FAILED, SENT } from "./sent";

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
  const body = String(formData.get("body") ?? "");
  let saved: Awaited<ReturnType<typeof recordFeedback>>;
  try {
    saved = await recordFeedback(
      sql,
      caller,
      {
        deliverableId: String(formData.get("deliverableId") ?? ""),
        itemId: itemId || null,
        version: Number.isFinite(version) ? version : -1,
        decision,
        body,
      },
      Date.now(),
    );
  } catch (error) {
    console.error("feedbackAction: saving feedback failed", error);
    return { message: FEEDBACK_SAVE_FAILED };
  }
  if (!saved.ok) return { message: DELIVERABLE_ERRORS[saved.error] };
  // The client's feedback is stored. What follows hands it on; a failure there is logged, not shown as an error.
  try {
    await handOn(sql, caller, { deliverableId: saved.value.id, feedbackId: saved.value.feedbackId, itemId: itemId || null, version, decision, body });
  } catch (error) {
    console.error("feedbackAction: handing feedback on failed", error);
  }
  revalidatePath(`/w/${slug}/work`);
  revalidatePath(`/w/${slug}/work/${saved.value.id}`);
  redirect(`/w/${slug}/work/${saved.value.id}?sent=${SENT[decision]}`);
}

async function handOn(
  sql: Awaited<ReturnType<typeof openSession>>["sql"],
  caller: Awaited<ReturnType<typeof openSession>>["caller"],
  input: { deliverableId: string; feedbackId: string; itemId: string | null; version: number; decision: FeedbackDecision; body: string },
): Promise<void> {
  const { decision } = input;
  const opened = await openDeliverable(sql, caller, input.deliverableId, caller.staff ? "working" : "published");
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
      fetch,
      sql,
    );
  }
  if (!opened || decision !== "changes" || opened.deliverable.kind === "brief" || opened.deliverable.kind === "design_system") {
    return;
  }
  if (!legacyStartsAllowed()) {
    // AGENT_MODE=agents: a To do card for the client's agent, carrying the note, handed to that agent.
    await openClientChangeRequest(sql, {
      deliverableId: opened.deliverable.id,
      itemId: input.itemId,
      version: Number.isFinite(input.version) ? input.version : opened.deliverable.published_version ?? opened.deliverable.version,
      feedbackId: input.feedbackId,
      note: input.body,
      author: caller.staff ? { kind: "staff", id: caller.userId ?? "staff" } : { kind: "client", id: caller.userId ?? "client" },
      now: Date.now(),
    });
    return;
  }
  if (opened.deliverable.status === "changes_requested") {
    const sentAt = Date.now();
    await startRevision(sql, opened.deliverable.id, sentAt, (organizationId, revisionReason) =>
      wakeOrganization(
        { AGENT_URL: process.env.AGENT_URL, AGENT_WAKE_SECRET: process.env.AGENT_WAKE_SECRET },
        organizationId,
        revisionReason,
        sentAt,
        fetch,
        sql,
      ),
    );
  }
}
