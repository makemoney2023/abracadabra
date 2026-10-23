import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTable, type Column } from "./data-table";
import { RelativeTime, emailInitials, formatAbsolute } from "./data-table-cells";
import { TooltipProvider } from "./ui/tooltip";

type Row = { id: string; name: string; kind: string; open: number };

const ROWS: Row[] = [
  { id: "1", name: "Renew Implants", kind: "Client", open: 3 },
  { id: "2", name: "LioCorr", kind: "Lead", open: 0 },
  { id: "3", name: "Strong Foam", kind: "Client", open: 12 },
  { id: "4", name: "Northwind Dental", kind: "Lead", open: 1 },
  { id: "5", name: "Harbour Physio", kind: "Partner", open: 7 },
];

const COLUMNS: Column<Row>[] = [
  { key: "name", header: "Client", sortable: true, cell: (row) => row.name },
  { key: "kind", header: "Kind", sortable: true, cell: (row) => row.kind },
  { key: "open", header: "Open work", sortable: true, align: "right", cell: (row) => row.open },
];

function render(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return renderToStaticMarkup(
    <DataTable<Row>
      columns={COLUMNS}
      rows={ROWS}
      rowKey={(row) => row.id}
      empty={<p>Nothing here</p>}
      {...props}
    />,
  );
}

describe("DataTable, as before", () => {
  it("renders every row with no toolbar or footer unless asked", () => {
    const html = render({ sort: "-open", basePath: "/clients" });
    expect(html).toContain("Renew Implants");
    expect(html).toContain("Harbour Physio");
    expect(html).not.toContain('data-slot="data-table-toolbar"');
    expect(html).not.toContain('data-slot="data-table-footer"');
  });

  it("keeps aria-sort and a sort link per sortable column", () => {
    const html = render({ sort: "-open", basePath: "/clients" });
    expect(html).toMatch(/aria-sort="descending"[^>]*data-col="open"|data-col="open"[^>]*aria-sort="descending"/);
    expect(html).toContain('aria-sort="none"');
    expect(html).toContain('href="/clients?sort=name"');
    expect(html).toContain(", sorted descending");
  });

  it("shows the page's own empty state when there are no rows", () => {
    const html = render({ rows: [], basePath: "/clients" });
    expect(html).toContain("Nothing here");
    expect(html).not.toContain("data-table-toolbar");
  });

  it("renders groups with a label row", () => {
    const html = render({ groups: [{ label: "Open", rows: ROWS.slice(0, 2) }] });
    expect(html).toContain("Open");
    expect(html).toContain("LioCorr");
    expect(html).not.toContain("Strong Foam");
  });
});

describe("DataTable search, filters and paging", () => {
  it("filters rows by the search text from ?q=", () => {
    const html = render({
      basePath: "/clients",
      query: { q: "foam" },
      search: { label: "Search clients", text: (row) => `${row.name} ${row.kind}` },
    });
    expect(html).toContain("Strong Foam");
    expect(html).not.toContain("LioCorr");
    expect(html).toContain('placeholder="Search clients"');
    expect(html).toContain('value="foam"');
    expect(html).toContain("1 row");
  });

  it("leaves rows alone when the page filters by q itself", () => {
    const html = render({ basePath: "/clients", query: { q: "foam" }, search: { label: "Search clients" } });
    expect(html).toContain("LioCorr");
    expect(html).toContain("Strong Foam");
  });

  it("filters rows by a chosen value and lists the values it found", () => {
    const html = render({
      basePath: "/clients",
      query: { kind: "Lead" },
      filters: [{ key: "kind", label: "Kind", get: (row) => row.kind }],
    });
    expect(html).toContain("LioCorr");
    expect(html).toContain("Northwind Dental");
    expect(html).not.toContain("Strong Foam");
    expect(html).toContain("Reset");
    expect(html).toContain('aria-label="Filter by kind"');
  });

  it("shows a no-match state with the toolbar still there", () => {
    const html = render({
      basePath: "/clients",
      query: { q: "zzz" },
      search: { label: "Search clients", text: (row) => row.name },
    });
    expect(html).toContain("No matches");
    expect(html).toContain('data-slot="data-table-toolbar"');
    expect(html).not.toContain("Nothing here");
  });

  it("keeps the page's own empty state when its own search finds nothing", () => {
    const html = render({ rows: [], basePath: "/clients", query: { q: "zzz" }, search: { label: "Search" } });
    expect(html).toContain("Nothing here");
    expect(html).toContain('data-slot="data-table-toolbar"');
  });

  it("pages rows and says where it is", () => {
    const html = render({ basePath: "/clients", query: {}, pageSize: 2 });
    expect(html).toContain("Renew Implants");
    expect(html).toContain("LioCorr");
    expect(html).not.toContain("Strong Foam");
    expect(html).toContain("Showing 1–2 of 5");
    expect(html).toContain('href="/clients?page=2"');
    expect(html).toContain('aria-label="Go to next page"');
  });

  it("opens the requested page and clamps one past the end", () => {
    const second = render({ basePath: "/clients", query: { page: "2", size: "10" }, pageSize: 2 });
    expect(second).toContain("5 rows");
    const third = render({ basePath: "/clients", query: { page: "3" }, pageSize: 2 });
    expect(third).toContain("Harbour Physio");
    expect(third).toContain("Showing 5–5 of 5");
    const past = render({ basePath: "/clients", query: { page: "99" }, pageSize: 2 });
    expect(past).toContain("Showing 5–5 of 5");
  });

  it("keeps search, filter and sort in sort and page links, and drops the page", () => {
    const html = render({
      basePath: "/clients",
      sort: "name",
      query: { q: "n", kind: "Client", page: "2" },
      search: { text: (row) => row.name },
      filters: [{ key: "kind", label: "Kind", get: (row) => row.kind }],
      pageSize: 1,
    });
    const hrefs = [...html.matchAll(/href="(\/clients\?[^"]*)"/g)].map((match) => match[1].replace(/&amp;/g, "&"));
    const sortLink = hrefs.find((href) => href.includes("sort=-name"));
    expect(sortLink).toBeDefined();
    const sortParams = new URLSearchParams(sortLink?.split("?")[1]);
    expect(sortParams.get("q")).toBe("n");
    expect(sortParams.get("kind")).toBe("Client");
    expect(sortParams.has("page")).toBe(false);
    // The pager keeps the same state and sets the page.
    const pageLink = hrefs.find((href) => href.includes("page="));
    expect(pageLink).toBeDefined();
    const pageParams = new URLSearchParams(pageLink?.split("?")[1]);
    expect(pageParams.get("q")).toBe("n");
    expect(pageParams.get("sort")).toBe("name");
  });

  it("carries the other params in the search form", () => {
    const html = render({
      basePath: "/leads?view=list",
      sort: "-score",
      query: { q: "x" },
      search: { text: (row) => row.name },
    });
    expect(html).toMatch(/<form [^>]*action="\/leads"/);
    expect(html).toContain('name="view" value="list"');
    expect(html).toContain('name="sort" value="-score"');
  });

  it("does not search or page grouped tables", () => {
    const html = render({
      groups: [{ label: "All", rows: ROWS }],
      basePath: "/clients",
      query: { q: "zzz", page: "2" },
      search: { text: (row) => row.name },
      pageSize: 2,
    });
    expect(html).toContain("Strong Foam");
    expect(html).not.toContain("Next");
  });
});

describe("DataTable columns", () => {
  it("offers the Columns menu and a boot script, but never for the first column", () => {
    const html = render({ basePath: "/clients", columnPicker: true, id: "clients" });
    expect(html).toContain("Show or hide columns");
    expect(html).toContain('data-dt-id="clients"');
    expect(html).toContain('[data-dt-id="clients"][data-hidden~="kind"] [data-col="kind"]{display:none}');
    expect(html).not.toContain('data-hidden~="name"');
    expect(html).toContain("hq:columns:v1:clients");
  });

  it("marks cells so a hidden column can be hidden", () => {
    const html = render({ basePath: "/clients" });
    expect(html).toContain('data-col="open"');
  });

  it("makes every row link when asked and names it", () => {
    const html = render({ rowHref: (row) => `/clients/${row.id}`, rowLabel: (row) => row.name });
    expect(html).toContain('href="/clients/1"');
    expect(html).toContain('aria-label="Open Renew Implants"');
    expect(html).toContain("data-row-link");
  });

  it("cuts long text to one line", () => {
    const html = render({
      columns: [{ ...COLUMNS[0], truncate: "10rem" }, ...COLUMNS.slice(1)],
    });
    expect(html).toContain("max-width:10rem");
    expect(html).toContain("truncate");
  });
});

describe("table cells", () => {
  it("writes the full time in Toronto time", () => {
    expect(formatAbsolute(Date.UTC(2026, 9, 22, 13, 0, 0))).toMatch(/Oct 22, 2026.*9:00.*EDT/);
  });

  it("shows a short age with the full time beside it", () => {
    const now = Date.UTC(2026, 9, 22, 13, 0, 0);
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <RelativeTime at={now - 3 * 3_600_000} now={now} />
      </TooltipProvider>,
    );
    expect(html).toContain("3h");
    expect(html).toContain("<time");
    expect(html).toContain('dateTime="2026-10-22T10:00:00.000Z"');
  });

  it("shows nothing for a missing time", () => {
    expect(renderToStaticMarkup(<RelativeTime at={null} now={Date.now()} />)).toBe("");
  });

  it("makes initials from an email", () => {
    expect(emailInitials("ada.lovelace@example.com")).toBe("AL");
    expect(emailInitials("christopher@abra-ca-dabra.app")).toBe("C");
    expect(emailInitials(null)).toBe("?");
  });
});
