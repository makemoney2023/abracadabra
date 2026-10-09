import { DEAL_STAGES, DEAL_STAGE_LABEL, listDeals, type DealStage } from "@/db/crm";
import { clock } from "@/lib/clock";
import { requireHqStaffPage } from "@/lib/current";
import { formatRelative } from "@/lib/format";
import { sortRows } from "@/components/data-table-sort";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageFrame } from "@/components/page-frame";
import { StatusBadge } from "@/components/status-badge";
import { StaffShell } from "../staff-shell";
import { DealBoard, type BoardDeal } from "./board";
import { LeadsToolbar } from "./filters";
import { NewLeadDrawer } from "./lead-form";
import { filterDeals, leadsHref, leadsView, ownerInitials, stageCounts, type LeadFilterRow } from "./view";

type LeadRow = LeadFilterRow & {
  organizationId: string;
  company: string;
  score: number | null;
  nextStep: string;
  ownerLabel: string;
  updated: number | null;
};

function knownStage(value: string | undefined): string {
  const stage = value?.trim() ?? "";
  return (DEAL_STAGES as readonly string[]).includes(stage) ? stage : "";
}

function sortValue(row: LeadRow, key: string): string | number | null {
  if (key === "company") return row.company;
  if (key === "contact") return row.contact ?? "";
  if (key === "stage") return DEAL_STAGE_LABEL[row.stage];
  if (key === "score") return row.score;
  if (key === "next") return row.nextStep;
  if (key === "owner") return row.ownerLabel;
  if (key === "updated") return row.updated;
  return "";
}

function leadColumns(now: number): Column<LeadRow>[] {
  return [
    {
      key: "company",
      header: "Company",
      sortable: true,
      cell: (row) => <span className="font-medium">{row.company}</span>,
    },
    {
      key: "contact",
      header: "Contact",
      sortable: true,
      cell: (row) => row.contact || null,
    },
    {
      key: "stage",
      header: "Stage",
      sortable: true,
      cell: (row) => <StatusBadge domain="deal" value={row.stage} />,
    },
    {
      key: "score",
      header: "Score",
      sortable: true,
      align: "right",
      cell: (row) => (row.score === null ? null : <span className="tabular-nums">{row.score}</span>),
    },
    {
      key: "next",
      header: "Next step",
      sortable: true,
      cell: (row) => row.nextStep || null,
    },
    {
      key: "owner",
      header: "Owner",
      sortable: true,
      cell: (row) => row.ownerLabel || null,
    },
    {
      key: "updated",
      header: "Updated",
      sortable: true,
      cell: (row) => (row.updated == null ? null : formatRelative(row.updated, now)),
    },
  ];
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; stage?: string; owner?: string; q?: string; sort?: string }>;
}) {
  const query = await searchParams;
  const view = leadsView(query.view);
  const stage = knownStage(query.stage);
  const owner = query.owner?.trim() ?? "";
  const q = query.q?.trim() ?? "";
  const sort = query.sort?.trim() || undefined;
  const { sql, caller } = await requireHqStaffPage();
  const now = clock();
  const [deals, owners, contacts] = await Promise.all([
    listDeals(sql, caller),
    sql.all<{ user_id: string; email: string }>(
      "SELECT user_id, email FROM staff WHERE revoked_at IS NULL ORDER BY email",
    ),
    sql.all<{ organization_id: string; name: string }>(
      `SELECT organization_id, name FROM contacts
       ORDER BY is_primary DESC, name`,
    ),
  ]);
  const emailOf = new Map(owners.map((person) => [person.user_id, person.email]));
  const contactOf = new Map<string, string>();
  for (const person of contacts) {
    const name = person.name.trim();
    if (name.length > 0 && !contactOf.has(person.organization_id)) {
      contactOf.set(person.organization_id, name);
    }
  }
  const rows: LeadRow[] = deals.map((deal) => ({
    id: deal.id,
    stage: deal.stage,
    organization_name: deal.organization_name,
    title: deal.title,
    owner_user_id: deal.owner_user_id,
    next_step: deal.next_step,
    contact: contactOf.get(deal.organization_id) ?? "",
    organizationId: deal.organization_id,
    company: deal.organization_name,
    score: deal.score,
    nextStep: deal.next_step?.trim() ?? "",
    ownerLabel: ownerInitials(deal.owner_user_id ? emailOf.get(deal.owner_user_id) : null),
    updated: deal.last_touch,
  }));
  const scoped = filterDeals(rows, { owner, q });
  const counts = stageCounts(scoped);
  const visible = sortRows(filterDeals(scoped, { stage }), sort, sortValue);
  const filtered = Boolean(stage || owner || q);
  const basePath = leadsHref({ view, stage, owner, q });
  const boardDeals: BoardDeal[] = visible.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    company: row.company,
    contact: row.contact ?? "",
    score: row.score,
    age: row.updated == null ? "" : formatRelative(row.updated, now),
    stage: row.stage as DealStage,
  }));

  return (
    <StaffShell>
      <PageFrame
        title="Leads"
        description="Deals in motion. Filter by stage, owner, or a word."
        width="wide"
        actions={<NewLeadDrawer />}
      >
        <LeadsToolbar
          view={view}
          stage={stage}
          owner={owner}
          q={q}
          sort={sort}
          counts={counts}
          owners={owners.map((person) => ({ userId: person.user_id, email: person.email }))}
        />
        {view === "board" ? (
          visible.length === 0 ? (
            <EmptyState
              title={filtered ? "No leads match" : "No leads yet"}
              body={filtered ? "Try another stage, owner, or word." : "Add a lead to start a deal."}
            />
          ) : (
            <DealBoard deals={boardDeals} stages={stage ? [stage as DealStage] : [...DEAL_STAGES]} />
          )
        ) : (
          <DataTable
            columns={leadColumns(now)}
            rows={visible}
            rowKey={(row) => row.id}
            rowHref={(row) => `/clients/${row.organizationId}`}
            sort={sort}
            basePath={basePath}
            empty={
              <EmptyState
                title={filtered ? "No leads match" : "No leads yet"}
                body={filtered ? "Try another stage, owner, or word." : "Add a lead to start a deal."}
              />
            }
          />
        )}
      </PageFrame>
    </StaffShell>
  );
}
