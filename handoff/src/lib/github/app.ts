import { signGithubAppJwt } from "./sign";

const API = "https://api.github.com";
const REPO_CAP = 100;

export type GithubSecrets = {
  appId: string;
  privateKey: string;
  webhookSecret: string;
};

export type VisibleRepo = {
  id: number;
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
};

export type VisibleInstall = {
  id: number;
  accountLogin: string;
  accountType: string;
  suspended: boolean;
  repos: VisibleRepo[];
};

export type RepoChoice = VisibleRepo & { installationId: number };

type ListResult = { ok: true; value: VisibleInstall[] } | { ok: false; error: "unavailable" };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function headers(token: string): Headers {
  return new Headers({
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "handoff",
  });
}

async function githubJson(fetchImpl: typeof fetch, url: string, token: string, method = "GET"): Promise<unknown> {
  const response = await fetchImpl(url, { method, headers: headers(token) });
  if (!response.ok) throw new Error("unavailable");
  return response.json();
}

function repoOf(value: unknown): VisibleRepo | null {
  const row = asRecord(value);
  if (!row || typeof row.id !== "number" || typeof row.full_name !== "string") return null;
  const branch = typeof row.default_branch === "string" && row.default_branch.trim() ? row.default_branch.trim() : "main";
  return {
    id: row.id,
    fullName: row.full_name,
    isPrivate: row.private !== false,
    defaultBranch: branch,
  };
}

/** Installs the app can see, and up to 100 repos on each live install. Never returns the install token. */
export async function listVisibleRepos(input: {
  secrets: GithubSecrets;
  fetch: typeof fetch;
  now: number;
}): Promise<ListResult> {
  try {
    const appToken = signGithubAppJwt(input.secrets.appId, input.secrets.privateKey, input.now);
    const listed = await githubJson(input.fetch, `${API}/app/installations`, appToken);
    if (!Array.isArray(listed)) return { ok: false, error: "unavailable" };
    const installs: VisibleInstall[] = [];
    for (const item of listed) {
      const row = asRecord(item);
      const account = asRecord(row?.account);
      const id = row?.id;
      const login = account?.login;
      const accountType = account?.type;
      if (typeof id !== "number" || typeof login !== "string") continue;
      if (accountType !== "User" && accountType !== "Organization") continue;
      const suspended = typeof row?.suspended_at === "string" && row.suspended_at.length > 0;
      const install: VisibleInstall = {
        id,
        accountLogin: login,
        accountType,
        suspended,
        repos: [],
      };
      if (!suspended) {
        const tokenBody = await githubJson(
          input.fetch,
          `${API}/app/installations/${id}/access_tokens`,
          appToken,
          "POST",
        );
        const token = asRecord(tokenBody)?.token;
        if (typeof token !== "string" || token.length === 0) return { ok: false, error: "unavailable" };
        const repoBody = await githubJson(
          input.fetch,
          `${API}/installation/repositories?per_page=${REPO_CAP}`,
          token,
        );
        const repositories = asRecord(repoBody)?.repositories;
        if (!Array.isArray(repositories)) return { ok: false, error: "unavailable" };
        install.repos = repositories.flatMap((repo) => {
          const mapped = repoOf(repo);
          return mapped ? [mapped] : [];
        }).slice(0, REPO_CAP);
      }
      installs.push(install);
    }
    return { ok: true, value: installs };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

/** A repo staff may link. Suspended installs are skipped. */
export function repoChoiceVisible(githubRepoId: number, installs: VisibleInstall[]): RepoChoice | null {
  for (const install of installs) {
    if (install.suspended) continue;
    const found = install.repos.find((repo) => repo.id === githubRepoId);
    if (found) return { ...found, installationId: install.id };
  }
  return null;
}
