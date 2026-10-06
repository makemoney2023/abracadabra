import Link from "next/link";
import { DEAL_STAGES, DEAL_STAGE_LABEL, listDeals } from "@/db/crm";
import { requireHqStaffPage } from "@/lib/current";
import { Button } from "@/components/ui/button";
import { StaffShell } from "../staff-shell";
import { DealBoard } from "./board";

function queryOf(params: { view?: string; stage?: string; source?: string; owner?: string }): string {
  const search = new URLSearchParams();
  if (params.view === "list") search.set("view", "list");
  if (params.stage) search.set("stage", params.stage);
  if (params.source) search.set("source", params.source);
  if (params.owner) search.set("owner", params.owner);
  const text = search.toString();
  return text.length > 0 ? `?${text}` : "";
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; stage?: string; source?: string; owner?: string }>;
}) {
  const query = await searchParams;
  const view = query.view === "list" ? "list" : "board";
  const stage = query.stage?.trim() ?? "";
  const source = query.source?.trim() ?? "";
  const owner = query.owner?.trim() ?? "";
  const { sql, caller } = await requireHqStaffPage();
  const [deals, owners] = await Promise.all([
    listDeals(sql, caller, {
      stage: stage || undefined,
      source: source || undefined,
      ownerUserId: owner || undefined,
    }),
    sql.all<{ user_id: string; email: string }>(
      "SELECT user_id, email FROM staff WHERE revoked_at IS NULL ORDER BY email",
    ),
  ]);
  const otherView = view === "list" ? "board" : "list";
  return (
    <StaffShell>
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-4xl leading-tight">Leads</h1>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3">
        {view === "list" ? <input type="hidden" name="view" value="list" /> : null}
        <label className="flex flex-col gap-1 text-sm" htmlFor="filter-stage">
          Stage
          <select
            id="filter-stage"
            name="stage"
            defaultValue={stage}
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Any stage</option>
            {DEAL_STAGES.map((item) => (
              <option key={item} value={item}>
                {DEAL_STAGE_LABEL[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm" htmlFor="filter-source">
          Source
          <input
            id="filter-source"
            name="source"
            defaultValue={source}
            maxLength={80}
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm" htmlFor="filter-owner">
          Owner
          <select
            id="filter-owner"
            name="owner"
            defaultValue={owner}
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Anyone</option>
            {owners.map((person) => (
              <option key={person.user_id} value={person.user_id}>
                {person.email}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Filter
        </Button>
        <Link href={`/leads${queryOf({ view: otherView, stage, source, owner })}`} className="text-sm">
          {view === "list" ? "Board" : "List"}
        </Link>
      </form>
      {deals.length === 0 ? <p className="text-sm text-muted-foreground">No deals yet.</p> : null}
      <DealBoard deals={deals} view={view} />
    </main>
    </StaffShell>
  );
}
