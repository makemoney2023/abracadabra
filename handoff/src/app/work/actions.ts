"use server";

import { revalidatePath } from "next/cache";
import { wakeOrganization } from "@/lib/agent-wake";
import { defaultBuildDeps } from "@/lib/cursor-build";
import { requireHqStaffPage } from "@/lib/current";
import { isMoveTarget, moveTaskStage, type MoveTarget } from "@/lib/task-stage";
import { decideReview, type ReviewDecision } from "@/lib/task-review";
import { writeTaskPack } from "@/lib/task-packs";
import { cloudflareSkillReader } from "@/lib/cloudflare-skills";
import { openObjectStore } from "@/lib/store/objects";
import { isLiveSuperAdmin } from "@/lib/store/staff";

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
  not_in_review: "That card is not waiting on Client Services.",
  note_required: "Add a note so the agent knows what to change.",
};

/** The board sends a column (todo, doing, review, done); Run swarm sends run. */
function columnOf(value: string): MoveTarget | null {
  return isMoveTarget(value) ? value : null;
}

function wakeFor(now: number) {
  return (id: string, reason: Parameters<typeof wakeOrganization>[2]) =>
    wakeOrganization({ AGENT_URL: process.env.AGENT_URL, AGENT_WAKE_SECRET: process.env.AGENT_WAKE_SECRET }, id, reason, now);
}

export async function assignTaskPackAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const { sql } = await requireHqStaffPage();
  const taskId = String(formData.get("taskId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const templateId = String(formData.get("templateId") ?? "");
  const origin = process.env.SWARM_ORIGIN?.trim() ?? "";
  if (!origin.startsWith("https://") || !templateId.startsWith("pack-")) {
    return { ok: false, message: "Pick a pack." };
  }
  let body: unknown = null;
  try {
    const response = await fetch(`${origin.replace(/\/$/, "")}/api/template?id=${encodeURIComponent(templateId)}`, {
      signal: AbortSignal.timeout(2500),
    });
    if (response.ok) body = await response.json();
  } catch {
    body = null;
  }
  const wrote = await writeTaskPack(sql, taskId, templateId, body, Date.now());
  revalidatePath("/work");
  if (organizationId) revalidatePath(`/clients/${organizationId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
  if (!wrote) return { ok: false, message: "That pack has no skill steps." };
  return { ok: true, message: "Pack saved." };
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
    swarm: { origin: process.env.SWARM_ORIGIN ?? "", store: openObjectStore() },
    readSkill: await cloudflareSkillReader(),
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

const DECISIONS = new Set<ReviewDecision>(["approve", "progress", "build"]);

/**
 * Admin override for a Review card: approve to done, or send back with a note. Client Services normally decides
 * these through POST /api/client-services/reviews/<taskId>. Super admins only.
 */
export async function reviewCardAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const { sql, caller } = await requireHqStaffPage();
  if (!caller.userId || !(await isLiveSuperAdmin(sql, caller))) {
    return { ok: false, message: "Client Services decides reviews. Only an admin can override." };
  }
  const taskId = String(formData.get("taskId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const decision = String(formData.get("decision") ?? "") as ReviewDecision;
  if (!DECISIONS.has(decision)) return { ok: false, message: "Pick approve or send back." };
  const note = String(formData.get("note") ?? "");
  const now = Date.now();
  const decided = await decideReview(sql, {
    taskId,
    decision,
    note,
    now,
    actor: { kind: "staff", id: caller.userId },
    build: defaultBuildDeps(now),
    swarm: { origin: process.env.SWARM_ORIGIN ?? "", store: openObjectStore() },
    readSkill: await cloudflareSkillReader(),
    wake: wakeFor(now),
  });
  revalidatePath("/work");
  revalidatePath("/");
  if (organizationId) revalidatePath(`/clients/${organizationId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
  if (!decided.ok) return { ok: false, message: REASON[decided.error] ?? "That did not stick." };
  if (decision === "approve") return { ok: true, message: "Override: approved. Moved to done." };
  if (decided.waiting) return { ok: true, message: "Sent back. Waiting for a free cloud run." };
  return { ok: true, message: decision === "build" ? "Sent back to build." : "Sent back to in progress." };
}
