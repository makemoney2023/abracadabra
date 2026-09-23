import { computeOpsPriority } from "@/lib/ops/priority";
import type { AssessmentAdmin } from "./repository";
import type { AssessmentScores } from "./types";

const HOURS = 48;

/**
 * Mark in-progress checks older than 48 hours as abandoned.
 * When a domain is known and no lead is linked, keep a partial lead for ops.
 */
export async function sweepAbandoned(admin: AssessmentAdmin, now = new Date()): Promise<{ marked: number }> {
  const cutoff = new Date(now.getTime() - HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("assessments")
    .select("id, domain, lead_id, scores, scan_id")
    .eq("status", "in_progress")
    .lt("updated_at", cutoff);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    domain: string | null;
    lead_id: string | null;
    scores: AssessmentScores | null;
    scan_id: string | null;
  }>;

  for (const row of rows) {
    await admin.from("assessments").update({ status: "abandoned" }).eq("id", row.id).eq("status", "in_progress");
    if (!row.domain || row.lead_id) continue;

    const { data: existing } = await admin.from("leads").select("id").eq("domain", row.domain).maybeSingle();
    let leadId = existing?.id as string | undefined;
    if (!leadId) {
      const inserted = await admin
        .from("leads")
        .insert({
          domain: row.domain,
          website: `https://${row.domain}`,
          source: "readiness_check_partial",
          raw: { abandoned_assessment_id: row.id },
        })
        .select("id")
        .single();
      leadId = inserted.data?.id as string | undefined;
    }
    if (!leadId) continue;

    const priority = computeOpsPriority({
      scoreTotal: 100,
      hasContact: false,
      readiness: row.scores?.readiness.total ?? null,
      topPressureSeverity: row.scores?.pressures[0]?.severity ?? null,
      booked: false,
    });
    const { data: queue } = await admin.from("ops_queue").select("id").eq("lead_id", leadId).maybeSingle();
    if (!queue) {
      await admin.from("ops_queue").insert({
        lead_id: leadId,
        status: "new",
        missing_contact: true,
        assessment_id: row.id,
        priority_score: priority,
        ...(row.scan_id ? { latest_scan_id: row.scan_id } : {}),
      });
    }
    await admin.from("assessments").update({ lead_id: leadId }).eq("id", row.id);
  }

  return { marked: rows.length };
}
