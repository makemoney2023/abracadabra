/**
 * "Suggested for <client>" packs in the Agents page grant drawer. Pure and cheap: keyword rules on the client's
 * name, domain, website, industry, and notes, plus a word match against pack descriptions. Nothing is granted here;
 * staff tick the suggestions and press Grant.
 */

export type SuggestClient = {
  id: string;
  name: string;
  domain?: string | null;
  website?: string | null;
  industry?: string | null;
  notes?: string | null;
};

export type SuggestPack = { prefix: string; name: string; description: string; count: number };

export type PackSuggestion = { prefix: string; reason: string };

type Rule = { label: string; words: RegExp; packs: string[] };

const MARKETING_BASE = ["community/marketingskills/", "community/notfair-seo/", "user/natural-human-voice/"];

const RULES: Rule[] = [
  {
    label: "health clinic",
    words: /\b(dental|dentist|implants?|clinic|orthodont|medical|health|chiro|physio|spa)\b/,
    packs: [...MARKETING_BASE, "community/advertising-skills/", "integrations/google-ads/", "integrations/google-search-console/", "integrations/google-analytics/"],
  },
  {
    label: "construction",
    words: /\b(construction|contractor|insulation|foam|framing|drywall|stucco|homes?|builders?|renovat\w*|fit-?outs?|assembly|roofing)\b/,
    packs: [...MARKETING_BASE, "community/ui-ux-pro-max-skill/", "integrations/google-search-console/", "community/text-to-cad/"],
  },
  {
    label: "software build",
    words: /\b(erp|crm|software|saas|app|apps|portal|platform|dashboard)\b/,
    packs: ["plugins/superpowers/", "integrations/github/", "integrations/shadcn-ui/", "community/ui-ux-pro-max-skill/", "community/business-analysis-skills/"],
  },
  {
    label: "holding company",
    words: /\b(holdings?|group|capital|invest\w*|finance|accounting)\b/,
    packs: ["community/awesome-claude-corporate-skills/", "community/business-analysis-skills/"],
  },
  {
    label: "agency and media",
    words: /\b(agency|marketing|media|social|ai|automation|abracadabra|content|video|brand)\b/,
    packs: [...MARKETING_BASE, "community/advertising-skills/", "community/remotion/", "community/openmontage/", "community/inference-sh/", "integrations/pagespeed-insights/"],
  },
];

const STOP = new Set(["inc", "ltd", "llc", "corp", "the", "and", "com", "www", "https", "http", "co", "ca", "app", "for", "with"]);

/** A domain or URL without scheme, www, path, or TLD: "https://www.renewimplants.ca/" → "renewimplants". */
function hostWords(raw: string | null | undefined): string {
  if (!raw) return "";
  const host = raw.toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] ?? "";
  const labels = host.split(".").filter(Boolean);
  return (labels.length > 1 ? labels.slice(0, -1) : labels).join(" ");
}

function clientText(client: SuggestClient): string {
  return [client.name, hostWords(client.domain), hostWords(client.website), client.industry, client.notes]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .toLowerCase()
    .replace(/[._/:-]+/g, " ");
}

/** Up to `limit` packs for one client, best first, each with a short reason. Only packs in the library are named. */
export function suggestPacksForClient(client: SuggestClient, packs: SuggestPack[], limit = 6, exclude: string[] = []): PackSuggestion[] {
  const library = new Map(packs.map((pack) => [pack.prefix, pack]));
  const skip = new Set(exclude);
  const text = clientText(client);
  const scores = new Map<string, { score: number; reason: string }>();
  const add = (prefix: string, score: number, reason: string) => {
    if (!library.has(prefix) || skip.has(prefix)) return;
    const current = scores.get(prefix);
    if (current) current.score += score;
    else scores.set(prefix, { score, reason });
  };
  let matchedRule = false;
  for (const rule of RULES) {
    if (!rule.words.test(text)) continue;
    matchedRule = true;
    rule.packs.forEach((prefix, index) => add(prefix, 10 - Math.min(index, 8), `Fits ${rule.label}`));
  }
  if (!matchedRule && (client.website || client.domain)) {
    MARKETING_BASE.forEach((prefix, index) => add(prefix, 6 - index, "Has a website"));
  }
  const words = [...new Set(text.split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !STOP.has(word)))];
  if (words.length) {
    for (const pack of packs) {
      const haystack = `${pack.name} ${pack.description}`.toLowerCase();
      const hits = words.filter((word) => haystack.includes(word));
      if (hits.length) add(pack.prefix, 2 * hits.length, `Mentions ${hits.slice(0, 2).join(", ")}`);
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([prefix, value]) => ({ prefix, reason: value.reason }));
}
