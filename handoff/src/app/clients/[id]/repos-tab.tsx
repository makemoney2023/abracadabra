import type { LinkedRepo, ProjectRow } from "@/db/crm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AssignRepoForm, LinkRepoForm, UnlinkRepoForm } from "../repo-forms";

export function ReposTab({
  organizationId,
  repos,
  projects,
  githubConnected,
  githubFailed,
  choices,
}: {
  organizationId: string;
  repos: LinkedRepo[];
  projects: { id: string; name: string }[];
  githubConnected: boolean;
  githubFailed: boolean;
  choices: { id: number; fullName: string }[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Repos</CardTitle>
          <CardDescription>Repos we work in for this client.</CardDescription>
        </div>
        {githubConnected && !githubFailed ? (
          <LinkRepoForm organizationId={organizationId} repos={choices} />
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!githubConnected ? (
          <p className="text-sm text-muted-foreground">
            GitHub is not connected yet. An admin can connect it in Settings.
          </p>
        ) : null}
        {githubFailed ? <p className="text-sm text-muted-foreground">GitHub did not answer. Try again.</p> : null}
        {repos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No repos linked yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {repos.map((repo) => (
              <li key={repo.id} className="flex flex-col gap-2 text-sm">
                <span className="font-mono">{repo.full_name}</span>
                {repo.suspended_at != null ? <span className="text-muted-foreground">Paused</span> : null}
                <div className="flex flex-wrap gap-2">
                  <AssignRepoForm
                    organizationId={organizationId}
                    repoId={repo.id}
                    projectId={repo.project_id}
                    projects={projects}
                  />
                  <UnlinkRepoForm organizationId={organizationId} repoId={repo.id} projectId={repo.project_id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function repoProjects(projects: ProjectRow[]): { id: string; name: string }[] {
  return projects.map((project) => ({ id: project.id, name: project.name }));
}
