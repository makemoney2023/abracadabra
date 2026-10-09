"use server";

import { revalidatePath } from "next/cache";
import { CRM_ERRORS, assignRepoProject, unlinkRepo, type CrmError } from "@/db/crm";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireHqStaffPage } from "@/lib/current";
import { linkChosenRepo } from "@/lib/github/link";
import { readGithubSecrets } from "@/lib/github/secrets";

function refresh(organizationId: string, projectId: string): void {
  revalidatePath(`/clients/${organizationId}`);
  revalidatePath("/settings/github");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

function repoMessage(error: CrmError): string {
  if (error === "missing") return "That repo is not on this client.";
  if (error === "invalid") return "Pick a project on this client.";
  return CRM_ERRORS[error];
}

export async function linkRepoAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const githubRepoId = Number(formData.get("githubRepoId"));
  const linked = await linkChosenRepo(sql, caller, {
    organizationId,
    githubRepoId,
    now: Date.now(),
    secrets: readGithubSecrets(),
  });
  if (!linked.ok) return fail(linked.message, "githubRepoId");
  const placed = await sql.get<{ project_id: string | null }>("SELECT project_id FROM repos WHERE id = ?", [
    linked.id,
  ]);
  refresh(organizationId, placed?.project_id ?? "");
  return ok("This repo is now linked.");
}

export async function unlinkRepoAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const saved = await unlinkRepo(
    sql,
    caller,
    { organizationId, repoId: String(formData.get("repoId") ?? "") },
    Date.now(),
  );
  if (!saved.ok) return fail(repoMessage(saved.error));
  refresh(organizationId, projectId);
  return ok("This repo is unlinked.");
}

export async function assignRepoAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { sql, caller } = await requireHqStaffPage();
  const organizationId = String(formData.get("organizationId") ?? "");
  const rawProject = String(formData.get("projectId") ?? "");
  const projectId = rawProject.length > 0 ? rawProject : null;
  const previousProjectId = String(formData.get("previousProjectId") ?? "");
  const saved = await assignRepoProject(
    sql,
    caller,
    {
      organizationId,
      repoId: String(formData.get("repoId") ?? ""),
      projectId,
    },
    Date.now(),
  );
  if (!saved.ok) return fail(repoMessage(saved.error), "projectId");
  refresh(organizationId, projectId ?? "");
  if (previousProjectId && previousProjectId !== projectId) refresh(organizationId, previousProjectId);
  return ok(projectId ? "This repo is on that project." : "This repo is not on a project.");
}
