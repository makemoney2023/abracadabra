/**
 * robots.txt rules for one crawler, per RFC 9309: the groups that name our product token (else `*`) apply; the
 * longest matching Allow/Disallow pattern wins and Allow wins a tie; `*` matches any run of characters and `$`
 * anchors the end. Crawl-delay is not in the RFC but is read from the same group.
 * Deep scans use this. The free scan does not change.
 */

export const SCANNER_PRODUCT_TOKEN = "SchemaAEOScanner";
/** A crawl delay longer than this is capped (a 1,000-page scan at 10 s already takes about three hours). */
export const MAX_CRAWL_DELAY_MS = 10_000;

type Rule = { allow: boolean; pattern: string };

export type RobotsRules = {
  /** "ok": rules parsed; "missing": 4xx, allow all; "unreachable": 5xx or network error, disallow all (RFC 9309 §2.3.1.4). */
  status: "ok" | "missing" | "unreachable";
  rules: Rule[];
  /** Crawl-delay for our group, in ms, capped at MAX_CRAWL_DELAY_MS. 0 when none. */
  crawlDelayMs: number;
  /** The site asked for a longer delay than the cap. */
  crawlDelayCapped: boolean;
};

type Group = { agents: string[]; rules: Rule[]; crawlDelay: number | null };

function parseGroups(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue; // rules before any user-agent line belong to no group
    if (key === "allow" || key === "disallow") {
      if (value) current.rules.push({ allow: key === "allow", pattern: value });
      // An empty Disallow allows everything: no rule needed.
    } else if (key === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = Math.max(current.crawlDelay ?? 0, seconds);
    }
  }
  return groups;
}

function agentMatches(agent: string, token: string): boolean {
  const name = agent.split("/")[0]!.trim();
  return name === token.toLowerCase();
}

/** Pick the rules for `token`: every group naming it, else every `*` group, else no rules (allow all). */
export function parseRobotsRules(text: string, token = SCANNER_PRODUCT_TOKEN): RobotsRules {
  const groups = parseGroups(text);
  let chosen = groups.filter((g) => g.agents.some((a) => agentMatches(a, token)));
  if (chosen.length === 0) chosen = groups.filter((g) => g.agents.includes("*"));
  const delays = chosen.map((g) => g.crawlDelay).filter((d): d is number => d !== null);
  const delayMs = delays.length > 0 ? Math.round(Math.max(...delays) * 1000) : 0;
  return {
    status: "ok",
    rules: chosen.flatMap((g) => g.rules),
    crawlDelayMs: Math.min(delayMs, MAX_CRAWL_DELAY_MS),
    crawlDelayCapped: delayMs > MAX_CRAWL_DELAY_MS,
  };
}

/** Rules from the robots.txt fetch result. `error` is the HTTP status (as text) or a network error message. */
export function robotsRulesFromFetch(result: { content?: string; error?: string } | undefined): RobotsRules {
  const none = { rules: [], crawlDelayMs: 0, crawlDelayCapped: false };
  if (!result) return { status: "unreachable", ...none };
  if (result.error) {
    if (/^4\d\d$/.test(result.error)) return { status: "missing", ...none };
    return { status: "unreachable", ...none };
  }
  return parseRobotsRules(result.content ?? "");
}

function normalizePercent(value: string): string {
  // Compare in one encoding: decode what is safe to decode, then re-encode the way URL paths are encoded.
  try {
    return encodeURI(decodeURI(value));
  } catch {
    return value;
  }
}

function patternRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = normalizePercent(anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

const regexCache = new Map<string, RegExp>();

function matches(pattern: string, path: string): boolean {
  let re = regexCache.get(pattern);
  if (!re) {
    re = patternRegex(pattern);
    if (regexCache.size < 2000) regexCache.set(pattern, re);
  }
  return re.test(path);
}

/** Whether `url` may be fetched. /robots.txt itself is always allowed. */
export function isAllowedByRobots(url: string, robots: RobotsRules): boolean {
  if (robots.status === "missing") return true;
  if (robots.status === "unreachable") return false;
  let path: string;
  try {
    const parsed = new URL(url);
    path = normalizePercent(`${parsed.pathname}${parsed.search}`);
  } catch {
    return false;
  }
  if (path === "/robots.txt") return true;
  let best: Rule | null = null;
  for (const rule of robots.rules) {
    if (!matches(rule.pattern, path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}
