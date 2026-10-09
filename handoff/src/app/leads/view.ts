import { DEAL_STAGES, type DealStage } from "@/db/crm";
import { initials } from "@/lib/format";

export type LeadFilterRow = {
  id: string;
  stage: DealStage;
  organization_name: string;
  title: string;
  owner_user_id: string | null;
  next_step: string | null;
  contact?: string | null;
};

export type LeadFilters = {
  stage?: string;
  owner?: string;
  q?: string;
};

export type LeadsView = "list" | "board";

const STAGE_SET = new Set<string>(DEAL_STAGES);

/** A count for every stage, including stages with no deals. */
export function stageCounts(deals: Pick<LeadFilterRow, "stage">[]): Record<DealStage, number> {
  const counts = {} as Record<DealStage, number>;
  for (const stage of DEAL_STAGES) counts[stage] = 0;
  for (const deal of deals) {
    if (STAGE_SET.has(deal.stage)) counts[deal.stage] += 1;
  }
  return counts;
}

/** List is the default. Board is the only other view. */
export function leadsView(view: string | undefined): LeadsView {
  return view === "board" ? "board" : "list";
}

/** Keep deals that match stage, owner, and a word in the company, title, next step, or contact. */
export function filterDeals<T extends LeadFilterRow>(deals: T[], filters: LeadFilters): T[] {
  const stage = filters.stage?.trim() ?? "";
  const knownStage = STAGE_SET.has(stage) ? stage : "";
  const owner = filters.owner?.trim() ?? "";
  const q = (filters.q ?? "").trim().toLowerCase();
  return deals.filter((deal) => {
    if (knownStage && deal.stage !== knownStage) return false;
    if (owner && deal.owner_user_id !== owner) return false;
    if (!q) return true;
    const haystack = [deal.organization_name, deal.title, deal.next_step ?? "", deal.contact ?? ""]
      .join("\n")
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** Leads URL. The list view leaves `view` out. Blank filters stay out. */
export function leadsHref(input: {
  view?: string;
  stage?: string;
  owner?: string;
  q?: string;
  sort?: string;
}): string {
  const params = new URLSearchParams();
  if (leadsView(input.view) === "board") params.set("view", "board");
  const stage = input.stage?.trim() ?? "";
  const owner = input.owner?.trim() ?? "";
  const q = input.q?.trim() ?? "";
  const sort = input.sort?.trim() ?? "";
  if (stage && STAGE_SET.has(stage)) params.set("stage", stage);
  if (owner) params.set("owner", owner);
  if (q) params.set("q", q);
  if (sort) params.set("sort", sort);
  const text = params.toString();
  return text.length > 0 ? `/leads?${text}` : "/leads";
}

/** Initials from an email. Blank when there is no owner. */
export function ownerInitials(email: string | null | undefined): string {
  const local = (email ?? "").split("@")[0]?.replace(/[._+-]+/g, " ").trim() ?? "";
  if (local.length === 0) return "";
  return initials(local);
}
