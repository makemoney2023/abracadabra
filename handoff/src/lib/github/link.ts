import { CRM_ERRORS, linkRepo, type CrmError } from "@/db/crm";
import type { Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { listVisibleRepos, repoChoiceVisible, type GithubSecrets } from "./app";
import { saveInstallation } from "./installs";

function messageFor(error: CrmError): string {
  if (error === "taken") return "That repo is already linked to another client.";
  return CRM_ERRORS[error];
}

/** Link only a repo this app can see right now. The stored name comes from GitHub, not the form. */
export async function linkChosenRepo(
  sql: Sql,
  caller: Caller,
  input: {
    organizationId: string;
    githubRepoId: number;
    now: number;
    secrets: GithubSecrets | null;
    fetch?: typeof fetch;
  },
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!input.secrets) return { ok: false, message: "The GitHub App is not connected yet." };
  const listed = await listVisibleRepos({
    secrets: input.secrets,
    fetch: input.fetch ?? fetch,
    now: input.now,
  });
  if (!listed.ok) return { ok: false, message: "GitHub did not answer. Try again." };
  const choice = repoChoiceVisible(input.githubRepoId, listed.value);
  if (!choice) return { ok: false, message: "That repo is not one this app can see." };
  const install = listed.value.find((row) => row.id === choice.installationId);
  if (install) {
    await saveInstallation(sql, {
      id: install.id,
      accountLogin: install.accountLogin,
      accountType: install.accountType,
      now: input.now,
      suspension: "leave",
    });
  }
  const linked = await linkRepo(
    sql,
    caller,
    {
      organizationId: input.organizationId,
      githubRepoId: choice.id,
      installationId: choice.installationId,
      fullName: choice.fullName,
      defaultBranch: choice.defaultBranch,
      isPrivate: choice.isPrivate,
    },
    input.now,
  );
  if (!linked.ok) return { ok: false, message: messageFor(linked.error) };
  return { ok: true, id: linked.value.id };
}
