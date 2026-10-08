export const BRIEF_SECTIONS = [
  "Client and goal",
  "Audience",
  "Current state",
  "Scope",
  "Supplied material",
  "Gaps",
  "Acceptance checks",
  "Sources",
  "Skills",
] as const;

export const DESIGN_SECTIONS = [
  "Palette",
  "Type",
  "Spacing and radius",
  "Logo",
  "Voice and tone",
  "Components",
  "Accessibility",
] as const;

export const FILE_QUESTIONS = [
  { id: "sells", query: "what the client sells", blocking: true },
  { id: "buyers", query: "who buys", blocking: true },
  { id: "asked", query: "what they asked for", blocking: true },
  { id: "existing", query: "what the client already has site brand content", blocking: false },
  { id: "deadlines", query: "deadlines or launch dates", blocking: false },
  { id: "constraints", query: "constraints tone legal platforms", blocking: false },
] as const;

const DESIGN_QUERIES = ["colors", "fonts", "logo usage", "voice"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const KIND_TERMS: Record<PieceKind, string[]> = {
  website: ["website", "websites", "landing", "frontend", "homepage", "copywriting", "competitor", "page"],
  social_pack: ["social", "linkedin", "instagram", "tiktok", "calendar"],
  document: ["document", "copywriting", "report", "writing"],
  other: ["copywriting", "research"],
};

export type PieceKind = "website" | "social_pack" | "document" | "other";

export type SkillCard = { name: string; description: string; path: string };

export type ChosenSkill = { name: string; path: string; mode: "plan" | "complete" };

export type ToolCaller = (name: string, args: Record<string, unknown>) => Promise<unknown>;

type FileRow = {
  status?: string;
  summary?: string | null;
  relativePath?: string;
  tag?: string | null;
};

type Piece = { kind: PieceKind; outcome: string };

type PagePicture = { text: string; colors: string[]; fonts: string[] };

type DraftCache = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiresAt: number): Promise<void>;
};

export function parseSkillFrontMatter(raw: string): { name: string; description: string } | null {
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = raw.slice(4, end);
  const name = block.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
  if (!name) return null;
  return { name, description: readDescription(block) };
}

export function parseSkillCatalog(raw: string): SkillCard[] {
  try {
    const parsed = JSON.parse(raw) as { skills?: unknown[] } | unknown[];
    const list = Array.isArray(parsed) ? parsed : parsed.skills;
    if (!Array.isArray(list)) return [];
    return list.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as { name?: unknown; description?: unknown; path?: unknown };
      if (typeof row.name !== "string" || !row.name) return [];
      return [
        {
          name: row.name,
          description: typeof row.description === "string" ? row.description : "",
          path: typeof row.path === "string" ? row.path : "",
        },
      ];
    });
  } catch {
    return [];
  }
}

/** Picks a short ordered set from the catalog. A skill has to match the piece, not just sit in the library. */
export function chooseSkillsForPiece(piece: { kind: PieceKind; outcome: string }, catalog: SkillCard[]): ChosenSkill[] {
  const terms = KIND_TERMS[piece.kind];
  return catalog
    .map((skill) => ({ skill, score: scoreSkill(skill, terms) }))
    .filter((row) => row.score >= 4)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
    .slice(0, 4)
    .map((row): ChosenSkill => ({
      name: row.skill.name,
      path: row.skill.path,
      mode: planMode(row.skill.name) ? "plan" : "complete",
    }))
    .sort((a, b) => skillRole(a) - skillRole(b) || a.name.localeCompare(b.name));
}

export function isPublicWebsite(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (host === "0.0.0.0" || host === "::1" || host.includes(":")) return false;
    if (host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("169.254.")) {
      return false;
    }
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export function pageTokens(html: string): PagePicture {
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join(" ");
  const links = [...html.matchAll(/<link[^>]*>/gi)].map((match) => match[0]).join(" ");
  const source = `${styles} ${links}`;
  const colors = [
    ...new Set([...source.matchAll(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)].map((match) => match[0].toLowerCase())),
  ];
  const fonts: string[] = [];
  for (const match of source.matchAll(/font-family:\s*([^;}{]+)/gi)) {
    const family = match[1]?.split(",")[0]?.replace(/['"]/g, "").trim();
    if (family && !fonts.includes(family)) fonts.push(family);
  }
  for (const match of source.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"'&\s]+)/gi)) {
    const family = decodeURIComponent(match[1] ?? "").split(":")[0]?.replace(/\+/g, " ").trim();
    if (family && !fonts.includes(family)) fonts.push(family);
  }
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
  return { text, colors, fonts };
}

export function unwrapToolResult(result: unknown): unknown {
  if (typeof result === "string") {
    try {
      return JSON.parse(result) as unknown;
    } catch {
      return result;
    }
  }
  if (result && typeof result === "object" && "content" in result) {
    const content = (result as { content?: { text?: string }[] }).content;
    const text = content?.[0]?.text;
    if (typeof text === "string") {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    }
  }
  return result;
}

export async function draftClientDocuments(input: {
  call: ToolCaller;
  reason: string;
  requestId: string;
  now: number;
  catalog: SkillCard[];
  fetchPage?: (url: string) => Promise<{ ok: boolean; text: string }>;
  cache?: DraftCache;
}): Promise<{ outcome: "paused" | "drafted" | "asked" }> {
  const writeBrief = input.reason === "onboard" || input.reason === "context_changed";
  const picture = (await input.call("client_context", {})) as ClientPicture;
  if (picture.organization?.agentPausedAt != null) return { outcome: "paused" };
  const hasBrief = (picture.briefs ?? []).some((brief) => brief.kind === "brief");
  const writeDesign = input.reason === "brief_approved" || (input.reason === "context_changed" && hasBrief);
  if (!writeBrief && !writeDesign) return { outcome: "drafted" };

  const workspaces = (picture.workspaces ?? []).filter((space) => typeof space.id === "string" && space.id);
  const files = await filesFor(input.call, workspaces);
  const answers = await searchAll(input.call, workspaces, FILE_QUESTIONS.map((question) => question.query));
  const pieces = piecesFrom(answers.get("what they asked for") ?? []);
  const ready = files.filter((file) => file.status === "ready" && file.relativePath);
  const blockedFiles = files.filter((file) => (file.status === "failed" || file.status === "waiting") && file.relativePath);
  const questions = blockingQuestions(answers, blockedFiles, picture.project?.id);
  let deliverableId = "";

  if (writeBrief) {
    const saved = (await input.call("save_brief", {
      kind: "brief",
      title: `${picture.organization?.name ?? "Client"} brief`.slice(0, 200),
      bodyMarkdown: briefMarkdown(picture, pieces, ready, blockedFiles, answers, input.catalog),
      sourcesJson: ready.map((file) => ({
        path: file.relativePath,
        tag: file.tag ?? "",
        summary: file.summary ?? "",
      })),
      requestId: `${input.requestId}:brief`,
    })) as { deliverableId?: string };
    if (typeof saved?.deliverableId === "string") deliverableId = saved.deliverableId;
  }

  if (writeDesign) {
    const brand = await brandFiles(input.call, workspaces);
    const designAnswers = await searchAll(input.call, workspaces, [...DESIGN_QUERIES]);
    const site = await loadWebsite(picture.organization?.website ?? null, input);
    const saved = (await input.call("save_brief", {
      kind: "design_system",
      title: `${picture.organization?.name ?? "Client"} design system`.slice(0, 200),
      bodyMarkdown: designMarkdown(picture, pieces, brand, designAnswers, site, input.catalog),
      sourcesJson: brand.map((file) => ({
        path: file.relativePath,
        tag: file.tag ?? "brand",
        summary: file.summary ?? "",
      })),
      requestId: `${input.requestId}:design`,
    })) as { deliverableId?: string };
    if (!deliverableId && typeof saved?.deliverableId === "string") deliverableId = saved.deliverableId;
  }

  if (writeBrief && input.catalog.length === 0) {
    await input.call("add_note", {
      body: "No skill list was loaded, so the brief does not name skills for Cursor.",
      deliverableId: deliverableId || undefined,
      requestId: `${input.requestId}:note:skills`,
    });
  }
  if (writeBrief && !nearestSkill(input.catalog, "brief-writing")) {
    await input.call("add_note", {
      body: "No brief-writing skill is in the index. The brief used the built-in sections.",
      deliverableId: deliverableId || undefined,
      requestId: `${input.requestId}:note:brief-skill`,
    });
  }
  if (writeDesign && !nearestSkill(input.catalog, "design-system")) {
    await input.call("add_note", {
      body: "No design-system skill is in the index. The design system used the built-in sections.",
      deliverableId: deliverableId || undefined,
      requestId: `${input.requestId}:note:design-skill`,
    });
  }

  if (questions.length > 0) {
    for (const [index, question] of questions.entries()) {
      await input.call("ask_staff", {
        question,
        deliverableId: deliverableId || undefined,
        requestId: `${input.requestId}:ask:${index}`,
      });
    }
    return { outcome: "asked" };
  }

  const projectId = picture.project?.id;
  if (projectId) {
    const subject = writeBrief && writeDesign ? "brief and the design system are" : writeDesign ? "design system is" : "brief is";
    await input.call("post_status_update", {
      projectId,
      health: "on_track",
      audience: "internal",
      body: `The ${subject} drafted and waiting for approval.`,
      requestId: `${input.requestId}:status`,
    });
  }
  return { outcome: "drafted" };
}

type ClientPicture = {
  organization?: {
    name?: string;
    website?: string | null;
    industry?: string | null;
    notes?: string | null;
    rules?: string[];
    agentPausedAt?: number | null;
  };
  assessment?: { answerSummary?: string | null } | null;
  project?: { id?: string; name?: string } | null;
  workspaces?: { id?: string; logoObjectKey?: string | null }[];
  briefs?: { kind?: string }[];
};

function readDescription(block: string): string {
  const lines = block.split("\n");
  const start = lines.findIndex((line) => line.startsWith("description:"));
  if (start === -1) return "";
  const first = lines[start]?.slice("description:".length).trim() ?? "";
  if (first === ">" || first === ">-" || first === ">+" || first === "|" || first === "|-" || first === "|+") {
    const parts: string[] = [];
    for (const line of lines.slice(start + 1)) {
      if (line && !/^\s/.test(line)) break;
      parts.push(line.trim());
    }
    return parts.join(" ").trim();
  }
  if ((first.startsWith('"') && first.endsWith('"')) || (first.startsWith("'") && first.endsWith("'"))) {
    return first.slice(1, -1);
  }
  return first;
}

function scoreSkill(skill: SkillCard, terms: string[]): number {
  const name = skill.name.toLowerCase();
  const hay = `${name} ${skill.description}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (name === term || name.includes(term)) score += 8;
    else if (hay.includes(term)) score += 1;
  }
  return score;
}

function planMode(name: string): boolean {
  return name === "frontend-design" || name === "landing-page-design" || name.includes("frontend");
}

function skillRole(skill: ChosenSkill): number {
  if (skill.name.includes("competitor") || skill.name.includes("research")) return 0;
  if (skill.mode === "complete") return 1;
  return 2;
}

function nearestSkill(catalog: SkillCard[], name: string): SkillCard | null {
  return catalog.find((skill) => skill.name === name) ?? catalog.find((skill) => skill.name.includes(name)) ?? null;
}

function skillPath(skill: { path: string }): string {
  if (!skill.path) return "";
  return skill.path.startsWith(".cursor/skills/") ? skill.path : `.cursor/skills/${skill.path}`;
}

async function filesFor(call: ToolCaller, workspaces: { id?: string }[]): Promise<FileRow[]> {
  const rows: FileRow[] = [];
  for (const space of workspaces) {
    rows.push(...filesOf(await call("list_files", { workspaceId: space.id })));
  }
  return rows;
}

async function brandFiles(call: ToolCaller, workspaces: { id?: string }[]): Promise<FileRow[]> {
  const rows: FileRow[] = [];
  for (const space of workspaces) {
    rows.push(...filesOf(await call("list_files", { workspaceId: space.id, tag: "brand" })));
  }
  return rows.filter((file) => file.status === "ready" && file.relativePath);
}

async function searchAll(call: ToolCaller, workspaces: { id?: string }[], queries: string[]): Promise<Map<string, string[]>> {
  const answers = new Map<string, string[]>();
  for (const query of queries) {
    const passages: string[] = [];
    for (const space of workspaces) {
      passages.push(...passagesOf(await call("search_files", { workspaceId: space.id, query })));
    }
    answers.set(query, passages);
  }
  return answers;
}

function filesOf(value: unknown): FileRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is FileRow => Boolean(row) && typeof row === "object");
}

function passagesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((hit) => {
    if (!hit || typeof hit !== "object") return [];
    const passage = (hit as { passage?: unknown }).passage;
    return typeof passage === "string" && passage.trim() ? [passage.trim()] : [];
  });
}

function piecesFrom(asked: string[]): Piece[] {
  const text = asked.join(" ").toLowerCase();
  const pieces: Piece[] = [];
  if (/\b(social|instagram|tiktok|linkedin)\b/.test(text)) {
    pieces.push({ kind: "social_pack", outcome: "Social posts the client can publish." });
  }
  if (/\b(website|site|landing)\b/.test(text)) {
    pieces.push({ kind: "website", outcome: "A website the client can send to buyers." });
  }
  if (/\b(document|proposal|pdf)\b/.test(text)) {
    pieces.push({ kind: "document", outcome: "A document the client can share." });
  }
  if (pieces.length === 0) pieces.push({ kind: "other", outcome: "The piece the client asked for." });
  return pieces;
}

function blockingQuestions(answers: Map<string, string[]>, blockedFiles: FileRow[], projectId: string | undefined): string[] {
  const questions: string[] = [];
  for (const file of blockedFiles) {
    questions.push(`The file ${file.relativePath} is ${file.status}. What should we use instead?`);
  }
  for (const question of FILE_QUESTIONS) {
    if (!question.blocking) continue;
    const hits = answers.get(question.query) ?? [];
    if (hits.length > 0) continue;
    if (question.id === "buyers") questions.push("The files do not say who buys. Who buys from this client?");
    else if (question.id === "sells") questions.push("The files do not say what the client sells. What do they sell?");
    else questions.push("The files do not say what they asked for. What should this work produce?");
  }
  if (!projectId) questions.push("This client has no project. Name a project so the brief can be tracked.");
  return questions;
}

function briefMarkdown(
  picture: ClientPicture,
  pieces: Piece[],
  ready: FileRow[],
  blockedFiles: FileRow[],
  answers: Map<string, string[]>,
  catalog: SkillCard[],
): string {
  const name = picture.organization?.name ?? "This client";
  const sells = (answers.get("what the client sells") ?? []).join(" ") || "The files do not say what they sell.";
  const buyers = (answers.get("who buys") ?? []).join(" ") || "The files do not say who buys.";
  const existing = (answers.get("what the client already has site brand content") ?? []).join(" ");
  const deadlines = (answers.get("deadlines or launch dates") ?? []).join(" ");
  const constraints = (answers.get("constraints tone legal platforms") ?? []).join(" ");
  const lines = [
    `# ${name} brief`,
    "",
    "## Client and goal",
    `${name} ${sells} ${picture.organization?.notes ?? ""}`.replace(/\s+/g, " ").trim(),
    "",
    "## Audience",
    buyers,
    "",
    "## Current state",
    [existing, picture.organization?.website ? `Website: ${picture.organization.website}.` : "", picture.organization?.industry ?? ""]
      .filter(Boolean)
      .join(" ") || "No current state was found in the files.",
    "",
    "## Scope",
    ...pieces.map((piece) => `- ${piece.kind} — ${piece.outcome}`),
    "",
    "## Supplied material",
    ...(ready.length ? ready.map((file) => `- ${file.relativePath} (${file.tag ?? "untagged"})`) : ["- No ready files."]),
    "",
    "## Gaps",
    ...(blockedFiles.length ? blockedFiles.map((file) => `- ${file.relativePath} is ${file.status}.`) : []),
    ...(deadlines ? [] : ["- No deadline was found."]),
    ...(constraints ? [] : ["- No tone, legal, or platform constraint was found."]),
    ...(buyers.startsWith("The files do not") ? ["- Who buys is still unknown."] : []),
    "",
    ...(picture.organization?.rules?.length
      ? ["## Rules", ...picture.organization.rules.map((rule) => `- ${rule}`), "Keep every rule above.", ""]
      : []),
    "## Acceptance checks",
    ...pieces.map((piece) => `- ${piece.kind}: the result matches "${piece.outcome}" and follows the named skills.`),
    "",
    "## Sources",
    ...(ready.length ? ready.map((file) => `- ${file.relativePath}`) : ["- No file path."]),
    `- Assessment: ${picture.assessment?.answerSummary ?? "No assessment summary."}`,
    `- Website: ${picture.organization?.website ?? "None listed."}`,
    "",
    "## Skills",
    "Cursor reads these files from `.cursor/skills` and follows them for each piece.",
    ...skillLines(pieces, catalog),
  ];
  return lines.join("\n");
}

function skillLines(pieces: Piece[], catalog: SkillCard[]): string[] {
  if (catalog.length === 0) return ["", "No skill index was loaded, so no skills were chosen."];
  const lines: string[] = [];
  for (const piece of pieces) {
    lines.push("", `### ${piece.kind}`, piece.outcome);
    const chosen = chooseSkillsForPiece(piece, catalog);
    if (chosen.length === 0) {
      lines.push("- No matching skill was in the index.");
      continue;
    }
    for (const skill of chosen) {
      const cited = skillPath(skill);
      if (cited) lines.push(`- \`${cited}\` (${skill.mode})`);
    }
  }
  return lines;
}

function designMarkdown(
  picture: ClientPicture,
  pieces: Piece[],
  brand: FileRow[],
  answers: Map<string, string[]>,
  site: { ok: boolean; note: string; tokens: PagePicture },
  catalog: SkillCard[],
): string {
  const proposed = brand.length === 0;
  const colors = site.tokens.colors;
  const fonts = site.tokens.fonts;
  const voice = (answers.get("voice") ?? []).join(" ");
  const skill = nearestSkill(catalog, "design-system");
  const cited = skill ? skillPath(skill) : "";
  const logoKey = (picture.workspaces ?? []).map((space) => space.logoObjectKey).find((key) => key) ?? "";
  return [
    `# ${picture.organization?.name ?? "Client"} design system`,
    cited ? `Skill: \`${cited}\`` : "No design-system skill was in the index. These sections are the built-in fallback.",
    "",
    "## Palette",
    ...(colors.length ? colors.map((color) => `- ${color} — taken from the website.`) : ["- No color was found on the website."]),
    ...(proposed ? ["- Extra palette stops are proposed until a brand file supplies them."] : []),
    "",
    "## Type",
    ...(fonts.length ? fonts.map((font) => `- ${font} — from the website.`) : ["- No font was found on the website."]),
    proposed ? "- The type scale is proposed. No brand file set one." : "- Use the scale in the brand files.",
    "",
    "## Spacing and radius",
    proposed ? "- Spacing and radius are proposed. No brand file set them." : "- Use the spacing in the brand files.",
    "",
    "## Logo",
    logoKey ? `- Logo file: ${logoKey}.` : "- No logo key is stored.",
    brand.length ? brand.map((file) => `- ${file.relativePath}`).join("\n") : "- No ready brand file.",
    "",
    "## Voice and tone",
    voice || (proposed ? "Voice is proposed until a brand file describes it." : "Use the voice in the brand files."),
    "- We ship work you can send.",
    "- We say what the piece is for.",
    "- We keep the client's words.",
    "",
    "## Components",
    ...pieces.map((piece) => `- ${piece.kind}: the pieces named in the brief.`),
    "",
    "## Accessibility",
    "- Text and background need contrast a reader can see.",
    "- Buttons name the action.",
    site.note,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function loadWebsite(
  website: string | null,
  input: { now: number; fetchPage?: (url: string) => Promise<{ ok: boolean; text: string }>; cache?: DraftCache },
): Promise<{ ok: boolean; note: string; tokens: PagePicture }> {
  const empty = { text: "", colors: [], fonts: [] };
  if (!website || !isPublicWebsite(website)) {
    return { ok: false, note: "- No public website was available.", tokens: empty };
  }
  const key = `website:${website}`;
  const cached = await input.cache?.get(key);
  if (cached) {
    try {
      const tokens = JSON.parse(cached) as PagePicture;
      return { ok: true, note: "- Website colors and fonts came from the cached home page.", tokens };
    } catch {
      // A broken cache row falls through to a fresh fetch.
    }
  }
  if (!input.fetchPage) return { ok: false, note: "- The website was not fetched.", tokens: empty };
  const page = await input.fetchPage(website);
  if (!page.ok) return { ok: false, note: "- The website could not be read. This design system uses files only.", tokens: empty };
  const tokens = pageTokens(page.text);
  await input.cache?.set(key, JSON.stringify(tokens), input.now + DAY_MS);
  return { ok: true, note: "- Website colors and fonts came from the home page.", tokens };
}
