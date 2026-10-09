import Link from "next/link";
import type { ActivityRow } from "@/db/crm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CallForm, NoteForm } from "../activity-forms";
import { tabHref } from "./tabs";

export const TIMELINE_PAGE_SIZE = 20;

export const ACTIVITY_LABEL: Record<string, string> = {
  note: "Note",
  call: "Call",
  file_uploaded: "File in",
  request_done: "Request done",
  pr_opened: "Pull request",
  pr_merged: "Merged",
  release: "Release",
  deploy: "Deploy",
  push: "Push",
  task: "Task",
  task_done: "Task done",
  task_status: "Task",
  stage_change: "Stage",
  "schema.scan": "Schema scan",
  "agent.swarm_run": "Swarm",
  "agent.wake_failed": "Agent did not wake",
};

export function activityDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function ActivityLines({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No notes yet.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id}>
          <span className="font-mono text-xs text-muted-foreground">{activityDay(row.created_at)}</span>
          <span className="ml-2 text-sm">{ACTIVITY_LABEL[row.kind] ?? "Update"}</span>
          {row.body ? <p className="text-sm">{row.body}</p> : null}
        </li>
      ))}
    </ul>
  );
}

export function ActivityTab({
  organizationId,
  timeline,
  page,
}: {
  organizationId: string;
  timeline: ActivityRow[];
  page: number;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Notes</CardTitle>
          <NoteForm organizationId={organizationId} />
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Calls</CardTitle>
          <CallForm organizationId={organizationId} />
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ActivityLines rows={timeline} />
          <div className="flex gap-4 text-sm">
            {page > 1 ? (
              <Link href={tabHref(organizationId, "activity", page - 1)}>Newer</Link>
            ) : null}
            {timeline.length === TIMELINE_PAGE_SIZE ? (
              <Link href={tabHref(organizationId, "activity", page + 1)}>Older</Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
