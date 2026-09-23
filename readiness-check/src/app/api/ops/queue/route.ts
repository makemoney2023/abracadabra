import { NextResponse } from "next/server";
import { requireOpsSession } from "@/lib/ops/auth";
import {
  applyQueueFilters,
  mapQueueRow,
  parseQueueFilters,
  type DbQueueRow,
} from "@/lib/ops/queue";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const session = await requireOpsSession();
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const filters = parseQueueFilters(new URL(request.url).searchParams);
  const admin = createAdminClient();

  let query = admin
    .from("ops_queue")
    .select(
      `
      id,
      lead_id,
      status,
      priority_score,
      missing_contact,
      notes,
      status_changed_at,
      leads (
        id,
        name,
        domain,
        website,
        industry,
        contacts (
          id,
          name,
          title,
          email,
          phone
        )
      ),
      scans:latest_scan_id (
        id,
        score_total,
        status,
        public_token,
        score_breakdown,
        scan_findings (
          code,
          severity,
          passed,
          message
        )
      ),
      assessments:assessment_id (
        public_token,
        scores,
        answers,
        appointments (
          starts_at,
          status
        )
      )
    `,
    )
    .order("priority_score", { ascending: false });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: "Failed to load queue", message: error.message },
      { status: 500 },
    );
  }

  const items = applyQueueFilters(
    ((data ?? []) as unknown as DbQueueRow[]).map(mapQueueRow),
    {
      hasEmail: filters.hasEmail,
      minScore: filters.minScore,
      maxScore: filters.maxScore,
    },
  );

  return NextResponse.json({ items });
}
