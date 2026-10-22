"use server";

import { redirect } from "next/navigation";
import type { ScheduleState } from "@/components/library/schedule-this-form";
import { openSession } from "@/lib/current";
import { scheduleLibraryFile } from "@/lib/schedule-library-file";
import { openObjectStore } from "@/lib/store/objects";

export async function scheduleLibraryFileAction(_previous: ScheduleState, formData: FormData): Promise<ScheduleState> {
  const { sql, caller } = await openSession();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const saved = await scheduleLibraryFile(
    sql,
    openObjectStore(),
    caller,
    {
      workspaceId,
      fileId: String(formData.get("fileId") ?? ""),
      channel: String(formData.get("channel") ?? ""),
      caption: String(formData.get("caption") ?? ""),
      confirmAnother: formData.get("confirmAnother") === "yes",
    },
    Date.now(),
  );
  if (!saved.ok) return { message: saved.message, confirm: saved.error === "posted" };
  redirect(saved.redirect);
}
