import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { normalizeDomain } from "@/lib/domain";
import { requireOpsSession } from "@/lib/ops/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  leadId: z.string().uuid(),
});

export async function POST(request: Request) {
  const session = await requireOpsSession();
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select("id, domain, website")
    .eq("id", parsed.data.leadId)
    .maybeSingle();

  if (leadError) {
    return NextResponse.json(
      { error: "Lead lookup failed", message: leadError.message },
      { status: 500 },
    );
  }
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  let domain: string;
  let origin: string;
  try {
    ({ domain, origin } = normalizeDomain(lead.website || lead.domain));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid domain" },
      { status: 400 },
    );
  }

  const publicToken = nanoid(24);
  const { data: scan, error: scanError } = await admin
    .from("scans")
    .insert({
      domain,
      origin,
      source: "ops",
      status: "queued",
      public_token: publicToken,
      lead_id: lead.id,
    })
    .select("id, status, public_token")
    .single();

  if (scanError || !scan) {
    return NextResponse.json(
      { error: "Failed to create scan", message: scanError?.message },
      { status: 500 },
    );
  }

  await admin
    .from("ops_queue")
    .update({ latest_scan_id: scan.id })
    .eq("lead_id", lead.id);

  await inngest.send({
    name: "scan/requested",
    data: { scanId: scan.id },
  });

  return NextResponse.json(
    {
      id: scan.id,
      token: scan.public_token,
      status: scan.status,
    },
    { status: 201 },
  );
}
