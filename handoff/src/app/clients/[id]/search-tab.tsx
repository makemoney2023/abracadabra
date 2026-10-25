import { SearchReportView } from "@/components/search/search-report-view";
import type { SearchTabData } from "@/lib/search/search-tab";
import { tabHref } from "./tabs";

/** Staff Search tab: the client's Search Console performance, read from handoff-search. */
export function SearchTab({ organizationId, search }: { organizationId: string; search: SearchTabData }) {
  return (
    <SearchReportView
      audience="staff"
      basePath={tabHref(organizationId, "search")}
      properties={search.properties}
      property={search.property}
      report={search.report}
      range={search.range}
      sort={search.sort}
      settingsHref={tabHref(organizationId, "settings")}
    />
  );
}
