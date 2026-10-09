import Link from "next/link";
import {
  STATUS_HEALTHS,
  listDeals,
  listOrganizations,
  listProjects,
  listWork,
  type OrgKind,
  type StatusHealth,
} from "@/db/crm";
import { clock } from "@/lib/clock";
import { clientRows, type ClientPlan, type ClientRow, type ClientWorkItem } from "@/lib/client-rows";
import { requireHqStaffPage } from "@/lib/current";
import { formatRelative } from "@/lib/format";
import { statusToken } from "@/lib/status-token";
import { sortRows } from "@/components/data-table-sort";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageFrame } from "@/components/page-frame";
import { StatusDot } from "@/components/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StaffShell } from "../staff-shell";
import { NewClientDrawer } from "./client-form";

const KIND_LABEL: Record<OrgKind, string> = {
  lead: "Lead",
  client: "Client",
  past_client: "Past client",
  partner: "Partner",
};

const HEALTH_SQL = `SELECT o.id AS id, s.health AS health
  FROM organizations o
  JOIN status_updates s ON s.id = (
    SELECT s2.id FROM status_updates s2
    WHERE s2.organization_id = o.id
    ORDER BY s2.created_at DESC, s2.id DESC
    LIMIT 1
  )
  WHERE o.archived_at IS NULL`;

function asHealth(value: string): StatusHealth | null {
  return (STATUS_HEALTHS as readonly string[]).includes(value) ? (value as StatusHealth) : null;
}

function sortValue(row: ClientRow, key: string): string | number | null {
  if (key === "name") return row.name;
  if (key === "kind") return KIND_LABEL[row.kind];
  if (key === "health") return row.health ? statusToken("health", row.health).label : "";
  if (key === "owner") return row.owner;
  if (key === "openWork") return row.openWork;
  if (key === "nextStep") return row.nextStep;
  if (key === "lastActivity") return row.lastActivity;
  return "";
}

const columns: Column<ClientRow>[] = [
  {
    key: "name",
    header: "Client",
    sortable: true,
    cell: (row) => <span className="font-medium">{row.name}</span>,
  },
  {
    key: "kind",
    header: "Kind",
    sortable: true,
    cell: (row) => <Badge variant="secondary">{KIND_LABEL[row.kind]}</Badge>,
  },
  {
    key: "health",
    header: "Health",
    sortable: true,
    cell: (row) =>
      row.health ? (
        <span className="inline-flex items-center gap-1.5">
          <StatusDot domain="health" value={row.health} />
          <span>{statusToken("health", row.health).label}</span>
        </span>
      ) : null,
  },
  { key: "owner", header: "Owner", sortable: true, cell: (row) => row.owner },
  {
    key: "openWork",
    header: "Open work",
    sortable: true,
    align: "right",
    cell: (row) => row.openWork,
  },
  { key: "nextStep", header: "Next step", sortable: true, cell: (row) => row.nextStep },
  {
    key: "lastActivity",
    header: "Last activity",
    sortable: true,
    cell: (row) => (row.lastActivity == null ? "" : formatRelative(row.lastActivity)),
  },
];

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q : "";
  const sort = typeof query.sort === "string" ? query.sort : undefined;
  const { sql, caller } = await requireHqStaffPage();
  const now = clock();
  const [orgs, tasks, projects, deals, health, activity, staff] = await Promise.all([
    listOrganizations(sql, caller),
    listWork(sql, caller, {}, now),
    listProjects(sql, caller),
    listDeals(sql, caller),
    sql.all<{ id: string; health: string }>(HEALTH_SQL),
    sql.all<{ organization_id: string; at: number }>(
      `SELECT organization_id, MAX(created_at) AS at
       FROM activities
       WHERE organization_id IS NOT NULL
       GROUP BY organization_id`,
    ),
    sql.all<{ user_id: string; email: string }>(
      "SELECT user_id, email FROM staff WHERE revoked_at IS NULL",
    ),
  ]);
  const emailOf = new Map(staff.map((person) => [person.user_id, person.email]));
  const plans: ClientPlan[] = [];
  for (const project of projects) {
    const closed = project.status === "done" || project.status === "cancelled";
    plans.push({
      organizationId: project.organization_id,
      owner: closed || !project.owner_user_id ? null : (emailOf.get(project.owner_user_id) ?? null),
      lastActivity: project.updated_at,
    });
  }
  for (const deal of deals) {
    const closed = deal.stage === "won" || deal.stage === "lost";
    plans.push({
      organizationId: deal.organization_id,
      owner: closed || !deal.owner_user_id ? null : (emailOf.get(deal.owner_user_id) ?? null),
      nextStep: closed ? null : deal.next_step,
      lastActivity: deal.last_touch,
    });
  }
  for (const row of health) {
    const value = asHealth(row.health);
    if (value) plans.push({ organizationId: row.id, health: value });
  }
  for (const row of activity) {
    plans.push({ organizationId: row.organization_id, lastActivity: row.at });
  }
  const work: ClientWorkItem[] = tasks.map((task) => ({
    organizationId: task.organization_id,
    status: task.status,
    title: task.title,
    dueAt: task.due_at,
    owner: task.assignee_email,
  }));
  const rows = sortRows(clientRows(orgs, work, plans, { q }), sort, sortValue);
  const search = new URLSearchParams();
  if (q.trim()) search.set("q", q);
  const basePath = search.size > 0 ? `/clients?${search.toString()}` : "/clients";
  const emptyTitle = q.trim() ? "No clients match" : "No clients yet";
  const emptyBody = q.trim() ? "Try a different name." : "Add a client to start a record.";

  return (
    <StaffShell>
      <PageFrame
        title="Clients"
        description="Company records live here. File spaces stay linked to them."
        actions={<NewClientDrawer />}
      >
        <form action="/clients" className="flex max-w-md items-center gap-2">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search clients"
            aria-label="Search clients"
            data-hq-search
          />
          {sort ? <input type="hidden" name="sort" value={sort} /> : null}
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          rowHref={(row) => `/clients/${row.id}`}
          sort={sort}
          basePath={basePath}
          empty={
            <EmptyState
              title={emptyTitle}
              body={emptyBody}
              action={
                q.trim() ? (
                  <Button variant="outline" asChild>
                    <Link href="/clients">Clear search</Link>
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </PageFrame>
    </StaffShell>
  );
}
