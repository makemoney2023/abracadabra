import Link from "next/link";
import type { BoardActivity, BoardCard, ProjectRow } from "@/db/crm";
import { WorkBoard } from "../../work/board";
import { ProjectForm } from "../../projects/forms";
import { TaskForm } from "../activity-forms";
import { tabHref } from "./tabs";

export function WorkTab({
  organizationId,
  projects,
  cards,
  activity,
  now,
  projectId,
  runCap,
  opens,
}: {
  organizationId: string;
  projects: ProjectRow[];
  cards: BoardCard[];
  activity: BoardActivity[];
  now: number;
  projectId: string;
  runCap: number | null;
  opens: { projectId: string | null; open: number }[];
}) {
  const base = tabHref(organizationId, "work");
  const open = (id: string | null) => opens.find((row) => row.projectId === id)?.open ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={base} className={projectId ? "text-sm text-muted-foreground" : "text-sm font-medium"}>
          All projects
        </Link>
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`${base}&project=${project.id}`}
            className={projectId === project.id ? "text-sm font-medium" : "text-sm text-muted-foreground"}
          >
            {project.name} · {open(project.id)}
          </Link>
        ))}
        <Link
          href={`${base}&project=none`}
          className={projectId === "none" ? "text-sm font-medium" : "text-sm text-muted-foreground"}
        >
          No project · {open(null)}
        </Link>
        <ProjectForm organizationId={organizationId} />
        <TaskForm organizationId={organizationId} label="Add a task" variant="outline" />
      </div>
      <WorkBoard
        cards={cards}
        now={now}
        showClient={false}
        showProject={projectId === ""}
        runCap={runCap}
        activity={activity}
      />
    </div>
  );
}
