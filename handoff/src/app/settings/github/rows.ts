import type { VisibleInstall } from "@/lib/github/app";

const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export type RepoLink = {
  githubRepoId: number;
  organizationId: string;
  client: string;
  lastAt: number | null;
};

export type RepoTableRow = {
  id: number;
  fullName: string;
  href: string;
  client: string;
  clientHref: string;
  lastAt: number | null;
};

/** Visible repos, with a client link and last activity when one is stored. */
export function repoTableRows(installs: VisibleInstall[], links: RepoLink[]): RepoTableRow[] {
  const byId = new Map(links.map((link) => [link.githubRepoId, link]));
  const rows: RepoTableRow[] = [];
  for (const install of installs) {
    for (const repo of install.repos) {
      const link = byId.get(repo.id);
      const client = link?.client.trim() ?? "";
      rows.push({
        id: repo.id,
        fullName: repo.fullName,
        href: REPO_NAME.test(repo.fullName) ? `https://github.com/${repo.fullName}` : "",
        client: client || (link ? "…" : ""),
        clientHref: link ? `/clients/${link.organizationId}` : "",
        lastAt: link?.lastAt ?? null,
      });
    }
  }
  return rows;
}
