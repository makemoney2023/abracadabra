import { extractPageFacts } from "@/lib/facts/extract-page-facts";
import type { PageFacts } from "@/lib/facts/types";
import { emptyPageFacts } from "@/lib/facts/types";
import type { DetectedPage } from "@/lib/types";

export type AttachFactsInput = {
  markdownByUrl?: Map<string, string>;
  htmlByUrl?: Map<string, string>;
  jsonLdBlocksByUrl?: Map<string, unknown[]>;
};

/** Attach PageFacts onto each page's evidence field (pure). */
export function attachFactsToPages(
  pages: DetectedPage[],
  input: AttachFactsInput = {},
): DetectedPage[] {
  const markdownByUrl = input.markdownByUrl ?? new Map();
  const htmlByUrl = input.htmlByUrl ?? new Map();
  const jsonLdBlocksByUrl = input.jsonLdBlocksByUrl ?? new Map();

  return pages.map((page) => {
    if (page.fetchStatus !== "ok") {
      return { ...page, evidence: emptyPageFacts() };
    }
    const facts = extractPageFacts({
      markdown: markdownByUrl.get(page.url) ?? page.rawContent ?? "",
      html: htmlByUrl.get(page.url),
      jsonLdBlocks: jsonLdBlocksByUrl.get(page.url) ?? [],
    });
    // Prefer detector schema types when facts found none
    if (facts.existingTypes.length === 0 && page.schemaTypes.length > 0) {
      facts.existingTypes = [...page.schemaTypes].sort();
    }
    return { ...page, evidence: facts };
  });
}

export function pageEvidenceOrEmpty(page: {
  evidence?: PageFacts | Record<string, unknown>;
}): PageFacts {
  const e = page.evidence;
  if (!e || typeof e !== "object") return emptyPageFacts();
  const facts = e as PageFacts;
  return {
    ...emptyPageFacts(),
    ...facts,
    emails: Array.isArray(facts.emails) ? facts.emails : [],
    phones: Array.isArray(facts.phones) ? facts.phones : [],
    sameAs: Array.isArray(facts.sameAs) ? facts.sameAs : [],
    faqPairs: Array.isArray(facts.faqPairs) ? facts.faqPairs : [],
    reviews: Array.isArray(facts.reviews) ? facts.reviews : [],
    howtoSteps: Array.isArray(facts.howtoSteps) ? facts.howtoSteps : [],
    existingTypes: Array.isArray(facts.existingTypes) ? facts.existingTypes : [],
    existingBlocks: Array.isArray(facts.existingBlocks) ? facts.existingBlocks : [],
    hasSiteSearch: Boolean(facts.hasSiteSearch),
  };
}
