"use client";

import * as React from "react";
import { ActionField, ActionForm } from "@/components/action-form";
import { FormDrawer } from "@/components/form-drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FilingChoices, UnfiledRow } from "@/lib/agent-admin";
import { discardUnfiledAction, fileUnfiledAction } from "../agents/actions";

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function FileItemDrawer({ item, clients }: { item: UnfiledRow; clients: FilingChoices["clients"] }) {
  const suggested = clients.find((client) => client.id === item.suggestion?.organizationId);
  const start = suggested ?? clients[0];
  const startSpace = start?.spaces.find((space) => space.slug === item.spaceHint) ?? start?.spaces[0];
  const [org, setOrg] = React.useState(start?.id ?? "");
  const client = clients.find((entry) => entry.id === org);
  return (
    <FormDrawer
      title={`File "${item.title}"`}
      description="Pick where it goes. Filing saves it to the space and, with a task, marks that task done."
      trigger={<Button size="sm">File</Button>}
    >
      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No client has an active space yet.</p>
      ) : (
        <ActionForm action={fileUnfiledAction} submitLabel="File it" pendingLabel="Filing">
          <input type="hidden" name="id" value={item.id} />
          <ActionField name="target" label="Client and space">
            <select
              name="target"
              required
              className={selectClass}
              defaultValue={start && startSpace ? `${start.id}:${startSpace.id}` : ""}
              onChange={(event) => setOrg(event.currentTarget.value.split(":")[0] ?? "")}
            >
              {clients.map((entry) => (
                <optgroup key={entry.id} label={entry.id === item.suggestion?.organizationId ? `${entry.name} (suggested)` : entry.name}>
                  {entry.spaces.map((space) => (
                    <option key={space.id} value={`${entry.id}:${space.id}`}>
                      {entry.name} · {space.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </ActionField>
          <ActionField name="projectId" label="Project (optional)">
            <select name="projectId" className={selectClass} defaultValue="" key={`p-${org}`}>
              <option value="">The space&apos;s project</option>
              {(client?.projects ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </ActionField>
          <ActionField name="taskId" label="Task it finishes (optional)">
            <select name="taskId" className={selectClass} defaultValue={item.taskId ? "keep" : ""} key={`t-${org}`}>
              <option value="">No task</option>
              {item.taskId ? <option value="keep">The agent&apos;s task: {item.taskTitle}</option> : null}
              {(client?.tasks ?? [])
                .filter((task) => task.id !== item.taskId)
                .map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
            </select>
          </ActionField>
        </ActionForm>
      )}
    </FormDrawer>
  );
}

export function DiscardItemDrawer({ item }: { item: UnfiledRow }) {
  return (
    <FormDrawer
      title={`Discard "${item.title}"`}
      description="It leaves the inbox and isn't filed anywhere. The reason goes on the timeline."
      trigger={
        <Button size="sm" variant="outline">
          Discard
        </Button>
      }
    >
      <ActionForm action={discardUnfiledAction} submitLabel="Discard" pendingLabel="Discarding">
        <input type="hidden" name="id" value={item.id} />
        <ActionField name="reason" label="Reason">
          <Textarea name="reason" required minLength={3} maxLength={500} rows={3} placeholder="Duplicate of work already filed" />
        </ActionField>
      </ActionForm>
    </FormDrawer>
  );
}
