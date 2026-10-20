import Link from "next/link";
import { clock } from "@/lib/clock";
import { filingChoices, listUnfiledForStaff, type UnfiledRow } from "@/lib/agent-admin";
import { requireHqStaffPage } from "@/lib/current";
import { formatRelative } from "@/lib/format";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageFrame } from "@/components/page-frame";
import { Badge } from "@/components/ui/badge";
import { StaffShell } from "../staff-shell";
import { DiscardItemDrawer, FileItemDrawer } from "./unfiled-forms";

export const dynamic = "force-dynamic";

export default async function UnfiledPage() {
  const { sql, caller } = await requireHqStaffPage();
  const now = clock();
  const [items, choices] = await Promise.all([listUnfiledForStaff(sql, caller, now), filingChoices(sql)]);

  const columns: Column<UnfiledRow>[] = [
    {
      key: "title",
      header: "Work",
      cell: (row) => (
        <div className="flex max-w-md flex-col gap-0.5">
          <span className="font-medium">{row.title}</span>
          {row.summary ? <span className="line-clamp-2 text-xs text-muted-foreground">{row.summary}</span> : null}
        </div>
      ),
    },
    { key: "kind", header: "Kind", cell: (row) => <Badge variant="secondary">{row.kind}</Badge> },
    {
      key: "agent",
      header: "Agent",
      cell: (row) => (
        <div className="flex flex-col">
          <span>{row.agentLabel}</span>
          <span className="font-mono text-xs text-muted-foreground">{row.agentId}</span>
        </div>
      ),
    },
    {
      key: "suggestion",
      header: "Suggested client",
      cell: (row) =>
        row.suggestion ? (
          <div className="flex flex-col">
            <Link className="underline-offset-4 hover:underline" href={`/clients/${row.suggestion.organizationId}`}>
              {row.suggestion.name}
            </Link>
            <span className="text-xs text-muted-foreground">{row.suggestion.why}</span>
          </div>
        ) : row.domainHint ? (
          <span className="text-muted-foreground">No client for {row.domainHint}</span>
        ) : (
          <span className="text-muted-foreground">None</span>
        ),
    },
    { key: "reason", header: "Why it's here", cell: (row) => <span className="text-sm">{row.reason}</span> },
    { key: "age", header: "Waiting", cell: (row) => formatRelative(row.createdAt, now) },
    {
      key: "actions",
      header: "",
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          <FileItemDrawer item={row} clients={choices.clients} />
          <DiscardItemDrawer item={row} />
        </div>
      ),
    },
  ];

  return (
    <StaffShell>
      <PageFrame
        width="wide"
        title="Unfiled work"
        description="Agent work HQ couldn't place on its own. HQ never guesses, so pick the client and space, or discard it with a reason."
      >
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(row) => row.id}
          empty={<EmptyState title="Nothing waiting" body="Agent work that can't be placed shows up here." />}
        />
      </PageFrame>
    </StaffShell>
  );
}
