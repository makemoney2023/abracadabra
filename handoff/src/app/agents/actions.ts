"use server";

import { revalidatePath } from "next/cache";
import {
  staffAssignAgent,
  staffDiscardUnfiled,
  staffFileUnfiled,
  staffGrantSkills,
  staffRegisterAgent,
  staffRevokeAgent,
  staffRevokeSkill,
  staffRotateAgent,
  staffUnassignAgent,
  type ActionOutcome,
} from "@/lib/agent-admin";
import type { ActionResult } from "@/lib/action-result";
import { requireHqStaffPage } from "@/lib/current";
import { openObjectStore } from "@/lib/store/objects";

/** Token-bearing result. The token is in the response once and never stored in clear. */
export type TokenResult = ActionResult & { token?: string | null; agentId?: string };

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function refresh(organizationId?: string) {
  revalidatePath("/agents");
  revalidatePath("/unfiled");
  if (organizationId) revalidatePath(`/clients/${organizationId}`);
}

function result(outcome: ActionOutcome): ActionResult {
  return outcome;
}

export async function registerAgentAction(_previous: TokenResult | null, formData: FormData): Promise<TokenResult> {
  const { sql, caller } = await requireHqStaffPage();
  const outcome = await staffRegisterAgent(sql, caller, {
    agentId: text(formData, "agentId"),
    label: text(formData, "label"),
    organizationId: text(formData, "organizationId"),
    workspaceId: text(formData, "workspaceId") || null,
    projectId: text(formData, "projectId") || null,
    role: text(formData, "role"),
    now: Date.now(),
  });
  if (outcome.ok) refresh(text(formData, "organizationId"));
  return outcome;
}

export async function rotateAgentAction(_previous: TokenResult | null, formData: FormData): Promise<TokenResult> {
  const { sql, caller } = await requireHqStaffPage();
  const outcome = await staffRotateAgent(sql, caller, { agentId: text(formData, "agentId"), now: Date.now() });
  if (outcome.ok) refresh();
  return outcome;
}

export async function revokeAgentAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const outcome = await staffRevokeAgent(sql, caller, { agentId: text(formData, "agentId"), now: Date.now() });
  if (outcome.ok) refresh();
  return result(outcome);
}

export async function assignAgentAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const [organizationId, workspaceId] = text(formData, "target").split(":");
  const outcome = await staffAssignAgent(sql, caller, {
    agentId: text(formData, "agentId"),
    organizationId: organizationId ?? "",
    workspaceId: workspaceId || null,
    projectId: text(formData, "projectId") || null,
    role: text(formData, "role"),
    now: Date.now(),
  });
  if (outcome.ok) refresh(organizationId);
  return result(outcome);
}

export async function unassignAgentAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = text(formData, "organizationId");
  const outcome = await staffUnassignAgent(sql, caller, { agentId: text(formData, "agentId"), organizationId, now: Date.now() });
  if (outcome.ok) refresh(organizationId);
  return result(outcome);
}

export async function grantSkillsAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const typed = text(formData, "custom")
    .split(/[\s,]+/)
    .filter(Boolean);
  const picked = formData.getAll("prefixes").map((value) => String(value)).filter(Boolean);
  const outcome = await staffGrantSkills(sql, caller, {
    scope: text(formData, "scope"),
    agentId: text(formData, "agentId") || null,
    organizationId: text(formData, "organizationId") || null,
    prefixes: [...picked, ...typed],
    now: Date.now(),
  });
  if (outcome.ok) refresh(text(formData, "organizationId") || undefined);
  return result(outcome);
}

export async function revokeSkillAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const outcome = await staffRevokeSkill(sql, caller, {
    agentId: text(formData, "agentId") || null,
    organizationId: text(formData, "organizationId") || null,
    prefix: text(formData, "prefix"),
    now: Date.now(),
  });
  if (outcome.ok) refresh(text(formData, "organizationId") || undefined);
  return result(outcome);
}

export async function fileUnfiledAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const target = text(formData, "target");
  const outcome = await staffFileUnfiled(sql, openObjectStore(), caller, {
    id: text(formData, "id"),
    target,
    projectId: text(formData, "projectId") || null,
    taskId: text(formData, "taskId"),
    now: Date.now(),
  });
  if (outcome.ok) refresh(target.split(":")[0]);
  return result(outcome);
}

export async function discardUnfiledAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const outcome = await staffDiscardUnfiled(sql, caller, { id: text(formData, "id"), reason: text(formData, "reason"), now: Date.now() });
  if (outcome.ok) refresh();
  return result(outcome);
}
