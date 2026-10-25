/**
 * Plain-language meaning of Google's page indexing (coverage) reasons, for clients and staff.
 * tone: expected (nothing to do), watch (keep an eye on it), fix (worth a card).
 */
export type CoverageTone = "expected" | "watch" | "fix";
export type CoverageReason = { tone: CoverageTone; text: string };

const REASONS: Record<string, CoverageReason> = {
  "submitted and indexed": { tone: "expected", text: "In Google. Nothing to do." },
  "indexed, not submitted in sitemap": { tone: "watch", text: "In Google, but missing from the sitemap. Add it so Google keeps finding it." },
  "page with redirect": { tone: "expected", text: "Usually expected. This old address forwards to the right page." },
  "alternate page with proper canonical tag": { tone: "expected", text: "Expected. Google uses the main version of this page." },
  "excluded by 'noindex' tag": {
    tone: "watch",
    text: "We told Google to skip this page. Expected for private or thank-you pages; a problem if it should rank.",
  },
  "duplicate without user-selected canonical": { tone: "watch", text: "Google sees this as a copy of another page and picked one itself." },
  "duplicate, google chose different canonical than user": {
    tone: "watch",
    text: "Google sees this as a copy and chose a different main page than we asked for.",
  },
  "crawled - currently not indexed": {
    tone: "fix",
    text: "Google read it but chose not to list it yet. Usually a content quality or uniqueness signal.",
  },
  "discovered - currently not indexed": {
    tone: "watch",
    text: "Google knows the page but hasn't read it yet. Common for new pages; a problem if it lasts weeks.",
  },
  "not found (404)": { tone: "fix", text: "The page is missing. Fix it or redirect it." },
  "soft 404": { tone: "fix", text: "The page looks empty or missing to Google. Add real content or redirect it." },
  "blocked by robots.txt": { tone: "fix", text: "Our robots.txt stops Google reading this page." },
  "server error (5xx)": { tone: "fix", text: "The site returned an error when Google visited." },
  "redirect error": { tone: "fix", text: "The redirect is broken or loops, so Google gave up." },
  "blocked due to unauthorized request (401)": { tone: "watch", text: "The page needs a login. Expected for private pages." },
  "blocked due to access forbidden (403)": { tone: "fix", text: "The site refused Google's visit." },
  "url is unknown to google": { tone: "watch", text: "Google hasn't found this page. Check the sitemap and internal links." },
};

const FALLBACK: CoverageReason = { tone: "watch", text: "Google reported a status we don't have a plain explanation for yet." };

export function explainCoverage(state: string | null | undefined): CoverageReason {
  const key = (state ?? "").trim().toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ");
  if (!key) return FALLBACK;
  return REASONS[key] ?? FALLBACK;
}
