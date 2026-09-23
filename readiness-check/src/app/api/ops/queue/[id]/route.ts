import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOpsSession } from "@/lib/ops/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OpsStatus } from "@/lib/types";

const patchSchema = z.object({
  status: z.enum(["new", "contacted", "won", "skipped", "booked"]).optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireOpsSession();
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.status == null && parsed.data.notes === undefined) {
    return NextResponse.json(
      { error: "Provide status and/or notes" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: existing, error: lookupError } = await admin
    .from("ops_queue")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json(
      { error: "Lookup failed", message: lookupError.message },
      { status: 500 },
    );
  }
  if (!existing) {
    return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
  if (parsed.data.status != null) {
    updates.status = parsed.data.status;
    updates.status_changed_at = new Date().toISOString();
    updates.status_changed_by = session.user.id;
  }

  const { data: updated, error: updateError } = await admin
    .from("ops_queue")
    .update(updates)
    .eq("id", id)
    .select("id, status, notes, status_changed_at")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: "Update failed", message: updateError?.message },
      { status: 500 },
    );
  }

  if (parsed.data.status != null && parsed.data.status !== existing.status) {
    const { error: auditError } = await admin.from("ops_status_audit").insert({
      ops_queue_id: id,
      from_status: existing.status as OpsStatus,
      to_status: parsed.data.status,
      changed_by: session.user.id,
    });
    if (auditError) {
      return NextResponse.json(
        { error: "Audit insert failed", message: auditError.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ item: updated });
}
