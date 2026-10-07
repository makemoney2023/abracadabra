"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DELIVERABLE_ERRORS, recordFeedback, type FeedbackDecision } from "@/db/deliverables";
import { openSession } from "@/lib/current";

export type FormState = { message: string };

function isDecision(value: string): value is FeedbackDecision {
  return value === "approve" || value === "changes";
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
  revalidatePath(`/w/${slug}/work`);
  revalidatePath(`/w/${slug}/work/${saved.value.id}`);
  redirect(`/w/${slug}/work/${saved.value.id}`);
}
