"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { can } from "@/lib/authz";
import { openSession } from "@/lib/current";
import { hostnameOf } from "@/lib/host";
import { connectLink, disconnectSocialAccount } from "@/lib/social";
import { CONNECT_PLATFORMS, openZernio, type ConnectPlatform } from "@/lib/zernio";

const PLATFORM_SET = new Set<string>(CONNECT_PLATFORMS);

/** The space's client, when the caller is its owner or assigned staff. */
async function spaceClient(slug: string): Promise<{ sql: Awaited<ReturnType<typeof openSession>>["sql"]; organization: { id: string; name: string } } | null> {
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace || !can(caller, "invite.member", { workspaceId: workspace.id })) return null;
  const organization = await sql.get<{ id: string; name: string }>(
    `SELECT o.id, o.name FROM workspaces w JOIN organizations o ON o.id = w.organization_id WHERE w.id = ?`,
    [workspace.id],
  );
  return organization ? { sql, organization } : null;
}

async function origin(): Promise<string> {
  const host = (await headers()).get("host") ?? "";
  const name = hostnameOf(host);
  return `${name === "localhost" || name.endsWith(".localhost") || name === "127.0.0.1" ? "http" : "https"}://${host}`;
}

export async function connectFromSpaceAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "");
  const platform = String(formData.get("platform") ?? "");
  const found = await spaceClient(slug);
  const zernio = openZernio();
  if (!found || !zernio || !PLATFORM_SET.has(platform)) redirect(`/w/${slug}/social?social=failed`);
  let authUrl: string;
  try {
    authUrl = await connectLink(
      found.sql,
      zernio,
      found.organization,
      platform as ConnectPlatform,
      `${await origin()}/w/${slug}/social?social=connected`,
      Date.now(),
    );
  } catch {
    redirect(`/w/${slug}/social?social=failed`);
  }
  redirect(authUrl);
}

export async function disconnectFromSpaceAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const slug = String(formData.get("slug") ?? "");
  const found = await spaceClient(slug);
  const zernio = openZernio();
  if (!found || !zernio) return fail("You can't do that.");
  try {
    const removed = await disconnectSocialAccount(found.sql, zernio, found.organization.id, String(formData.get("accountId") ?? ""));
    if (!removed) return fail("That account is not here.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Zernio did not answer.");
  }
  revalidatePath(`/w/${slug}/social`);
  return ok("This account is disconnected.");
}
