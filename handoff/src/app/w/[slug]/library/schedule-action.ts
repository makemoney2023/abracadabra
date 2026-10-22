"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ScheduleState } from "@/components/library/schedule-this-form";
import { openSession } from "@/lib/current";
import { hqOriginForHost, isHqHost } from "@/lib/host";
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
  const host = (await headers()).get("host") ?? "";
  redirect(isHqHost(host) ? saved.redirect : `${hqOriginForHost(host)}${saved.redirect}`);
}
