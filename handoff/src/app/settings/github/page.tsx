import Link from "next/link";

import { sortRows } from "@/components/data-table-sort";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { ExternalLink } from "@/components/external-link";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clock } from "@/lib/clock";
import { requireHqSuperAdminPage } from "@/lib/current";
import { formatCount, formatRelative } from "@/lib/format";
import { githubInstallHref, listVisibleRepos, type VisibleInstall } from "@/lib/github/app";
import { rememberInstallations } from "@/lib/github/installs";
import { readGithubSecrets } from "@/lib/github/secrets";

import { GithubError } from "./github-error";
import { repoTableRows, type RepoLink, type RepoTableRow } from "./rows";

function sortValue(row: RepoTableRow, key: string): string | number | null {
  if (key === "repo") return row.fullName;
  if (key === "client") return row.client;
  if (key === "activity") return row.lastAt;
  return null;
}

function columns(now: number): Column<RepoTableRow>[] {
  return [
    {
      key: "repo",
      header: "Repo",
      sortable: true,
      cell: (row) =>
        row.href ? (
          <ExternalLink href={row.href}>{row.fullName}</ExternalLink>
        ) : (
          <span className="font-mono text-sm">{row.fullName}</span>
        ),
    },
    {
      key: "client",
      header: "Client",
      sortable: true,
      cell: (row) =>
        row.clientHref ? <Link href={row.clientHref}>{row.client}</Link> : row.client,
    },
    {
      key: "activity",
      header: "Last activity",
      sortable: true,
      cell: (row) => (row.lastAt == null ? "" : formatRelative(row.lastAt, now)),
    },
  ];
}

function ConnectGithub({ href }: { href: string | null }) {
  return (
    <EmptyState
      title="Connect GitHub"
      body={
        href
          ? "No GitHub org is connected yet. Install the app on our org, then open this page again."
          : "Add the app id, the private key, and the webhook secret on the worker. Then install the app on our GitHub org."
      }
      action={
        href ? (
          <Button asChild>
            <a href={href} target="_blank" rel="noreferrer">
              Connect GitHub
              <span className="sr-only">opens in new tab</span>
            </a>
          </Button>
        ) : null
      }
    />
  );
}

function connectionCards(installs: VisibleInstall[]) {
  return installs.map((install) => (
    <Card key={install.id}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <StatusDot domain="github" value={install.suspended ? "disconnected" : "connected"} />
          {install.accountLogin}
        </CardTitle>
        <CardDescription>
          {`Installation ${install.id}. ${formatCount(install.repos.length)} ${install.repos.length === 1 ? "repo" : "repos"}. ${install.suspended ? "Paused" : "Live"}.`}
        </CardDescription>
      </CardHeader>
    </Card>
  ));
}

export default async function GithubSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sql } = await requireHqSuperAdminPage();
  const secrets = readGithubSecrets();
  if (!secrets) return <ConnectGithub href={null} />;

  const now = clock();
  const listed = await listVisibleRepos({ secrets, fetch, now });
  if (!listed.ok) return <GithubError />;

  await rememberInstallations(sql, listed.value, now);
  if (listed.value.length === 0) {
    const href = await githubInstallHref({ secrets, fetch, now });
    return <ConnectGithub href={href} />;
  }

  const links = await sql.all<{
    github_repo_id: number;
    organization_id: string;
    client_name: string | null;
    last_at: number | null;
  }>(
    `SELECT r.github_repo_id, r.organization_id, o.name AS client_name,
            (
              SELECT MAX(a.created_at) FROM activities a
              WHERE a.organization_id = r.organization_id
                AND a.kind IN ('push', 'pr_opened', 'pr_merged', 'release')
                AND json_extract(a.data_json, '$.repo') = r.full_name
            ) AS last_at
     FROM repos r
     JOIN organizations o ON o.id = r.organization_id
     WHERE r.archived_at IS NULL`,
  );
  const mapped: RepoLink[] = links.map((link) => ({
    githubRepoId: link.github_repo_id,
    organizationId: link.organization_id,
    client: link.client_name ?? "",
    lastAt: link.last_at,
  }));
  const query = await searchParams;
  const rows = sortRows(
    repoTableRows(listed.value, mapped),
    query.sort,
    sortValue,
  );

  return (
    <div className="flex flex-col gap-4">
      {connectionCards(listed.value)}
      <DataTable
        columns={columns(now)}
        rows={rows}
        rowKey={(row) => String(row.id)}
        sort={query.sort}
        basePath="/settings/github"
        empty={<EmptyState title="No repos on this install." body="Install the app on a repo, then open this page again." />}
      />
    </div>
  );
}
