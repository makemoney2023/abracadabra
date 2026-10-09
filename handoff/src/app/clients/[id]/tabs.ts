import type { OrgKind } from "@/db/crm";

export const CLIENT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "work", label: "Work" },
  { id: "threads", label: "Threads" },
  { id: "files", label: "Files & spaces" },
  { id: "repos", label: "Repos" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
] as const;

export type ClientTabId = (typeof CLIENT_TABS)[number]["id"];

export const CLIENT_KIND_LABEL: Record<OrgKind, string> = {
  lead: "Lead",
  client: "Client",
  past_client: "Past client",
  partner: "Partner",
};

const TAB_IDS = new Set<string>(CLIENT_TABS.map((tab) => tab.id));

export function activeTab(value: string | undefined): ClientTabId {
  if (value && TAB_IDS.has(value)) return value as ClientTabId;
  return "overview";
}

/** Deep link for a client tab. Page numbers stay on Activity. */
export function tabHref(clientId: string, tab: ClientTabId, page = 1): string {
  const params = new URLSearchParams();
  if (tab !== "overview") params.set("tab", tab);
  if (tab === "activity" && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/clients/${clientId}?${query}` : `/clients/${clientId}`;
}
