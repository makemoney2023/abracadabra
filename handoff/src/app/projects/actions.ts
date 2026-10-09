"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CRM_ERRORS,
  PROJECT_STATUSES,
  STATUS_AUDIENCES,
  STATUS_HEALTHS,
  TASK_STATUSES,
  createMilestone,
  createProject,
  createTask,
  postStatusUpdate,
  publishStatusUpdate,
  saveProjectDescription,
  updateProject,
  updateTask,
  type CrmError,
  type ProjectStatus,
  type StatusAudience,
  type StatusHealth,
  type TaskStatus,
} from "@/db/crm";
import { requireHqStaffPage } from "@/lib/current";
import {
  askRequirementModel,
  fileRequirementTasks,
  type RequirementPlan,
} from "@/lib/requirement-tasks";
import { dayToUtc } from "./dates";

export type FormState = { message: string };

function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

function isHealth(value: string): value is StatusHealth {
  return (STATUS_HEALTHS as readonly string[]).includes(value);
}

function isAudience(value: string): value is StatusAudience {
  return (STATUS_AUDIENCES as readonly string[]).includes(value);
}

function messageFor(error: CrmError, invalid: string): string {
  if (error === "invalid") return invalid;
  return CRM_ERRORS[error];
}

function refreshProject(projectId: string, organizationId: string): void {
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/clients/${organizationId}`);
  revalidatePath("/work");
  revalidatePath("/");
}

export async function createProjectAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const due = dayToUtc(String(formData.get("due") ?? ""));
  if (due === "bad") return { message: "Use a real date." };
  const created = await createProject(
    sql,
    caller,
    { organizationId, name: String(formData.get("name") ?? ""), dueAt: due },
    Date.now(),
  );
  if (!created.ok) return { message: messageFor(created.error, "Give the project a name.") };
  revalidatePath("/projects");
  revalidatePath(`/clients/${organizationId}`);
  revalidatePath("/");
  redirect(`/projects/${created.value.id}`);
}

export async function updateProjectAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const projectId = String(formData.get("projectId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!isProjectStatus(status)) return { message: "Pick a status." };
  const saved = await updateProject(sql, caller, { projectId, status }, Date.now());
  if (!saved.ok) return { message: messageFor(saved.error, "Pick a status.") };
  refreshProject(projectId, organizationId);
  return { message: "Status saved." };
}

export async function saveProjectDescriptionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const projectId = String(formData.get("projectId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const description = String(formData.get("description") ?? "");
  const now = Date.now();
  const saved = await saveProjectDescription(sql, caller, { projectId, description }, now);
  if (!saved.ok) return { message: messageFor(saved.error, "Keep the note under 4000 characters.") };
  const filed = await fileRequirementTasks({
    sql,
    caller,
    projectId,
    requirements: description,
    now,
    ask: askForRequirements,
  });
  refreshProject(projectId, organizationId);
  return { message: planMessage(filed) };
}

async function askForRequirements(prompt: string): Promise<string> {
  try {
    const env = (await getCloudflareContext({ async: true })).env as {
      AI?: Parameters<typeof askRequirementModel>[0];
      HANDOFF_AI_GATEWAY_ID?: string;
    };
    return await askRequirementModel(env.AI, prompt, env.HANDOFF_AI_GATEWAY_ID || "default");
  } catch {
    return "";
  }
}

function planMessage(filed: RequirementPlan): string {
  if (filed.reason === "cleared") return "Requirements cleared.";
  if (filed.reason === "unread") {
    return "Requirements saved. The agent could not read them, so no tasks were added.";
  }
  if (filed.reason !== "added") return "Requirements saved. No new tasks.";
  const noun = filed.created.length === 1 ? "task" : "tasks";
  const listed = filed.created.join("; ");
  const detail = listed.length <= 180 ? `: ${listed}` : ".";
  return `Requirements saved. Added ${filed.created.length} ${noun}${detail}`;
}

export async function createMilestoneAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const projectId = String(formData.get("projectId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const due = dayToUtc(String(formData.get("due") ?? ""));
  if (due === "bad") return { message: "Use a real date." };
  const created = await createMilestone(
    sql,
    caller,
    { projectId, name: String(formData.get("name") ?? ""), dueAt: due },
    Date.now(),
  );
  if (!created.ok) return { message: messageFor(created.error, "Give the milestone a name.") };
  refreshProject(projectId, organizationId);
  return { message: "Milestone added." };
}

export async function createProjectTaskAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const projectId = String(formData.get("projectId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const due = dayToUtc(String(formData.get("due") ?? ""));
  if (due === "bad") return { message: "Use a real date." };
  const milestoneId = String(formData.get("milestoneId") ?? "");
  const assigneeUserId = String(formData.get("assigneeUserId") ?? "");
  const saved = await createTask(
    sql,
    caller,
    {
      projectId,
      organizationId,
      title: String(formData.get("title") ?? ""),
      dueAt: due,
      milestoneId: milestoneId.length > 0 ? milestoneId : null,
      assigneeUserId: assigneeUserId.length > 0 ? assigneeUserId : null,
    },
    Date.now(),
  );
  if (!saved.ok) return { message: messageFor(saved.error, "Check the task.") };
  refreshProject(projectId, organizationId);
  return { message: "Task added." };
}

export async function updateTaskStatusAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const projectId = String(formData.get("projectId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!isTaskStatus(status)) return { message: "Pick a status." };
  const saved = await updateTask(sql, caller, { taskId: String(formData.get("taskId") ?? ""), status }, Date.now());
  if (!saved.ok) return { message: messageFor(saved.error, "Pick a status.") };
  refreshProject(projectId, organizationId);
  return { message: "Task saved." };
}

export async function postStatusAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const projectId = String(formData.get("projectId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const health = String(formData.get("health") ?? "");
  const audience = String(formData.get("audience") ?? "");
  if (!isHealth(health) || !isAudience(audience)) return { message: "Write the update." };
  const saved = await postStatusUpdate(
    sql,
    caller,
    {
      projectId,
      body: String(formData.get("body") ?? ""),
      health,
      audience,
      publish: formData.get("publish") === "1",
    },
    Date.now(),
  );
  if (!saved.ok) return { message: messageFor(saved.error, "Write the update.") };
  refreshProject(projectId, organizationId);
  return { message: saved.value.state === "published" ? "Update published." : "Draft saved." };
}

export async function publishStatusAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const projectId = String(formData.get("projectId") ?? "");
  const organizationId = String(formData.get("organizationId") ?? "");
  const saved = await publishStatusUpdate(sql, caller, { id: String(formData.get("updateId") ?? "") }, Date.now());
  if (!saved.ok) return { message: CRM_ERRORS[saved.error] };
  refreshProject(projectId, organizationId);
  return { message: "Update published." };
}
