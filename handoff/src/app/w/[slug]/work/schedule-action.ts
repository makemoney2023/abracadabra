"use server";

import { openSession } from "@/lib/current";
import { PlanError, prepareSocialPlan } from "@/lib/social-plans";

export type ScheduleFormState = {
  message: string;
  planId?: string;
  rows?: { accountId: string; platform: string; postType: string; scheduleAt: number | null }[];
};

const initialMessage = "Choose an account and a time.";

/** Prepare one plan for this approved piece. Nothing is sent from this action. */
export async function preparePieceScheduleAction(_previous: ScheduleFormState, formData: FormData): Promise<ScheduleFormState> {
  const { sql, caller } = await openSession();
  if (!caller.userId) return { message: "Sign in to schedule this." };
  const deliverableId = String(formData.get("deliverableId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const accountIds = formData.getAll("accountId").filter((value): value is string => typeof value === "string" && value.length > 0);
  const startAt = Date.parse(String(formData.get("startAt") ?? ""));
  if (!deliverableId || !itemId || !organizationId || accountIds.length === 0 || Number.isNaN(startAt)) {
    return { message: initialMessage };
  }
  const row = await sql.get<{ workspace_id: string; organization_id: string }>(
    "SELECT workspace_id, organization_id FROM deliverables WHERE id = ?",
    [deliverableId],
  );
  if (!row || row.organization_id !== organizationId) return { message: "That piece is not here." };
  const staff = Boolean(caller.staff) || caller.operatorOf.includes(row.workspace_id);
  if (!staff) return { message: "Only the studio can schedule this." };
  const now = Date.now();
  try {
    const plan = await prepareSocialPlan(sql, {
      organizationId,
      actor: { kind: "staff", id: caller.userId },
      action: "schedule",
      mode: "explicit",
      itemIds: [itemId],
      accountIds,
      timing: { kind: "scheduled", startAt, gapMinutes: 60, now },
      now,
    });
    const rows = plan.executable.map((entry) => ({
      accountId: entry.accountId,
      platform: entry.platform,
      postType: entry.postType,
      scheduleAt: entry.scheduleAt,
    }));
    if (plan.authorization === "denied" || rows.length === 0) {
      const unapproved = plan.blocked.some((entry) => entry.reason === "unapproved");
      return { message: unapproved ? "The client has not approved this piece." : "Nothing to put on the calendar.", rows, planId: plan.planId };
    }
    return { message: "Plan ready. Nothing is sent until it is executed.", rows, planId: plan.planId };
  } catch (error) {
    if (error instanceof PlanError) return { message: "That plan could not be prepared." };
    return { message: "That plan could not be prepared." };
  }
}
