/** Minimal Supabase-like client surface for public opt-in. */
export type OptInClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type PublicOptInInput = {
  scanId?: string;
  domain: string;
  origin: string;
  email: string;
  name?: string;
  /** Defaults to the public scan form. */
  source?: string;
  assessmentId?: string;
  priorityScore?: number;
  missingContact?: boolean;
};

export type PublicOptInResult = {
  leadId: string;
  queueCreated: boolean;
};

/**
 * Upsert a lead by domain, ensure an ops_queue row exists (status new),
 * and link the scan to the lead.
 */
export async function applyPublicOptIn(
  client: OptInClient,
  input: PublicOptInInput,
): Promise<PublicOptInResult> {
  const { data: lead, error: leadError } = await client
    .from("leads")
    .upsert(
      {
        domain: input.domain,
        website: input.origin,
        name: input.name ?? null,
        source: input.source ?? "public_opt_in",
        raw: { email: input.email, opted_in_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "domain" },
    )
    .select("id")
    .single();

  if (leadError || !lead) {
    throw new Error(`Lead upsert failed: ${leadError?.message ?? "unknown"}`);
  }

  const leadId = lead.id as string;

  const { data: existingQueue, error: queueLookupError } = await client
    .from("ops_queue")
    .select("id")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (queueLookupError) {
    throw new Error(`Ops queue lookup failed: ${queueLookupError.message}`);
  }

  const extras: Record<string, unknown> = {};
  if (input.assessmentId) extras.assessment_id = input.assessmentId;
  if (typeof input.priorityScore === "number") extras.priority_score = input.priorityScore;

  let queueCreated = false;
  if (!existingQueue) {
    const { error: queueInsertError } = await client.from("ops_queue").insert({
      lead_id: leadId,
      status: "new",
      missing_contact: input.missingContact ?? false,
      ...(input.scanId ? { latest_scan_id: input.scanId } : {}),
      ...extras,
    });
    if (queueInsertError) {
      throw new Error(`Ops queue insert failed: ${queueInsertError.message}`);
    }
    queueCreated = true;
  } else {
    const patch: Record<string, unknown> = { ...extras };
    if (input.scanId) patch.latest_scan_id = input.scanId;
    if (input.missingContact != null) patch.missing_contact = input.missingContact;
    const { error: queueUpdateError } = await client
      .from("ops_queue")
      .update(patch)
      .eq("lead_id", leadId);
    if (queueUpdateError) {
      throw new Error(`Ops queue update failed: ${queueUpdateError.message}`);
    }
  }

  if (input.scanId) {
    const { error: scanError } = await client
      .from("scans")
      .update({ lead_id: leadId })
      .eq("id", input.scanId);

    if (scanError) {
      throw new Error(`Scan lead link failed: ${scanError.message}`);
    }
  }

  return { leadId, queueCreated };
}
