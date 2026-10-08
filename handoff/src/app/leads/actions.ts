"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CRM_ERRORS, createManualLead, moveDealStage } from "@/db/crm";
import { requireHqStaffPage } from "@/lib/current";
import { finishManualLead, type ScanQueue } from "@/lib/lead-schema";
import { moveDealMessage } from "./messages";

export type MoveState = { message: string; moved: boolean };

export type LeadFormState = { message: string };

export async function createLeadAction(_previous: LeadFormState, formData: FormData): Promise<LeadFormState> {
  const { sql, caller } = await requireHqStaffPage();
  const now = Date.now();
  const created = await createManualLead(
    sql,
    caller,
    {
      name: String(formData.get("name") ?? ""),
      website: String(formData.get("website") ?? ""),
      contactName: String(formData.get("contactName") ?? ""),
      email: String(formData.get("email") ?? ""),
    },
    now,
  );
  if (!created.ok) return { message: CRM_ERRORS[created.error] };
  const cloudflare = (await getCloudflareContext({ async: true })).env as {
    SCAN_JOBS?: ScanQueue;
    AGENT_URL?: string;
    AGENT_WAKE_SECRET?: string;
  };
  await finishManualLead({
    sql,
    organizationId: created.value.organizationId,
    website: String(formData.get("website") ?? ""),
    now,
    queue: cloudflare.SCAN_JOBS,
    env: {
      AGENT_URL: cloudflare.AGENT_URL || process.env.AGENT_URL,
      AGENT_WAKE_SECRET: cloudflare.AGENT_WAKE_SECRET || process.env.AGENT_WAKE_SECRET,
    },
  });
  revalidatePath("/leads");
  redirect(`/clients/${created.value.organizationId}`);
}

export async function moveDealAction(_previous: MoveState, formData: FormData): Promise<MoveState> {
  const { sql, caller } = await requireHqStaffPage();
  const stage = String(formData.get("stage") ?? "");
  const moved = await moveDealStage(
    sql,
    caller,
    {
      dealId: String(formData.get("dealId") ?? ""),
      stage,
      lostReason: String(formData.get("lostReason") ?? ""),
    },
    Date.now(),
  );
  if (!moved.ok) return { message: moveDealMessage(moved.error, stage), moved: false };
  revalidatePath("/leads");
  revalidatePath("/clients");
  revalidatePath(`/clients/${moved.value.organizationId}`);
  return { message: "", moved: true };
}
