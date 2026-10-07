"use client";

import { useActionState } from "react";
import {
  PROJECT_STATUSES,
  STATUS_AUDIENCES,
  STATUS_HEALTHS,
  TASK_STATUSES,
  type ProjectStatus,
  type TaskStatus,
} from "@/db/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createMilestoneAction,
  createProjectAction,
  createProjectTaskAction,
  postStatusAction,
  publishStatusAction,
  updateProjectAction,
  updateTaskStatusAction,
  type FormState,
} from "./actions";
import { AUDIENCE_LABEL, HEALTH_LABEL, PROJECT_STATUS_LABEL, TASK_STATUS_LABEL } from "./labels";

const initial: FormState = { message: "" };
const selectClass = "h-9 rounded-lg border border-input bg-transparent px-2 text-sm";

function Status({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {message}
    </p>
  );
}

export function ProjectForm({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState(createProjectAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="flex flex-col gap-1 text-sm" htmlFor="project-name">
        Project name
        <Input id="project-name" name="name" required maxLength={200} />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="project-due">
        Due date
        <Input id="project-due" name="due" type="date" />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding" : "Add a project"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}

export function ProjectStatusForm({
  projectId,
  organizationId,
  status,
}: {
  projectId: string;
  organizationId: string;
  status: ProjectStatus;
}) {
  const [state, action, pending] = useActionState(updateProjectAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="flex flex-col gap-1 text-sm" htmlFor="project-status">
        Status
        <select id="project-status" name="status" defaultValue={status} className={selectClass}>
          {PROJECT_STATUSES.map((item) => (
            <option key={item} value={item}>
              {PROJECT_STATUS_LABEL[item]}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving" : "Save status"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}

export function MilestoneForm({ projectId, organizationId }: { projectId: string; organizationId: string }) {
  const [state, action, pending] = useActionState(createMilestoneAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="flex flex-col gap-1 text-sm" htmlFor="milestone-name">
        Milestone
        <Input id="milestone-name" name="name" required maxLength={200} />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="milestone-due">
        Due date
        <Input id="milestone-due" name="due" type="date" />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding" : "Add a milestone"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}

export function ProjectTaskForm({
  projectId,
  organizationId,
  milestones,
  staff,
}: {
  projectId: string;
  organizationId: string;
  milestones: { id: string; name: string }[];
  staff: { userId: string; email: string }[];
}) {
  const [state, action, pending] = useActionState(createProjectTaskAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="flex flex-col gap-1 text-sm" htmlFor="project-task-title">
        Task
        <Input id="project-task-title" name="title" required maxLength={200} />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="project-task-milestone">
        Milestone
        <select id="project-task-milestone" name="milestoneId" defaultValue="" className={selectClass}>
          <option value="">No milestone</option>
          {milestones.map((milestone) => (
            <option key={milestone.id} value={milestone.id}>
              {milestone.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="project-task-assignee">
        Person
        <select id="project-task-assignee" name="assigneeUserId" defaultValue="" className={selectClass}>
          <option value="">Unassigned</option>
          {staff.map((person) => (
            <option key={person.userId} value={person.userId}>
              {person.email}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="project-task-due">
        Due date
        <Input id="project-task-due" name="due" type="date" />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding" : "Add a task"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}

export function TaskStatusForm({
  taskId,
  projectId,
  organizationId,
  status,
}: {
  taskId: string;
  projectId: string;
  organizationId: string;
  status: TaskStatus;
}) {
  const [state, action, pending] = useActionState(updateTaskStatusAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="sr-only" htmlFor={`task-status-${taskId}`}>
        Status
      </label>
      <select id={`task-status-${taskId}`} name="status" defaultValue={status} className={selectClass}>
        {TASK_STATUSES.map((item) => (
          <option key={item} value={item}>
            {TASK_STATUS_LABEL[item]}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Saving" : "Save"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}

export function StatusUpdateForm({ projectId, organizationId }: { projectId: string; organizationId: string }) {
  const [state, action, pending] = useActionState(postStatusAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="flex flex-col gap-1 text-sm" htmlFor="status-body">
        Update
        <Textarea id="status-body" name="body" required maxLength={4000} />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="status-health">
        Health
        <select id="status-health" name="health" defaultValue="on_track" className={selectClass}>
          {STATUS_HEALTHS.map((item) => (
            <option key={item} value={item}>
              {HEALTH_LABEL[item]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="status-audience">
        Who can read this
        <select id="status-audience" name="audience" defaultValue="internal" className={selectClass}>
          {STATUS_AUDIENCES.map((item) => (
            <option key={item} value={item}>
              {AUDIENCE_LABEL[item]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm" htmlFor="status-publish">
        <input id="status-publish" name="publish" type="checkbox" value="1" />
        Publish now
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving" : "Save update"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}

export function PublishUpdateForm({
  updateId,
  projectId,
  organizationId,
}: {
  updateId: string;
  projectId: string;
  organizationId: string;
}) {
  const [state, action, pending] = useActionState(publishStatusAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="updateId" value={updateId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Publishing" : "Publish"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}
