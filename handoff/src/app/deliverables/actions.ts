"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  DELIVERABLE_ERRORS,
  addDeliverableItem,
  createDeliverable,
  openDeliverable,
  publishDeliverable,
  pullDeliverableFromManifest,
  type DeliverableError,
} from "@/db/deliverables";
import { listProjectRepos } from "@/db/crm";
import { requireHqStaffPage } from "@/lib/current";
import { installationAccessToken, loadManifestBundle, resolveCommitSha } from "@/lib/github/contents";
import { readGithubSecrets } from "@/lib/github/secrets";
import { openObjectStore } from "@/lib/store/objects";

export type FormState = { message: string };

function messageFor(error: DeliverableError): string {
  return DELIVERABLE_ERRORS[error];
}

function refresh(projectId: string | null, deliverableId: string, slug: string | null): void {
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/deliverables/${deliverableId}`);
  if (slug) {
    revalidatePath(`/w/${slug}/work`);
    revalidatePath(`/w/${slug}/work/${deliverableId}`);
  }
}

export async function createDeliverableAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const projectId = String(formData.get("projectId") ?? "");
  const created = await createDeliverable(
    sql,
    caller,
    {
      organizationId: String(formData.get("organizationId") ?? ""),
      projectId: projectId || null,
      workspaceId: String(formData.get("workspaceId") ?? ""),
      title: String(formData.get("title") ?? ""),
      kind: String(formData.get("kind") ?? ""),
    },
    Date.now(),
  );
  if (!created.ok) return { message: messageFor(created.error) };
  revalidatePath(`/projects/${projectId}`);
  redirect(`/deliverables/${created.value.id}`);
}

export async function addDeliverableItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const deliverableId = String(formData.get("deliverableId") ?? "");
  const added = await addDeliverableItem(
    sql,
    caller,
    {
      deliverableId,
      title: String(formData.get("title") ?? ""),
      format: String(formData.get("format") ?? ""),
      copyText: String(formData.get("copy") ?? ""),
      section: String(formData.get("section") ?? ""),
      channel: String(formData.get("channel") ?? ""),
      linkUrl: String(formData.get("link") ?? ""),
    },
    Date.now(),
  );
  if (!added.ok) return { message: messageFor(added.error) };
  revalidatePath(`/deliverables/${deliverableId}`);
  redirect(`/deliverables/${deliverableId}`);
}

export async function publishDeliverableAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const deliverableId = String(formData.get("deliverableId") ?? "");
  const published = await publishDeliverable(sql, caller, deliverableId, Date.now());
  if (!published.ok) return { message: messageFor(published.error) };
  const opened = await openDeliverable(sql, caller, deliverableId, "working");
  const slug = opened
    ? (
        await sql.get<{ slug: string }>("SELECT slug FROM workspaces WHERE id = ?", [opened.deliverable.workspace_id])
      )?.slug ?? null
    : null;
  refresh(opened?.deliverable.project_id ?? null, deliverableId, slug);
  redirect(`/deliverables/${deliverableId}`);
}

export async function pullDeliverableAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { sql, caller } = await requireHqStaffPage();
  const deliverableId = String(formData.get("deliverableId") ?? "");
  const repoId = String(formData.get("repoId") ?? "");
  const opened = await openDeliverable(sql, caller, deliverableId, "working");
  if (!opened) return { message: DELIVERABLE_ERRORS.missing };
  if (!opened.deliverable.project_id) return { message: "Link a repo before you pull finished work." };
  const repos = await listProjectRepos(sql, caller, opened.deliverable.project_id);
  const repo = repos.find((row) => row.id === repoId);
  if (!repo) return { message: "Link a repo before you pull finished work." };
  const secrets = readGithubSecrets();
  if (!secrets || repo.installation_id == null) return { message: "GitHub is not connected." };
  const token = await installationAccessToken({
    appId: secrets.appId,
    privateKey: secrets.privateKey,
    installationId: repo.installation_id,
    fetch,
    now: Date.now(),
  });
  if (!token) return { message: "GitHub is not connected." };
  const ref = String(formData.get("ref") ?? "").trim() || repo.default_branch || "main";
  const sha = await resolveCommitSha({ fullName: repo.full_name, ref, token, fetch });
  if (!sha) return { message: "That file is not in the repo." };
  const bundle = await loadManifestBundle({
    fullName: repo.full_name,
    ref: sha,
    manifestPath: String(formData.get("path") ?? ""),
    token,
    fetch,
  });
  if (!bundle.ok) {
    if (bundle.error === "missing") return { message: "That file is not in the repo." };
    if (bundle.error === "unavailable") return { message: "GitHub did not answer. Try again." };
    return { message: "Check the path and try again." };
  }
  const objects = openObjectStore();
  const pulled = await pullDeliverableFromManifest(
    sql,
    caller,
    {
      deliverableId,
      repoId,
      commit: sha,
      manifest: bundle.value.manifest,
      files: bundle.value.files,
    },
    Date.now(),
    async (bytes) => {
      const key = `${crypto.randomUUID()}/${crypto.randomUUID()}/${crypto.randomUUID()}`;
      await objects.put(key, bytes);
      return key;
    },
  );
  if (!pulled.ok) return { message: messageFor(pulled.error) };
  const slug = (
    await sql.get<{ slug: string }>("SELECT slug FROM workspaces WHERE id = ?", [opened.deliverable.workspace_id])
  )?.slug;
  refresh(opened.deliverable.project_id, deliverableId, slug ?? null);
  redirect(`/deliverables/${deliverableId}`);
}
