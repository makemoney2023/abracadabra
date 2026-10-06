"use server";

import { revalidatePath } from "next/cache";
import { moveDealStage } from "@/db/crm";
import { requireHqStaffPage } from "@/lib/current";
import { moveDealMessage } from "./messages";

export type MoveState = { message: string; moved: boolean };

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
