/**
 * The summary page an agent filing writes (summaryMarkdown in agent-work-filing.ts), read back for display.
 *
 * Layout written at filing time:
 *   # <title>
 *   - Kind / Agent / Finished / Task / Handed to / Ref   (internal metadata)
 *   ## For the client   (client_summary, optional)
 *   ## Summary / ## Handoff / ## Links / ## Files
 *   ---
 *   <content>
 *
 * Client members see the title, a Delivered date, the short summary, the links, and the content behind
 * "Show details". The metadata block (agent and teammate ids, Task, Ref) and the Files list (the files are
 * already on the page) stay out of the client view. Staff get the metadata in "Details for staff".
 */

export type FilingMetaEntry = { key: string; value: string };

export type FilingSummary = {
  title: string;
  meta: FilingMetaEntry[];
  /** Agent label without parenthesised ids or teammate slugs: "Abracadabra Client". */
  agentName: string | null;
  finishedAt: Date | null;
  clientSummary: string | null;
  summary: string | null;
  handoff: string | null;
  links: { label: string; url: string }[];
  files: string[];
  body: string | null;
};

const META_LINE = /^- ([A-Za-z][A-Za-z ]{0,30}): ?(.*)$/;
const SECTIONS: Record<string, "clientSummary" | "summary" | "handoff" | "links" | "files"> = {
  "for the client": "clientSummary",
  "client summary": "clientSummary",
  summary: "summary",
  handoff: "handoff",
  links: "links",
  files: "files",
};
/** Metadata keys a filing writes. One of Ref or Agent must be there for the text to count as a filing summary. */
const KNOWN_META = new Set(["kind", "agent", "finished", "task", "handed to", "ref"]);

/** "Abracadabra Client (Grok Bot teammate 3cd07aef-…) (abracadabra-client)" -> "Abracadabra Client". */
export function cleanAgentLabel(label: string): string {
  let value = label.trim();
  for (;;) {
    const next = value.replace(/\s*\([^()]*\)\s*$/, "").trim();
    if (next === value) break;
    value = next;
  }
  return value || label.trim();
}

function trimBlock(lines: string[]): string | null {
  const value = lines.join("\n").trim();
  return value ? value : null;
}

/** Reads a filing summary page. Anything else (a brief, social copy, a hand-written page) gives null. */
export function parseFilingSummary(text: string | null | undefined): FilingSummary | null {
  if (!text) return null;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const heading = /^# (.+)$/.exec(lines[0] ?? "");
  if (!heading) return null;
  let index = 1;
  while (index < lines.length && lines[index].trim() === "") index += 1;
  const meta: FilingMetaEntry[] = [];
  while (index < lines.length) {
    const match = META_LINE.exec(lines[index]);
    if (!match) break;
    meta.push({ key: match[1].trim(), value: match[2].trim() });
    index += 1;
  }
  const keys = new Set(meta.map((entry) => entry.key.toLowerCase()));
  if (!keys.has("ref") && !keys.has("agent")) return null;
  if (meta.some((entry) => !KNOWN_META.has(entry.key.toLowerCase()))) return null;

  const blocks: Record<"clientSummary" | "summary" | "handoff" | "links" | "files", string[]> = {
    clientSummary: [], summary: [], handoff: [], links: [], files: [],
  };
  let current: keyof typeof blocks | null = null;
  let body: string | null = null;
  const loose: string[] = [];
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "---") {
      body = trimBlock(lines.slice(index + 1));
      break;
    }
    const section = /^## (.+?)\s*$/.exec(line);
    const name = section ? SECTIONS[section[1].toLowerCase()] : undefined;
    if (name) {
      current = name;
      continue;
    }
    if (current) blocks[current].push(line);
    else loose.push(line);
  }

  const links: FilingSummary["links"] = [];
  for (const line of blocks.links) {
    const link = /^- \[(.*)\]\((\S+)\)\s*$/.exec(line.trim());
    if (link) links.push({ label: link[1].trim() || link[2], url: link[2] });
  }
  const files = blocks.files
    .map((line) => /^- (.+)$/.exec(line.trim())?.[1]?.trim())
    .filter((name): name is string => Boolean(name));
  const value = (key: string) => meta.find((entry) => entry.key.toLowerCase() === key)?.value ?? null;
  const agent = value("agent");
  const finishedRaw = value("finished");
  const finished = finishedRaw ? new Date(finishedRaw) : null;
  const looseText = trimBlock(loose);
  return {
    title: heading[1].trim(),
    meta,
    agentName: agent ? cleanAgentLabel(agent) : null,
    finishedAt: finished && !Number.isNaN(finished.getTime()) ? finished : null,
    clientSummary: trimBlock(blocks.clientSummary),
    summary: trimBlock(blocks.summary),
    handoff: trimBlock(blocks.handoff),
    links,
    files,
    body: [looseText, body].filter(Boolean).join("\n\n") || null,
  };
}

const DELIVERED = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Toronto",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/** "Oct 20, 2026 · 8:48 PM EDT", in Toronto time. Short enough for one line on a phone. */
export function deliveredLabel(at: Date): string {
  const parts = DELIVERED.formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")} ${get("day")}, ${get("year")} · ${get("hour")}:${get("minute")} ${get("dayPeriod")} ${get("timeZoneName")}`.trim();
}

/** The short text a client reads first: the agent's client summary, else its summary. */
export function clientLead(summary: FilingSummary): string | null {
  return summary.clientSummary ?? summary.summary;
}

/** What a client reads behind "Show details": the agent summary (when a client summary was shown first) and the content. Handoff notes are agent-to-agent and stay staff-only. */
export function clientDetails(summary: FilingSummary): string | null {
  const parts: string[] = [];
  if (summary.clientSummary && summary.summary) parts.push(summary.summary);
  if (summary.body) parts.push(summary.body);
  return parts.length ? parts.join("\n\n---\n\n") : null;
}
