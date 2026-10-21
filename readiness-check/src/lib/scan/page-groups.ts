/** Grouping, ranking and CSV for the page matrix, the PDF and the CSV download. No UI imports. */

export type MatrixPage = {
  url: string;
  pageType: string;
  fetchStatus: string;
  hasJsonLd: boolean;
  schemaTypes: string[];
};

export type PageGroup<T extends MatrixPage = MatrixPage> = {
  key: string;
  label: string;
  pages: T[];
  failed: number;
  missingSchema: number;
};

const TYPE_LABELS: Record<string, string> = {
  home: "Home",
  contact: "Contact",
  service: "Services",
  about: "About",
  faq: "FAQ",
  appointment: "Booking",
  testimonial: "Reviews",
  pricing: "Pricing",
  blog: "Blog",
  blogPost: "Blog posts",
  event: "Events",
  careers: "Careers",
  menu: "Menu",
  howto: "How-to",
  product: "Products",
  location: "Locations",
};

function firstSegment(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const segment = segments[0] ?? "";
    // "/robots.txt" is a file at the root; "/1.1.1.1/setup/" is a section that happens to contain dots.
    return segments.length === 1 && segment.includes(".") ? "" : segment;
  } catch {
    return "";
  }
}

/** Typed pages group by type; unclassified pages group by their top-level section, e.g. /portfolio/. */
export function pageSection(page: Pick<MatrixPage, "url" | "pageType">): { key: string; label: string } {
  if (page.pageType !== "other") {
    return { key: page.pageType, label: TYPE_LABELS[page.pageType] ?? page.pageType };
  }
  const segment = firstSegment(page.url);
  return segment ? { key: `other:${segment}`, label: `/${segment}/` } : { key: "other:", label: "Other pages" };
}

/** 0 = could not be fetched, 1 = fetched without structured data, 2 = fine. Lower is worse. */
export function pageRank(page: Pick<MatrixPage, "fetchStatus" | "hasJsonLd">): number {
  if (page.fetchStatus !== "ok") return 0;
  return page.hasJsonLd ? 2 : 1;
}

export function pageIssue(page: Pick<MatrixPage, "fetchStatus" | "hasJsonLd">): string {
  const rank = pageRank(page);
  if (rank === 0) return "Could not be fetched";
  if (rank === 1) return "No structured data";
  return "";
}

function byRank<T extends MatrixPage>(pages: T[]): T[] {
  return pages
    .map((page, index) => ({ page, index }))
    .sort((a, b) => pageRank(a.page) - pageRank(b.page) || a.index - b.index)
    .map((row) => row.page);
}

/** Groups with failures first (then most pages without schema, then biggest); inside a group, worst pages first. */
export function groupPages<T extends MatrixPage>(pages: T[]): PageGroup<T>[] {
  const groups = new Map<string, PageGroup<T>>();
  for (const page of pages) {
    const section = pageSection(page);
    let group = groups.get(section.key);
    if (!group) {
      group = { key: section.key, label: section.label, pages: [], failed: 0, missingSchema: 0 };
      groups.set(section.key, group);
    }
    group.pages.push(page);
    const rank = pageRank(page);
    if (rank === 0) group.failed += 1;
    if (rank === 1) group.missingSchema += 1;
  }
  return [...groups.values()]
    .map((group) => ({ ...group, pages: byRank(group.pages) }))
    .sort(
      (a, b) =>
        b.failed - a.failed ||
        b.missingSchema - a.missingSchema ||
        b.pages.length - a.pages.length ||
        a.label.localeCompare(b.label),
    );
}

/** The PDF lists this many pages; the CSV has all of them. */
export const PDF_PAGE_LIMIT = 50;

export function worstPages<T extends MatrixPage>(pages: T[], limit = PDF_PAGE_LIMIT): T[] {
  return byRank(pages).slice(0, limit);
}

export function pageSlice<T>(items: T[], page: number, size: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { items: items.slice(current * size, current * size + size), page: current, pages };
}

/** Quote a CSV cell, and keep spreadsheet apps from running a cell that starts like a formula. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const CSV_HEADER = ["url", "section", "page_type", "fetch_status", "structured_data", "schema_types", "issue"];

export function pagesCsv(pages: MatrixPage[]): string {
  const rows = [CSV_HEADER.join(",")];
  for (const page of byRank(pages)) {
    rows.push(
      [
        page.url,
        pageSection(page).label,
        page.pageType,
        page.fetchStatus,
        page.hasJsonLd ? "yes" : "no",
        page.schemaTypes.join("; "),
        pageIssue(page),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}
