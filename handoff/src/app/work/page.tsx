import Link from "next/link";
import { listWork } from "@/db/crm";
import { clock } from "@/lib/clock";
import { requireHqStaffPage } from "@/lib/current";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffShell } from "../staff-shell";
import { dayLabel } from "../projects/dates";
import { groupTasks, workHref } from "./query";

export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ late?: string; week?: string; blocked?: string; group?: string }>;
}) {
  const query = await searchParams;
  const late = query.late === "1";
  const week = query.week === "1";
  const blocked = query.blocked === "1";
  const group = query.group === "client" ? "client" : "person";
  const { sql, caller } = await requireHqStaffPage();
  const tasks = await listWork(sql, caller, { late, thisWeek: week, blocked }, clock());
  const groups = groupTasks(tasks, group);
  const filters = { late, week, blocked, group } as const;
  return (
    <StaffShell>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-4xl leading-tight">Work</h1>
          <nav aria-label="Filters" className="flex flex-wrap gap-2">
            <Button variant={!late && !week && !blocked ? "default" : "outline"} size="sm" asChild>
              <Link href={workHref({ group })} aria-current={!late && !week && !blocked ? "page" : undefined}>
                All
              </Link>
            </Button>
            <Button variant={late && !week && !blocked ? "default" : "outline"} size="sm" asChild>
              <Link href={workHref({ ...filters, late: true, week: false, blocked: false })} aria-current={late && !week && !blocked ? "page" : undefined}>
                Late
              </Link>
            </Button>
            <Button variant={week && !late && !blocked ? "default" : "outline"} size="sm" asChild>
              <Link href={workHref({ ...filters, late: false, week: true, blocked: false })} aria-current={week && !late && !blocked ? "page" : undefined}>
                This week
              </Link>
            </Button>
            <Button variant={blocked && !late && !week ? "default" : "outline"} size="sm" asChild>
              <Link href={workHref({ ...filters, late: false, week: false, blocked: true })} aria-current={blocked && !late && !week ? "page" : undefined}>
                Blocked
              </Link>
            </Button>
          </nav>
          <nav aria-label="Group" className="flex flex-wrap gap-2">
            <Button variant={group === "person" ? "default" : "outline"} size="sm" asChild>
              <Link href={workHref({ late, week, blocked, group: "person" })} aria-current={group === "person" ? "page" : undefined}>
                By person
              </Link>
            </Button>
            <Button variant={group === "client" ? "default" : "outline"} size="sm" asChild>
              <Link href={workHref({ late, week, blocked, group: "client" })} aria-current={group === "client" ? "page" : undefined}>
                By client
              </Link>
            </Button>
          </nav>
        </div>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open tasks.</p>
        ) : (
          groups.map((bucket) => (
            <Card key={bucket.label}>
              <CardHeader>
                <CardTitle>{bucket.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2">
                  {bucket.tasks.map((task) => (
                    <li key={task.id} className="text-sm">
                      <Link href={task.project_id ? `/projects/${task.project_id}` : `/clients/${task.organization_id}`}>
                        {task.title}
                      </Link>
                      <span className="ml-2 text-muted-foreground">
                        {group === "person" ? task.organization_name : (task.assignee_email ?? "Unassigned")}
                      </span>
                      {task.due_at ? <span className="ml-2 text-muted-foreground">Due {dayLabel(task.due_at)}</span> : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))
        )}
      </main>
    </StaffShell>
  );
}
