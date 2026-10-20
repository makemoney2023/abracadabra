import type { FixOption } from "@/lib/fixes/generate-package";
import { pagePathLabel } from "@/lib/fixes/page-path-label";

/**
 * Plain-language, per-page remediation built from the fix options.
 * Free to show: it says what to add, never the generated file contents.
 */

const TYPE_WORDS: Record<string, string> = {
  Organization: "who you are and how to reach you",
  WebSite: "your site’s name",
  AboutPage: "that this is your about page",
  ContactPage: "that this is your contact page",
  FAQPage: "your questions and answers",
  CollectionPage: "that this page lists your articles",
  Service: "what the service is and who provides it",
  ItemList: "the reviews listed here",
  Review: "each review",
  ReserveAction: "how to book",
  Event: "the event’s name, date, and place",
  JobPosting: "the role and how to apply",
  Menu: "your menu",
  WebPage: "what this page is about",
  BreadcrumbList: "where the page sits on your site",
};

const SITE_WORDS: Record<string, string> = {
  llmsTxt: "Add a short guide at your site root that points AI assistants to your most important pages.",
  llmsFullTxt: "Add a fuller guide with the text of your key pages, so assistants can quote you accurately.",
  sitemapXml: "Publish a complete list of your pages so crawlers find every one.",
  robotsTxt: "Let the major AI crawlers in. Right now some are turned away.",
  faqJsonLd: "Mark up your questions and answers so assistants can lift them word for word.",
};

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function describePageNeeds(willAdd: string[] | undefined): string {
  const words = [...new Set((willAdd ?? []).map((t) => TYPE_WORDS[t] ?? null).filter(Boolean))] as string[];
  if (words.length === 0) return "Add a clear label that tells AI assistants what this page is about.";
  return `Tell AI assistants ${joinWords(words)}.`;
}

export type SiteGuidance = { id: string; text: string };
export type PageGuidance = {
  url: string;
  path: string;
  pageType: string;
  status: "missing" | "partial";
  needs: string;
};

export function buildGuidance(options: FixOption[]): { site: SiteGuidance[]; pages: PageGuidance[] } {
  const site = options
    .filter((o) => o.kind !== "pageSchema" && SITE_WORDS[o.id])
    .map((o) => ({ id: o.id, text: SITE_WORDS[o.id]! }));
  const pages = options
    .filter((o): o is FixOption & { url: string } => o.kind === "pageSchema" && Boolean(o.url))
    .map((o) => ({
      url: o.url,
      path: pagePathLabel(o.url),
      pageType: o.pageType ?? "page",
      status: o.group === "additive" ? ("partial" as const) : ("missing" as const),
      needs: describePageNeeds(o.willAdd),
    }));
  return { site, pages };
}
