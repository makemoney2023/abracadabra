"use server";

import { revalidatePath } from "next/cache";
import { openSession } from "@/lib/current";
import { revokeLibraryFile, selectLibraryFile } from "@/lib/artifact-metadata";

export type SourceActionState = { ok: boolean; error?: string };

export async function selectSourceAction(formData: FormData): Promise<SourceActionState> {
  const { sql, caller } = await openSession();
  const slug = String(formData.get("slug") ?? "");
  const result = await selectLibraryFile(sql, caller, String(formData.get("fileId") ?? ""), Date.now());
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/w/${slug}`);
  revalidatePath(`/w/${slug}/library`);
  return { ok: true };
}

export async function revokeSourceAction(formData: FormData): Promise<SourceActionState> {
  const { sql, caller } = await openSession();
  const slug = String(formData.get("slug") ?? "");
  const result = await revokeLibraryFile(sql, caller, String(formData.get("fileId") ?? ""), Date.now());
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/w/${slug}`);
  revalidatePath(`/w/${slug}/library`);
  return { ok: true };
}

export async function toggleSourceAction(formData: FormData): Promise<void> {
  const selected = String(formData.get("selected") ?? "") === "1";
  await (selected ? revokeSourceAction : selectSourceAction)(formData);
}
