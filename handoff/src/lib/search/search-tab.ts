import type { Sql } from "@/db/sql";
import { can, type Caller } from "@/lib/authz";
import { listSearchProperties, type SearchProperty } from "./properties";
import { loadSearchReport, searchRangeId, searchSort, type SearchRangeId, type SearchReport, type SearchSort } from "./report";

export type SearchTabData = {
  properties: SearchProperty[];
  property: SearchProperty | null;
  report: SearchReport | null;
  range: SearchRangeId;
  sort: SearchSort;
};

/**
 * Everything the Search tab needs for one organization. Properties come from the handoff database filtered by that
 * organization, and a property id from the URL is only honored when it is in that list, so a client (or a hand-edited
 * link) can never open another organization's property. Pending properties don't hit SEARCH_DB at all.
 */
export async function loadSearchTab(
  sql: Sql,
  searchSql: Sql | null,
  input: {
    organizationId: string;
    property?: string;
    range?: string;
    sort?: string;
    now: number;
  },
): Promise<SearchTabData> {
  const range = searchRangeId(input.range);
  const sort = searchSort(input.sort);
  const properties = (await listSearchProperties(sql, input.organizationId)).filter((row) => row.provider === "gsc");
  const property =
    properties.find((row) => row.id === input.property) ??
    properties.find((row) => row.status === "active") ??
    properties[0] ??
    null;
  if (!property || property.status === "pending") return { properties, property, report: null, range, sort };
  const report = await loadSearchReport(searchSql, {
    organizationId: input.organizationId,
    propertyId: property.id,
    range,
    sort,
    now: input.now,
    finalOnly: true,
  });
  return { properties, property, report, range, sort };
}

/** Whether a space's organization has a Search Console property mapped (shows the Search link in the space header). */
export async function hasSearchProperty(sql: Sql, workspaceId: string): Promise<boolean> {
  const row = await sql.get<{ ok: number }>(
    `SELECT 1 AS ok FROM workspaces w JOIN search_properties p ON p.organization_id = w.organization_id
     WHERE w.id = ? AND p.provider = 'gsc' AND p.status <> 'removed' LIMIT 1`,
    [workspaceId],
  );
  return row?.ok === 1;
}

/**
 * Who sees the Search page in a client's space: everyone who can see the space (all its members, owners and members
 * alike, plus assigned operators and super-admins). Christopher's call on 2026-10-25. The page and header link still
 * need a mapped property, and the data is always the space's own organization.
 */
export function canSeeSpaceSearch(caller: Caller, workspaceId: string): boolean {
  return can(caller, "workspace.view", { workspaceId });
}
