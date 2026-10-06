"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { assignRepoAction, linkRepoAction, unlinkRepoAction, type FormState } from "./repo-actions";

const initial: FormState = { message: "" };

export function LinkRepoForm({
  organizationId,
  repos,
}: {
  organizationId: string;
  repos: { id: number; fullName: string }[];
}) {
  const [state, action, pending] = useActionState(linkRepoAction, initial);
  if (repos.length === 0) {
    return <p className="text-sm text-muted-foreground">No repos to link.</p>;
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="flex flex-col gap-1 text-sm" htmlFor="link-repo">
        Link a repo
        <select
          id="link-repo"
          name="githubRepoId"
          required
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          defaultValue={String(repos[0]?.id ?? "")}
        >
          {repos.map((repo) => (
            <option key={repo.id} value={repo.id}>
              {repo.fullName}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Linking" : "Link a repo"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
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
  const [state, action, pending] = useActionState(unlinkRepoAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="repoId" value={repoId} />
      <input type="hidden" name="projectId" value={projectId ?? ""} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Unlinking" : "Unlink"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
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
  const [state, action, pending] = useActionState(assignRepoAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="repoId" value={repoId} />
      <input type="hidden" name="previousProjectId" value={projectId ?? ""} />
      <label className="flex flex-col gap-1 text-sm" htmlFor={`assign-${repoId}`}>
        Project
        <select
          id={`assign-${repoId}`}
          name="projectId"
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          defaultValue={projectId ?? ""}
        >
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Saving" : "Save project"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
