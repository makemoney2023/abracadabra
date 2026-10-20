"use server";

import { revalidatePath } from "next/cache";
import { markFeedRead } from "@/db/crm";
import { clock } from "@/lib/clock";
import { requireHqStaffPage } from "@/lib/current";

/** Today: nothing before now counts as new for this staff member. */
export async function markFeedReadAction(): Promise<void> {
  const { sql, caller } = await requireHqStaffPage();
  await markFeedRead(sql, caller, clock());
  revalidatePath("/");
}
