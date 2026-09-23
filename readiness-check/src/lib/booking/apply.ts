import { computeOpsPriority } from "@/lib/ops/priority";
import type { AssessmentAdmin } from "@/lib/assessment/repository";
import { getAssessmentByToken } from "@/lib/assessment/repository";
import { addAssessmentEvent } from "@/lib/assessment/repository";
import type { CalBookingEvent } from "./cal-payload";
import type { AssessmentScores } from "@/lib/assessment/types";

function appointmentStatus(kind: CalBookingEvent["kind"]): "scheduled" | "rescheduled" | "cancelled" {
  if (kind === "cancelled") return "cancelled";
  if (kind === "rescheduled") return "rescheduled";
  return "scheduled";
}

export async function applyBookingEvent(admin: AssessmentAdmin, event: CalBookingEvent, raw: unknown) {
  if (event.kind === "ignored" || !event.externalId || !event.startsAt) {
    return { ignored: true as const };
  }

  const assessment = event.assessmentToken
    ? await getAssessmentByToken(admin, event.assessmentToken)
    : null;

  let leadId = assessment?.leadId ?? null;
  if (!leadId && event.email) {
    const { data } = await admin.from("leads").select("id").filter("raw->>email", "eq", event.email).maybeSingle();
    leadId = (data?.id as string | undefined) ?? null;
  }

  const domain =
    assessment?.domain ??
    (event.email?.includes("@") ? event.email.split("@")[1] : null) ??
    `booking-${event.externalId}.invalid`;

  if (!leadId) {
    const { data: byDomain } = await admin.from("leads").select("id").eq("domain", domain).maybeSingle();
    leadId = (byDomain?.id as string | undefined) ?? null;
  }
  if (!leadId) {
    const inserted = await admin
      .from("leads")
      .upsert(
        {
          domain,
          website: domain.includes(".") ? `https://${domain}` : null,
          name: event.name,
          source: "readiness_check_booking",
          raw: { email: event.email, booked_at: new Date().toISOString() },
        },
        { onConflict: "domain" },
      )
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      throw new Error(inserted.error?.message ?? "Lead create failed");
    }
    leadId = inserted.data.id as string;
  }

  const status = appointmentStatus(event.kind);
  const { error: apptError } = await admin.from("appointments").upsert(
    {
      assessment_id: assessment?.id ?? null,
      lead_id: leadId,
      provider: "cal.com",
      external_id: event.externalId,
      starts_at: event.startsAt,
      ends_at: event.endsAt,
      status,
      raw,
    },
    { onConflict: "external_id" },
  );
  if (apptError) throw new Error(apptError.message);

  if (assessment && (event.kind === "created" || event.kind === "rescheduled" || event.kind === "cancelled")) {
    await addAssessmentEvent(admin, assessment.id, event.kind === "cancelled" ? "booking_cancelled" : "booked", {
      externalId: event.externalId,
      startsAt: event.startsAt,
    });
  }

  if (event.kind === "cancelled") return { ignored: false as const, leadId };

  const scores = assessment?.scores as AssessmentScores | null;
  const priority = computeOpsPriority({
    scoreTotal: 100,
    hasContact: true,
    readiness: scores?.readiness.total ?? null,
    topPressureSeverity: scores?.pressures[0]?.severity ?? null,
    booked: true,
  });

  const { data: queue } = await admin.from("ops_queue").select("id, status").eq("lead_id", leadId).maybeSingle();
  if (!queue) {
    await admin.from("ops_queue").insert({
      lead_id: leadId,
      status: "booked",
      missing_contact: false,
      assessment_id: assessment?.id ?? null,
      priority_score: priority,
      status_changed_at: new Date().toISOString(),
    });
  } else if (queue.status !== "booked") {
    await admin.from("ops_status_audit").insert({
      ops_queue_id: queue.id,
      from_status: queue.status,
      to_status: "booked",
    });
    await admin
      .from("ops_queue")
      .update({
        status: "booked",
        priority_score: priority,
        assessment_id: assessment?.id ?? undefined,
        status_changed_at: new Date().toISOString(),
        missing_contact: false,
      })
      .eq("id", queue.id);
  } else {
    await admin.from("ops_queue").update({ priority_score: priority }).eq("id", queue.id);
  }

  if (assessment && !assessment.leadId) {
    await admin.from("assessments").update({ lead_id: leadId }).eq("id", assessment.id);
  }

  return { ignored: false as const, leadId };
}
