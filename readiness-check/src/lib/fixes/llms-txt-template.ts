/**
 * llmstxt.org v2 generators for fix packages.
 * Spec: https://llmstxt.org/ — H1, blockquote, detail prose, H2 file lists with
 * `- [title](url): notes`, and an Optional section for secondary links.
 */

import type { PostalAddressFacts } from "@/lib/facts/types";

export type LlmsTemplatePage = {
  url: string;
  pageType: string;
  fetchStatus: string;
};

export type LlmsTemplateBiz = {
  name: string;
  description?: string;
  email?: string;
  phone?: string;
  sameAs?: string[];
  address?: PostalAddressFacts;
};

export type LlmsTemplateInput = {
  origin: string;
  domain: string;
  biz: LlmsTemplateBiz;
  pages: LlmsTemplatePage[];
};

type SectionId = "core" | "offers" | "support" | "optional";

const PAGE_META: Record<
  string,
  { title: string; note: string; section: SectionId }
> = {
  home: {
    title: "Home",
    note: "Primary overview of the organization and offerings",
    section: "core",
  },
  about: {
    title: "About",
    note: "Company background, mission, and entity context",
    section: "core",
  },
  contact: {
    title: "Contact",
    note: "How to reach the business (forms, phone, email, locations)",
    section: "support",
  },
  service: {
    title: "Services",
    note: "Service offerings described for customers and answer engines",
    section: "offers",
  },
  product: {
    title: "Products",
    note: "Product catalog and commercial offerings",
    section: "offers",
  },
  products: {
    title: "Products",
    note: "Product catalog and commercial offerings",
    section: "offers",
  },
  pricing: {
    title: "Pricing",
    note: "Pricing and plan information",
    section: "offers",
  },
  faq: {
    title: "FAQ",
    note: "Frequently asked questions in answer-ready form",
    section: "support",
  },
  appointment: {
    title: "Appointments",
    note: "Booking or reservation entry point",
    section: "support",
  },
  book: {
    title: "Book",
    note: "Booking or reservation entry point",
    section: "support",
  },
  menu: {
    title: "Menu",
    note: "Menu or catalog of offerings",
    section: "offers",
  },
  events: {
    title: "Events",
    note: "Upcoming or past events",
    section: "optional",
  },
  blog: {
    title: "Blog",
    note: "Articles and updates (secondary context)",
    section: "optional",
  },
  blogPost: {
    title: "Article",
    note: "Individual article (secondary context)",
    section: "optional",
  },
  testimonial: {
    title: "Testimonials",
    note: "Customer reviews and social proof",
    section: "optional",
  },
  careers: {
    title: "Careers",
    note: "Job openings and hiring information",
    section: "optional",
  },
  other: {
    title: "Page",
    note: "Additional site page",
    section: "optional",
  },
};

const SECTION_HEADINGS: Record<SectionId, string> = {
  core: "Core",
  offers: "Offers",
  support: "Support",
  optional: "Optional",
};

const SECTION_ORDER: SectionId[] = ["core", "offers", "support", "optional"];

function originBase(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}

function formatAddress(address: PostalAddressFacts | undefined): string | undefined {
  if (!address) return undefined;
  const parts = [
    address.streetAddress,
    [address.addressLocality, address.addressRegion].filter(Boolean).join(", "),
    address.postalCode,
    address.addressCountry,
  ].filter((p) => Boolean(p && String(p).trim()));
  return parts.length ? parts.join(" · ") : undefined;
}

function humanTitle(pageType: string, url: string): string {
  const meta = PAGE_META[pageType];
  if (meta && pageType !== "other") return meta.title;
  try {
    const path = new URL(url).pathname.replace(/\/$/, "") || "/";
    if (path === "/") return "Home";
    const last = path.split("/").filter(Boolean).pop() ?? "Page";
    return last
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return meta?.title ?? "Page";
  }
}

function noteFor(pageType: string): string {
  return PAGE_META[pageType]?.note ?? PAGE_META.other!.note;
}

function sectionFor(pageType: string): SectionId {
  return PAGE_META[pageType]?.section ?? "optional";
}

function okPages(pages: LlmsTemplatePage[]): LlmsTemplatePage[] {
  return pages.filter((p) => p.fetchStatus === "ok");
}

function linkLine(page: LlmsTemplatePage): string {
  const title = humanTitle(page.pageType, page.url);
  return `- [${title}](${page.url}): ${noteFor(page.pageType)}`;
}

function buildDetailProse(input: LlmsTemplateInput): string {
  const { biz, domain } = input;
  const origin = originBase(input.origin);
  const lines: string[] = [];

  lines.push(
    `This llms.txt file is the LLM-oriented overview for ${biz.name} (${domain}). ` +
      `Prefer the linked pages below for authoritative detail; fetch only what you need.`,
  );

  const facts: string[] = [];
  if (biz.phone) facts.push(`Phone: ${biz.phone}`);
  if (biz.email) facts.push(`Email: ${biz.email}`);
  const address = formatAddress(biz.address);
  if (address) facts.push(`Address: ${address}`);
  if (facts.length) {
    lines.push(`Entity contact facts: ${facts.join(" · ")}.`);
  }
  if (biz.sameAs?.length) {
    lines.push(
      `Official profiles (sameAs): ${biz.sameAs.map((u) => `[${u}](${u})`).join(", ")}.`,
    );
  }
  lines.push(
    `Canonical site URL: ${origin}/. Pair this file with on-page JSON-LD (Organization / page types) when both are available.`,
  );

  return lines.join("\n\n");
}

function buildSections(
  pages: LlmsTemplatePage[],
  opts: { includeOptional: boolean; maxPerPrimary?: number; origin: string },
): string {
  const groups = new Map<SectionId, LlmsTemplatePage[]>();
  for (const id of SECTION_ORDER) groups.set(id, []);

  for (const page of pages) {
    const section = sectionFor(page.pageType);
    groups.get(section)!.push(page);
  }

  // Cap optional noise in the short file; full file keeps everything.
  if (opts.maxPerPrimary != null) {
    for (const id of ["core", "offers", "support"] as SectionId[]) {
      const list = groups.get(id)!;
      if (list.length > opts.maxPerPrimary) {
        groups.set(id, list.slice(0, opts.maxPerPrimary));
      }
    }
    const optional = groups.get("optional")!;
    groups.set("optional", optional.slice(0, Math.min(optional.length, 8)));
  }

  const chunks: string[] = [];
  for (const id of SECTION_ORDER) {
    if (id === "optional" && !opts.includeOptional) continue;
    const list = groups.get(id)!;
    if (list.length === 0) continue;
    chunks.push(`## ${SECTION_HEADINGS[id]}\n${list.map(linkLine).join("\n")}`);
  }

  // v2 convention: Optional holds secondary links; always present with at least sitemap.
  if (opts.includeOptional && !chunks.some((c) => c.startsWith("## Optional"))) {
    const sitemapUrl = `${originBase(opts.origin)}/sitemap.xml`;
    chunks.push(
      `## Optional\n- [XML sitemap](${sitemapUrl}): Machine-readable full URL inventory (not a substitute for this curated index)`,
    );
  }

  return chunks.join("\n\n");
}

function ensureHome(pages: LlmsTemplatePage[], origin: string): LlmsTemplatePage[] {
  const ok = okPages(pages);
  if (ok.length > 0) return ok;
  return [{ url: `${originBase(origin)}/`, pageType: "home", fetchStatus: "ok" }];
}

/** Primary `/llms.txt` — curated v2 index (fits agent context). */
export function buildLlmsTxt(input: LlmsTemplateInput): string {
  const origin = originBase(input.origin);
  const pages = ensureHome(input.pages, origin);
  const summary =
    input.biz.description?.trim() ||
    `${input.biz.name} — official website at ${origin}/.`;

  // Primary sections only in the short file; Optional for secondary page types.
  const primary = pages.filter((p) => sectionFor(p.pageType) !== "optional");
  const optional = pages.filter((p) => sectionFor(p.pageType) === "optional");
  const shortPrimary = primary.slice(0, 12);
  const shortOptional = optional.slice(0, 6);
  const shortPages = [...shortPrimary, ...shortOptional];

  const sections = buildSections(shortPages, {
    includeOptional: true,
    maxPerPrimary: 6,
    origin,
  });

  return `# ${input.biz.name}

> ${summary}

${buildDetailProse(input)}

${sections}
`;
}

/** `/llms-full.txt` — same v2 shape with fuller annotated coverage. */
export function buildLlmsFullTxt(input: LlmsTemplateInput): string {
  const origin = originBase(input.origin);
  const pages = ensureHome(input.pages, origin);
  const summary =
    input.biz.description?.trim() ||
    `${input.biz.name} — official website at ${origin}/.`;

  const sections = buildSections(pages, { includeOptional: true, origin });
  const extendedNote =
    "This is llms-full.txt: the extended annotated index. Prefer llms.txt when context is tight; use this file when you need broader coverage of secondary pages.";

  return `# ${input.biz.name}

> ${summary}

${buildDetailProse(input)}

${extendedNote}

${sections}
`;
}
