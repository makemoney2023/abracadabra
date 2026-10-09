"use client";

import { ActionField, ActionForm } from "@/components/action-form";
import { FormDrawer } from "@/components/form-drawer";
import { Button } from "@/components/ui/button";
import { assignRepoAction, linkRepoAction, unlinkRepoAction } from "./repo-actions";

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function LinkRepoForm({
  organizationId,
  repos,
}: {
  organizationId: string;
  repos: { id: number; fullName: string }[];
}) {
  return (
    <FormDrawer
      title="Link a repo"
      description="A GitHub repo this client works in."
      trigger={
        <Button variant="outline" size="sm">
          Link a repo
        </Button>
      }
    >
      {repos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No repos to link.</p>
      ) : (
        <ActionForm action={linkRepoAction} submitLabel="Link a repo" pendingLabel="Linking">
          <input type="hidden" name="organizationId" value={organizationId} />
          <ActionField name="githubRepoId" label="Repo">
            <select
              name="githubRepoId"
              required
              className={selectClass}
              defaultValue={String(repos[0]?.id ?? "")}
            >
              {repos.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.fullName}
                </option>
              ))}
            </select>
          </ActionField>
        </ActionForm>
      )}
    </FormDrawer>
  );
}

export function UnlinkRepoForm({
  organizationId,
  repoId,
  projectId,
}: {
  organizationId: string;
  repoId: string;
  projectId: string | null;
}) {
  return (
    <FormDrawer
      title="Unlink repo"
      description="The repo leaves this client. GitHub keeps the code."
      trigger={
        <Button variant="outline" size="sm">
          Unlink
        </Button>
      }
    >
      <ActionForm action={unlinkRepoAction} submitLabel="Unlink" pendingLabel="Unlinking">
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="repoId" value={repoId} />
        <input type="hidden" name="projectId" value={projectId ?? ""} />
      </ActionForm>
    </FormDrawer>
  );
}

export function AssignRepoForm({
  organizationId,
  repoId,
  projectId,
  projects,
}: {
  organizationId: string;
  repoId: string;
  projectId: string | null;
  projects: { id: string; name: string }[];
}) {
  return (
    <FormDrawer
      title="Set project"
      description="Which project this repo belongs to."
      trigger={
        <Button variant="outline" size="sm">
          Project
        </Button>
      }
    >
      <ActionForm action={assignRepoAction} submitLabel="Save project" pendingLabel="Saving">
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="repoId" value={repoId} />
        <input type="hidden" name="previousProjectId" value={projectId ?? ""} />
        <ActionField name="projectId" label="Project">
          <select name="projectId" className={selectClass} defaultValue={projectId ?? ""}>
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </ActionField>
      </ActionForm>
    </FormDrawer>
  );
}
