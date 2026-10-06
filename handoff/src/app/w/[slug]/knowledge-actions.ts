"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { understanderFromRuntime } from "@/lib/ai-gateway";
import { openSession } from "@/lib/current";
import { issueKnowledgeKey, readSpaceFiles } from "@/lib/knowledge";
import { openObjectStore } from "@/lib/store/objects";

export async function readSpaceAction(slug: string): Promise<{ message: string }> {
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  const result = await readSpaceFiles({
    sql,
    caller,
    workspaceId: workspace.id,
    now: Date.now(),
    understander: understanderFromRuntime(),
    readBytes: (key) => openObjectStore().read(key),
  });
  revalidatePath(`/w/${workspace.slug}`);
  if (!result.ok) return { message: "You cannot read files in this space." };
  if (result.ready === 0 && result.waiting > 0) {
    return { message: "Text files are waiting. Reading starts when the AI gateway is set up." };
  }
  return {
    message: `Read ${result.ready}. Waiting ${result.waiting}. Skipped ${result.skipped}. Could not read ${result.failed}.`,
  };
}

export async function mintKeyAction(slug: string): Promise<{ message: string; token: string }> {
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  const issued = await issueKnowledgeKey({
    sql,
    caller,
    workspaceId: workspace.id,
    now: Date.now(),
  });
  revalidatePath(`/w/${workspace.slug}`);
  if (!issued.ok) {
    return { message: "We could not make a project key. This space already has five.", token: "" };
  }
  return { message: "Copy this key now. We will not show it again.", token: issued.token };
}
