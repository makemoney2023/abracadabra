"use server";

import { revalidatePath } from "next/cache";
import { wakeOrganization } from "@/lib/agent-wake";
import { defaultBuildDeps } from "@/lib/cursor-build";
import { requireHqStaffPage } from "@/lib/current";
import { moveTaskStage, type TaskColumn } from "@/lib/task-stage";

const COLUMNS = new Set<TaskColumn>(["describe", "engineer", "build", "run", "done"]);

const REASON: Record<string, string> = {
  missing: "That task is not on the board.",
  invalid: "That move is not available.",
  brief_not_approved: "Approve the brief first.",
  design_system_not_approved: "Approve the design system first.",
  missing_build_brief: "Write the build brief first.",
  link_a_repo: "Link a repo first.",
  repo_create_failed: "The repo was not created.",
  repo_name_taken: "That repo name is taken.",
  cap_reached: "Every cloud run is busy.",
  agent_paused: "The agent is paused.",
  cursor_start_failed: "The cloud run did not start.",
  prompt_rejected: "Rewrite the build brief.",
};

function columnOf(value: string): TaskColumn | null {
  return COLUMNS.has(value as TaskColumn) ? (value as TaskColumn) : null;
}

export async function moveBoardCardAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const { sql, caller } = await requireHqStaffPage();
  if (!caller.userId) return { ok: false, message: "You can't do that." };
  const taskId = String(formData.get("taskId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const blockedReason = String(formData.get("blockedReason") ?? "");
  const to = columnOf(String(formData.get("to") ?? ""));
  const now = Date.now();
  const moved = await moveTaskStage(sql, {
    taskId,
    to: to ?? undefined,
    direction: direction === "up" || direction === "down" ? direction : undefined,
    blockedReason: blockedReason.trim() ? blockedReason : undefined,
    now,
    actor: { kind: "staff", id: caller.userId },
    build: defaultBuildDeps(now),
    wake: (id, reason) =>
      wakeOrganization(
        { AGENT_URL: process.env.AGENT_URL, AGENT_WAKE_SECRET: process.env.AGENT_WAKE_SECRET },
        id,
        reason,
        now,
      ),
  });
  revalidatePath("/work");
  revalidatePath("/");
  if (organizationId) revalidatePath(`/clients/${organizationId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
  if (!moved.ok) return { ok: false, message: REASON[moved.error] ?? "That move did not stick." };
  if (moved.waiting) return { ok: true, message: "Waiting for a free cloud run." };
  return { ok: true, message: "Moved." };
}
