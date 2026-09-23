# AEO / GEO Readiness Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone Next.js app that soft-gates a free AEO/GEO readiness scan (Parallel-only fetch, deterministic scoring, ~40 pages) and an ops inbox that prospects via FindAll/enrich, auto-scans, and queues contacts.

**Architecture:** Monolith Next.js App Router + Supabase (Postgres/Auth/RLS) + Inngest jobs. A typed `ParallelClient` is the only web fetch boundary (search/extract/findall/enrich). Detectors + scoring are pure functions tested with fixtures; the orchestrator persists scans/pages/findings and refreshes `ops_queue` for ops-sourced runs. Public API uses opaque scan tokens; ops routes require Supabase Auth + `staff_profiles.role = ops`.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Supabase, Inngest, Parallel HTTP API (`https://api.parallel.ai`), Vitest, Playwright, `@react-pdf/renderer` (or HTML→PDF via `@sparticuz/chromium` if preferred — default here is `@react-pdf/renderer` for serverless simplicity).

**Spec:** [docs/superpowers/specs/2026-08-11-aeo-geo-readiness-scanner-design.md](../specs/2026-08-11-aeo-geo-readiness-scanner-design.md)  
**Intent:** [docs/INTENT.md](../../INTENT.md)

---

## File structure (create as tasks progress)

```
Schema/
├── package.json
├── vitest.config.ts
├── playwright.config.ts
├── .env.example
├── components.json                 # shadcn
├── supabase/
│   └── migrations/
│       └── 20260811000000_init.sql
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                          # public landing + URL form
│   │   ├── scan/[token]/page.tsx             # score preview / unlocked report
│   │   ├── api/
│   │   │   ├── scans/route.ts                # POST create
│   │   │   ├── scans/[token]/route.ts        # GET status/preview/detail
│   │   │   ├── scans/[token]/unlock/route.ts
│   │   │   ├── scans/[token]/pdf/route.ts
│   │   │   ├── scans/[token]/opt-in/route.ts
│   │   │   ├── inngest/route.ts
│   │   │   └── ops/
│   │   │       ├── queue/route.ts
│   │   │       ├── queue/[id]/route.ts
│   │   │       ├── prospect/route.ts
│   │   │       └── rescan/route.ts
│   │   └── ops/
│   │       ├── layout.tsx
│   │       ├── login/page.tsx
│   │       ├── page.tsx                      # inbox
│   │       └── prospect/page.tsx
│   ├── components/
│   │   ├── ui/                               # shadcn
│   │   ├── public/
│   │   │   ├── ScanForm.tsx
│   │   │   ├── ScorePreview.tsx
│   │   │   ├── UnlockForm.tsx
│   │   │   └── PageMatrix.tsx
│   │   └── ops/
│   │       ├── QueueTable.tsx
│   │       ├── LeadSheet.tsx
│   │       └── ProspectForm.tsx
│   ├── inngest/
│   │   ├── client.ts
│   │   └── functions/run-scan.ts
│   ├── lib/
│   │   ├── domain.ts
│   │   ├── types.ts
│   │   ├── supabase/
│   │   │   ├── server.ts
│   │   │   ├── client.ts
│   │   │   └── admin.ts
│   │   ├── parallel/
│   │   │   ├── types.ts
│   │   │   ├── client.ts
│   │   │   └── mock.ts
│   │   ├── detect/
│   │   │   ├── jsonld.ts
│   │   │   ├── robots.ts
│   │   │   ├── llms-txt.ts
│   │   │   └── sitemap.ts
│   │   ├── prioritize-urls.ts
│   │   ├── scoring/
│   │   │   ├── constants.ts
│   │   │   ├── score.ts
│   │   │   └── findings.ts
│   │   ├── scan/
│   │   │   └── orchestrator.ts
│   │   ├── rate-limit.ts
│   │   ├── ops/
│   │   │   ├── priority.ts
│   │   │   ├── outreach.ts
│   │   │   └── prospect.ts
│   │   └── pdf/report.tsx
│   └── fixtures/
│       ├── healthy-home.html
│       ├── empty-home.html
│       ├── blocked-robots.txt
│       ├── sample-llms.txt
│       └── sample-sitemap.xml
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

### Task 1: Scaffold Next.js app + test tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`
- Modify: `.gitignore` (ensure `.env*.local`, `node_modules`, `.next`)

- [ ] **Step 1: Scaffold the app**

```bash
cd /Users/cbsuperpatch/Desktop/Schema
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --yes
```

If create-next-app refuses non-empty dir, scaffold into `/tmp/schema-app` and move `package.json`, `src/`, config files into Schema root (keep existing `docs/` and `.cursor/`).

- [ ] **Step 2: Add dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr inngest zod nanoid @react-pdf/renderer
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom playwright @playwright/test
```

- [ ] **Step 3: Add Vitest config**

Create `vitest.config.ts`:

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 4: Create `.env.example`**

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PARALLEL_API_KEY=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 5: Init shadcn**

```bash
npx shadcn@latest init -y
npx shadcn@latest add button input label card badge progress table tabs sheet dialog form select sidebar sonner separator
```

- [ ] **Step 6: Smoke run**

```bash
npm test
npm run lint
```

Expected: Vitest exits 0 with “no tests” or empty suite OK; lint clean enough to proceed.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts vitest.config.ts playwright.config.ts .env.example components.json src/ .gitignore
git commit -m "$(cat <<'EOF'
chore: scaffold Next.js app with Vitest, Playwright, and shadcn

EOF
)"
```

---

### Task 2: Supabase schema + RLS + typed row helpers

**Files:**
- Create: `supabase/migrations/20260811000000_init.sql`
- Create: `src/lib/types.ts`
- Create: `src/lib/supabase/admin.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`

- [ ] **Step 1: Write migration SQL**

Create `supabase/migrations/20260811000000_init.sql`:

```sql
create extension if not exists "pgcrypto";

create type scan_source as enum ('public', 'ops');
create type scan_status as enum ('queued', 'running', 'complete', 'failed');
create type page_fetch_status as enum ('pending', 'ok', 'failed', 'unknown');
create type finding_severity as enum ('info', 'warn', 'critical');
create type ops_status as enum ('new', 'contacted', 'won', 'skipped');
create type staff_role as enum ('ops');

create table staff_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role staff_role not null default 'ops',
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  domain text not null unique,
  website text,
  industry text,
  source text not null default 'findall',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  name text,
  title text,
  email text,
  phone text,
  confidence numeric,
  created_at timestamptz not null default now()
);

create table scans (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  origin text not null,
  source scan_source not null,
  status scan_status not null default 'queued',
  public_token text not null unique,
  lead_id uuid references leads (id) on delete set null,
  score_total integer,
  score_breakdown jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index scans_domain_created_idx on scans (domain, created_at desc);

create table scan_pages (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references scans (id) on delete cascade,
  url text not null,
  page_type text not null default 'other',
  fetch_status page_fetch_status not null default 'pending',
  has_json_ld boolean not null default false,
  schema_types text[] not null default '{}',
  evidence jsonb not null default '{}'::jsonb
);

create table scan_findings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references scans (id) on delete cascade,
  page_id uuid references scan_pages (id) on delete set null,
  code text not null,
  severity finding_severity not null,
  passed boolean not null,
  message text not null,
  evidence jsonb not null default '{}'::jsonb
);

create table scan_unlocks (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references scans (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (scan_id, email)
);

create table ops_queue (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references leads (id) on delete cascade,
  latest_scan_id uuid references scans (id) on delete set null,
  status ops_status not null default 'new',
  priority_score numeric not null default 0,
  missing_contact boolean not null default false,
  notes text,
  status_changed_at timestamptz not null default now(),
  status_changed_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table ops_status_audit (
  id uuid primary key default gen_random_uuid(),
  ops_queue_id uuid not null references ops_queue (id) on delete cascade,
  from_status ops_status,
  to_status ops_status not null,
  changed_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table staff_profiles enable row level security;
alter table leads enable row level security;
alter table contacts enable row level security;
alter table scans enable row level security;
alter table scan_pages enable row level security;
alter table scan_findings enable row level security;
alter table scan_unlocks enable row level security;
alter table ops_queue enable row level security;
alter table ops_status_audit enable row level security;

create or replace function is_ops() returns boolean
language sql stable as $$
  select exists (
    select 1 from staff_profiles sp
    where sp.user_id = auth.uid() and sp.role = 'ops'
  );
$$;

-- Service role bypasses RLS; anon/authenticated policies:
create policy "ops full leads" on leads for all using (is_ops()) with check (is_ops());
create policy "ops full contacts" on contacts for all using (is_ops()) with check (is_ops());
create policy "ops full scans" on scans for all using (is_ops()) with check (is_ops());
create policy "ops full pages" on scan_pages for all using (is_ops()) with check (is_ops());
create policy "ops full findings" on scan_findings for all using (is_ops()) with check (is_ops());
create policy "ops full unlocks" on scan_unlocks for all using (is_ops()) with check (is_ops());
create policy "ops full queue" on ops_queue for all using (is_ops()) with check (is_ops());
create policy "ops read audit" on ops_status_audit for select using (is_ops());
create policy "ops read self profile" on staff_profiles for select using (auth.uid() = user_id);
```

Note: Public scan create/read/unlock goes through **service-role server routes** validating `public_token` — do not open broad anon insert policies.

- [ ] **Step 2: Add shared TypeScript types**

Create `src/lib/types.ts`:

```ts
export type ScanSource = "public" | "ops";
export type ScanStatus = "queued" | "running" | "complete" | "failed";
export type PageFetchStatus = "pending" | "ok" | "failed" | "unknown";
export type FindingSeverity = "info" | "warn" | "critical";
export type OpsStatus = "new" | "contacted" | "won" | "skipped";

export type ScoreBreakdown = {
  structuredData: number;
  aiDiscoveryFiles: number;
  aiCrawlability: number;
  pageCoverage: number;
  answerReadiness: number;
};

export type FindingCode =
  | "MISSING_LLMS_TXT"
  | "EMPTY_LLMS_TXT"
  | "SITEMAP_MISSING"
  | "SITEMAP_UNPARSEABLE"
  | "ROBOTS_BLOCKS_GPTBOT"
  | "ROBOTS_BLOCKS_AI_BOTS"
  | "NO_JSON_LD_HOME"
  | "NO_ORG_SCHEMA"
  | "LOW_JSON_LD_COVERAGE"
  | "PAGES_FETCH_FAILED"
  | "MISSING_FAQ_SCHEMA";

export type DetectedPage = {
  url: string;
  pageType: string;
  fetchStatus: PageFetchStatus;
  hasJsonLd: boolean;
  schemaTypes: string[];
  rawContent?: string;
};

export type SiteFiles = {
  robotsTxt: string | null;
  sitemapXml: string | null;
  llmsTxt: string | null;
  llmsFullTxt: string | null;
};

export type ScoreResult = {
  scoreTotal: number;
  breakdown: ScoreBreakdown;
  findings: Array<{
    code: FindingCode;
    severity: FindingSeverity;
    passed: boolean;
    message: string;
    pageUrl?: string;
    evidence?: Record<string, unknown>;
  }>;
  priorityFixes: string[];
};
```

- [ ] **Step 3: Supabase admin helper**

Create `src/lib/supabase/admin.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase admin env");
  return createClient(url, key, { auth: { persistSession: false } });
}
```

- [ ] **Step 4: Apply migration locally**

```bash
npx supabase init
npx supabase db reset
```

Expected: migration applies cleanly. If Supabase CLI not logged into a remote project, local Docker is enough for v1.

- [ ] **Step 5: Commit**

```bash
git add supabase/ src/lib/types.ts src/lib/supabase/
git commit -m "$(cat <<'EOF'
feat: add Supabase schema for scans, unlocks, leads, and ops queue

EOF
)"
```

---

### Task 3: Domain normalization (TDD)

**Files:**
- Create: `src/lib/domain.ts`
- Test: `tests/unit/domain.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { normalizeDomain } from "@/lib/domain";

describe("normalizeDomain", () => {
  it("accepts bare domain", () => {
    expect(normalizeDomain("Example.COM")).toEqual({
      domain: "example.com",
      origin: "https://example.com",
    });
  });

  it("strips path and www", () => {
    expect(normalizeDomain("https://www.example.com/about")).toEqual({
      domain: "example.com",
      origin: "https://example.com",
    });
  });

  it("rejects invalid input", () => {
    expect(() => normalizeDomain("not a url")).toThrow(/invalid/i);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- tests/unit/domain.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
export function normalizeDomain(input: string): { domain: string; origin: string } {
  const raw = input.trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("Invalid domain");
  }
  if (!url.hostname.includes(".")) throw new Error("Invalid domain");
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return { domain: host, origin: `https://${host}` };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- tests/unit/domain.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain.ts tests/unit/domain.test.ts
git commit -m "$(cat <<'EOF'
feat: normalize scan domains to canonical origin

EOF
)"
```

---

### Task 4: JSON-LD detector (TDD)

**Files:**
- Create: `src/lib/detect/jsonld.ts`
- Create: `src/fixtures/healthy-home.html`, `src/fixtures/empty-home.html`
- Test: `tests/unit/jsonld.test.ts`

- [ ] **Step 1: Add fixtures**

`src/fixtures/healthy-home.html`:

```html
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Organization","name":"Acme","url":"https://example.com","sameAs":["https://linkedin.com/company/acme"]}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What?","acceptedAnswer":{"@type":"Answer","text":"This."}}]}
</script>
</head><body><h1>Acme</h1></body></html>
```

`src/fixtures/empty-home.html`:

```html
<html><head><title>Empty</title></head><body><p>Hi</p></body></html>
```

- [ ] **Step 2: Failing tests**

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectJsonLd } from "@/lib/detect/jsonld";

const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "src/fixtures", name), "utf8");

describe("detectJsonLd", () => {
  it("extracts types from healthy page", () => {
    const result = detectJsonLd(fixture("healthy-home.html"));
    expect(result.hasJsonLd).toBe(true);
    expect(result.schemaTypes).toEqual(expect.arrayContaining(["Organization", "FAQPage"]));
    expect(result.blocks).toHaveLength(2);
  });

  it("returns empty for page without JSON-LD", () => {
    const result = detectJsonLd(fixture("empty-home.html"));
    expect(result.hasJsonLd).toBe(false);
    expect(result.schemaTypes).toEqual([]);
  });

  it("parses JSON-LD embedded in markdown fences from Parallel extract", () => {
    const md = "Intro\n```html\n<script type=\"application/ld+json\">{\"@type\":\"Product\",\"name\":\"X\"}</script>\n```\n";
    const result = detectJsonLd(md);
    expect(result.schemaTypes).toContain("Product");
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

```bash
npm test -- tests/unit/jsonld.test.ts
```

- [ ] **Step 4: Implement `src/lib/detect/jsonld.ts`**

```ts
export type JsonLdDetection = {
  hasJsonLd: boolean;
  schemaTypes: string[];
  blocks: unknown[];
};

function collectTypes(node: unknown, out: Set<string>) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (typeof t === "string") out.add(t);
  if (Array.isArray(t)) for (const x of t) if (typeof x === "string") out.add(x);
  if (Array.isArray(obj["@graph"])) collectTypes(obj["@graph"], out);
}

export function detectJsonLd(content: string): JsonLdDetection {
  const blocks: unknown[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    try {
      blocks.push(JSON.parse(match[1].trim()));
    } catch {
      // skip invalid JSON-LD blocks
    }
  }
  const types = new Set<string>();
  for (const b of blocks) collectTypes(b, types);
  return {
    hasJsonLd: blocks.length > 0,
    schemaTypes: [...types].sort(),
    blocks,
  };
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
npm test -- tests/unit/jsonld.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/detect/jsonld.ts src/fixtures/ tests/unit/jsonld.test.ts
git commit -m "$(cat <<'EOF'
feat: detect schema.org JSON-LD types from page content

EOF
)"
```

---

### Task 5: robots / llms.txt / sitemap detectors (TDD)

**Files:**
- Create: `src/lib/detect/robots.ts`, `src/lib/detect/llms-txt.ts`, `src/lib/detect/sitemap.ts`
- Create: `src/fixtures/blocked-robots.txt`, `src/fixtures/sample-llms.txt`, `src/fixtures/sample-sitemap.xml`
- Test: `tests/unit/site-files.test.ts`

- [ ] **Step 1: Fixtures**

`blocked-robots.txt`:

```
User-agent: GPTBot
Disallow: /

User-agent: *
Allow: /
```

`sample-llms.txt`:

```
# Acme
> Acme builds widgets

## Docs
- [Home](https://example.com/)
```

`sample-sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
  <url><loc>https://example.com/contact</loc></url>
</urlset>
```

- [ ] **Step 2: Failing tests**

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeRobots } from "@/lib/detect/robots";
import { analyzeLlmsTxt } from "@/lib/detect/llms-txt";
import { parseSitemapUrls } from "@/lib/detect/sitemap";

const fx = (n: string) => readFileSync(path.join(process.cwd(), "src/fixtures", n), "utf8");

describe("site file detectors", () => {
  it("flags GPTBot disallow", () => {
    const r = analyzeRobots(fx("blocked-robots.txt"));
    expect(r.blocksGptBot).toBe(true);
    expect(r.blockedAiBots).toContain("GPTBot");
  });

  it("treats useful llms.txt as present", () => {
    const r = analyzeLlmsTxt(fx("sample-llms.txt"));
    expect(r.present).toBe(true);
    expect(r.useful).toBe(true);
  });

  it("parses sitemap urls", () => {
    const urls = parseSitemapUrls(fx("sample-sitemap.xml"));
    expect(urls).toContain("https://example.com/about");
  });
});
```

- [ ] **Step 3: Implement detectors**

`src/lib/detect/robots.ts`:

```ts
const AI_BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "Applebot-Extended"] as const;

export function analyzeRobots(robotsTxt: string | null) {
  if (!robotsTxt) {
    return { present: false, blocksGptBot: false, blockedAiBots: [] as string[] };
  }
  const blockedAiBots: string[] = [];
  for (const bot of AI_BOTS) {
    const block = new RegExp(
      `User-agent:\\s*${bot}[\\s\\S]*?Disallow:\\s*/\\s*(?:\\n|$)`,
      "i",
    );
    if (block.test(robotsTxt)) blockedAiBots.push(bot);
  }
  return {
    present: true,
    blocksGptBot: blockedAiBots.includes("GPTBot"),
    blockedAiBots,
  };
}
```

`src/lib/detect/llms-txt.ts`:

```ts
export function analyzeLlmsTxt(content: string | null) {
  if (!content || !content.trim()) return { present: false, useful: false };
  const useful = content.includes("http") || content.includes("]");
  return { present: true, useful };
}
```

`src/lib/detect/sitemap.ts`:

```ts
export function parseSitemapUrls(xml: string | null): string[] {
  if (!xml) return [];
  const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
  return [...new Set(locs)];
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- tests/unit/site-files.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/detect/ src/fixtures/ tests/unit/site-files.test.ts
git commit -m "$(cat <<'EOF'
feat: detect robots AI blocks, llms.txt usefulness, and sitemap URLs

EOF
)"
```

---

### Task 6: Scoring engine (TDD)

**Files:**
- Create: `src/lib/scoring/constants.ts`, `src/lib/scoring/score.ts`, `src/lib/scoring/findings.ts`
- Test: `tests/unit/scoring.test.ts`

- [ ] **Step 1: Constants**

```ts
export const PILLAR_WEIGHTS = {
  structuredData: 35,
  aiDiscoveryFiles: 20,
  aiCrawlability: 20,
  pageCoverage: 15,
  answerReadiness: 10,
} as const;

export const MAX_PAGES = 40;
```

- [ ] **Step 2: Failing scoring tests**

```ts
import { describe, expect, it } from "vitest";
import { scoreScan } from "@/lib/scoring/score";
import type { DetectedPage, SiteFiles } from "@/lib/types";

const healthyPages: DetectedPage[] = [
  {
    url: "https://example.com/",
    pageType: "home",
    fetchStatus: "ok",
    hasJsonLd: true,
    schemaTypes: ["Organization", "FAQPage"],
  },
  {
    url: "https://example.com/contact",
    pageType: "contact",
    fetchStatus: "ok",
    hasJsonLd: true,
    schemaTypes: ["LocalBusiness"],
  },
];

const healthyFiles: SiteFiles = {
  robotsTxt: "User-agent: *\nAllow: /\n",
  sitemapXml: "<urlset><url><loc>https://example.com/</loc></url></urlset>",
  llmsTxt: "# Site\n- [Home](https://example.com/)",
  llmsFullTxt: null,
};

describe("scoreScan", () => {
  it("scores healthy site high", () => {
    const result = scoreScan({ pages: healthyPages, siteFiles: healthyFiles });
    expect(result.scoreTotal).toBeGreaterThanOrEqual(75);
    expect(result.findings.some((f) => f.code === "MISSING_LLMS_TXT" && !f.passed)).toBe(false);
  });

  it("penalizes empty site", () => {
    const pages: DetectedPage[] = [
      {
        url: "https://example.com/",
        pageType: "home",
        fetchStatus: "ok",
        hasJsonLd: false,
        schemaTypes: [],
      },
    ];
    const files: SiteFiles = {
      robotsTxt: "User-agent: GPTBot\nDisallow: /\n",
      sitemapXml: null,
      llmsTxt: null,
      llmsFullTxt: null,
    };
    const result = scoreScan({ pages, siteFiles: files });
    expect(result.scoreTotal).toBeLessThan(40);
    expect(result.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(["MISSING_LLMS_TXT", "NO_JSON_LD_HOME", "ROBOTS_BLOCKS_GPTBOT"]),
    );
  });

  it("excludes failed pages from coverage denominator", () => {
    const pages: DetectedPage[] = [
      {
        url: "https://example.com/",
        pageType: "home",
        fetchStatus: "ok",
        hasJsonLd: true,
        schemaTypes: ["Organization"],
      },
      {
        url: "https://example.com/x",
        pageType: "other",
        fetchStatus: "failed",
        hasJsonLd: false,
        schemaTypes: [],
      },
    ];
    const result = scoreScan({ pages, siteFiles: healthyFiles });
    expect(result.findings.some((f) => f.code === "PAGES_FETCH_FAILED")).toBe(true);
    expect(result.breakdown.pageCoverage).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Implement `scoreScan`**

Implement in `src/lib/scoring/score.ts` using weighted pillars:

- structuredData: home has JSON-LD + Org/LocalBusiness + useful types across pages
- aiDiscoveryFiles: llms present/useful + sitemap parseable
- aiCrawlability: robots present and not blocking listed AI bots
- pageCoverage: `%` of `fetchStatus===ok` pages with `hasJsonLd`; critical types home/contact/service
- answerReadiness: FAQPage present or FAQ-like types; Organization sameAs/contact signals from evidence if available

Clamp each pillar 0–weight, sum to `scoreTotal` 0–100. Build findings + top 5 `priorityFixes` strings ordered by severity/impact.

Keep logic pure and table-driven so thresholds live in `constants.ts`.

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- tests/unit/scoring.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring/ tests/unit/scoring.test.ts
git commit -m "$(cat <<'EOF'
feat: add deterministic AEO/GEO readiness scoring engine

EOF
)"
```

---

### Task 7: Parallel client + mock (TDD)

**Files:**
- Create: `src/lib/parallel/types.ts`, `src/lib/parallel/client.ts`, `src/lib/parallel/mock.ts`
- Test: `tests/unit/parallel-client.test.ts`

- [ ] **Step 1: Define interface**

```ts
// src/lib/parallel/types.ts
export type ParallelExtractResult = {
  url: string;
  title?: string;
  content: string;
  error?: string;
};

export type ParallelSearchResult = {
  url: string;
  title?: string;
  excerpt?: string;
};

export type ParallelLead = {
  name?: string;
  domain: string;
  website?: string;
  industry?: string;
  contacts: Array<{
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    confidence?: number;
  }>;
  raw: Record<string, unknown>;
};

export interface ParallelClient {
  extract(urls: string[], opts?: { objective?: string; fullContent?: boolean }): Promise<ParallelExtractResult[]>;
  search(objective: string, opts: { includeDomains: string[]; maxResults?: number }): Promise<ParallelSearchResult[]>;
  findAllAndEnrich(objective: string): Promise<ParallelLead[]>;
}
```

- [ ] **Step 2: Mock client for tests**

```ts
// src/lib/parallel/mock.ts
import type { ParallelClient, ParallelExtractResult, ParallelLead, ParallelSearchResult } from "./types";

export function createMockParallel(handlers: {
  extract?: ParallelClient["extract"];
  search?: ParallelClient["search"];
  findAllAndEnrich?: ParallelClient["findAllAndEnrich"];
}): ParallelClient {
  return {
    extract: handlers.extract ?? (async (urls) => urls.map((url) => ({ url, content: "" }))),
    search: handlers.search ?? (async () => []),
    findAllAndEnrich: handlers.findAllAndEnrich ?? (async () => []),
  };
}
```

- [ ] **Step 3: HTTP client against Parallel API**

Implement `src/lib/parallel/client.ts`:

- Base URL `https://api.parallel.ai`
- Header `x-api-key: process.env.PARALLEL_API_KEY`
- `extract`: `POST /v1beta/extract` with `{ urls, excerpts: true, full_content: true, objective? }`
- `search`: `POST` search endpoint with objective + `include_domains` (verify current path from https://docs.parallel.ai/llms.txt at implement time — prefer `/v1beta/search` or documented successor)
- `findAllAndEnrich`: wrap FindAll ingest/poll + enrich; for v1 may shell via documented FindAll HTTP or a two-step Task API — keep behind this interface
- Retry transient 5xx/429 up to 2 times with exponential backoff (100ms, 400ms)
- Map per-URL errors into `ParallelExtractResult.error` without throwing the whole batch

Add a unit test that mocks `global.fetch` and asserts Authorization header + URL list are sent.

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/unit/parallel-client.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/parallel/ tests/unit/parallel-client.test.ts
git commit -m "$(cat <<'EOF'
feat: add Parallel HTTP client with mockable interface

EOF
)"
```

---

### Task 8: URL prioritizer (TDD)

**Files:**
- Create: `src/lib/prioritize-urls.ts`
- Test: `tests/unit/prioritize-urls.test.ts`

- [ ] **Step 1: Tests**

```ts
import { describe, expect, it } from "vitest";
import { prioritizeUrls } from "@/lib/prioritize-urls";

describe("prioritizeUrls", () => {
  it("always includes home and caps at 40", () => {
    const origin = "https://example.com";
    const many = Array.from({ length: 80 }, (_, i) => `${origin}/p/${i}`);
    const result = prioritizeUrls({
      origin,
      sitemapUrls: [`${origin}/`, `${origin}/about`, `${origin}/contact`, ...many],
      searchUrls: [`${origin}/pricing`, `${origin}/faq`],
    });
    expect(result[0].url).toBe(`${origin}/`);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.some((p) => p.pageType === "about")).toBe(true);
    expect(result.some((p) => p.pageType === "contact")).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

Classify by path keywords: `home` (`/`), `about`, `contact`, `service`/`services`/`products`, `pricing`, `faq`, `blog`, `location`, else `other`. Dedupe, prefer classified pages, fill with sitemap then search, slice to `MAX_PAGES`.

- [ ] **Step 3: Pass + commit**

```bash
npm test -- tests/unit/prioritize-urls.test.ts
git add src/lib/prioritize-urls.ts tests/unit/prioritize-urls.test.ts
git commit -m "$(cat <<'EOF'
feat: prioritize up to 40 scan URLs from sitemap and search

EOF
)"
```

---

### Task 9: Scan orchestrator (integration TDD with mock Parallel)

**Files:**
- Create: `src/lib/scan/orchestrator.ts`
- Test: `tests/integration/orchestrator.test.ts`

- [x] **Step 1: Write integration test with in-memory repository**

Define a narrow `ScanRepository` interface inside orchestrator file (or `src/lib/scan/repository.ts`) with methods: `markRunning`, `savePages`, `saveFindings`, `markComplete`, `markFailed`, `upsertOpsQueue`.

Test uses mock Parallel returning:

- robots allow all
- sitemap with home/about/contact
- search returns pricing
- extracts include healthy-home HTML for `/`

Assert: score ≥ 70, pages persisted, findings array non-empty only for residual gaps, status complete.

- [x] **Step 2: Implement `runScan(scanId, deps)`**

Flow:

1. Load scan row → `markRunning`
2. Extract site files URLs: `${origin}/robots.txt`, `${origin}/sitemap.xml`, `${origin}/llms.txt`, `${origin}/llms-full.txt`
3. `search` with includeDomains `[domain]`
4. Parse sitemap; if sitemap index (`<sitemapindex>`), extract child sitemap locs (cap 5) and extract those too
5. `prioritizeUrls` → batch extract pages (batches of 10) with objective `"Extract all application/ld+json script blocks and main page content"`
6. `detectJsonLd` per page; build `DetectedPage[]`
7. `scoreScan`
8. Persist pages/findings/score; `markComplete`
9. If `source === 'ops'`, `upsertOpsQueue` with priority from `computeOpsPriority(score, hasContact)`
10. On total extract failure of site files + search empty + home failed → `markFailed`

- [x] **Step 3: Run integration test**

```bash
npm test -- tests/integration/orchestrator.test.ts
```

- [x] **Step 4: Commit**

```bash
git add src/lib/scan/ tests/integration/orchestrator.test.ts
git commit -m "$(cat <<'EOF'
feat: orchestrate Parallel map/extract into scored scan results

EOF
)"
```

---

### Task 10: Inngest run-scan function + API create/get

**Files:**
- Create: `src/inngest/client.ts`, `src/inngest/functions/run-scan.ts`, `src/app/api/inngest/route.ts`
- Create: `src/app/api/scans/route.ts`, `src/app/api/scans/[token]/route.ts`
- Create: `src/lib/rate-limit.ts`
- Test: `tests/integration/scans-api.test.ts`

- [x] **Step 1: Inngest client + function**

```ts
// src/inngest/client.ts
import { Inngest } from "inngest";
export const inngest = new Inngest({ id: "schema-aeo" });
```

```ts
// src/inngest/functions/run-scan.ts
// Inngest v4: triggers live on the function config object.
import { inngest } from "../client";
import { createParallelClient } from "@/lib/parallel/client";
import { runScan } from "@/lib/scan/orchestrator";
import { createSupabaseScanRepository } from "@/lib/scan/supabase-repository";

export const runScanFn = inngest.createFunction(
  {
    id: "run-scan",
    retries: 2,
    triggers: [{ event: "scan/requested" }],
  },
  async ({ event, step }) => {
    const { scanId } = event.data as { scanId: string };
    await step.run("orchestrate", async () => {
      await runScan(scanId, {
        parallel: createParallelClient(),
        repo: createSupabaseScanRepository(),
      });
    });
    return { scanId };
  },
);
```

```ts
// src/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { runScanFn } from "@/inngest/functions/run-scan";

export const { GET, POST, PUT } = serve({ client: inngest, functions: [runScanFn] });
```

- [x] **Step 2: Rate limit helper**

`src/lib/rate-limit.ts` — using Supabase count of `scans` for domain where `created_at > now() - 24h`. Throw/return 429 if `count >= 3` for `source=public`.

- [x] **Step 3: POST `/api/scans`**

Validate body with Zod `{ url: string, source?: 'public' }`. Normalize domain, rate-limit, insert scan (`public_token = nanoid(24)`, status queued), send Inngest event `scan/requested`, return `{ token, id, status }`.

- [x] **Step 4: GET `/api/scans/[token]`**

Return always: domain, status, scoreTotal, scoreBreakdown, topGaps (top 3 critical/warn). Soft gate via `selectScanPayload`. Unlock: httpOnly cookie `scan_unlock_${token}=1` only (no query bypass). Ops full detail: `GET /api/ops/scans/[token]` with `requireOpsSession`.

If not unlocked: **omit** `pages` array entirely.

- [x] **Step 5: Integration tests** with mocked Supabase/Inngest or thin handler tests for unlock gating (`selectScanPayload` + rate-limit mocks).

- [x] **Step 6: Commit**

```bash
git add src/inngest/ src/app/api/scans/ src/app/api/inngest/ src/lib/rate-limit.ts tests/integration/scans-api.test.ts
git commit -m "$(cat <<'EOF'
feat: add scan create/status API and Inngest run-scan job

EOF
)"
```

---

### Task 11: Soft-gate unlock + opt-in + PDF

**Files:**
- Create: `src/app/api/scans/[token]/unlock/route.ts`
- Create: `src/app/api/scans/[token]/opt-in/route.ts`
- Create: `src/app/api/scans/[token]/pdf/route.ts`
- Create: `src/lib/pdf/report.tsx`
- Test: `tests/unit/unlock-gate.test.ts`

- [x] **Step 1: Unlock route**

Zod email validation → insert `scan_unlocks` → set httpOnly cookie → return `{ unlocked: true }`.

- [x] **Step 2: Opt-in route**

Body `{ email, name? }` → upsert `leads` by domain, create `ops_queue` status `new` if missing, link `scan.lead_id`.

- [x] **Step 3: PDF route**

Require unlock; render `@react-pdf/renderer` document with score, pillars, page matrix, findings; return `application/pdf`.

- [x] **Step 4: Unit test gate helper**

```ts
import { describe, expect, it } from "vitest";
import { selectScanPayload } from "@/lib/scan/present";

describe("selectScanPayload", () => {
  it("hides pages until unlocked", () => {
    const full = {
      scoreTotal: 55,
      pages: [{ url: "https://x.com" }],
      findings: [{ code: "MISSING_LLMS_TXT", severity: "critical" as const }],
    };
    expect(selectScanPayload(full, false).pages).toBeUndefined();
    expect(selectScanPayload(full, true).pages).toHaveLength(1);
  });
});
```

- [x] **Step 5: Commit**

```bash
git add src/app/api/scans/ src/lib/pdf/ src/lib/scan/present.ts tests/unit/unlock-gate.test.ts
git commit -m "$(cat <<'EOF'
feat: soft-gate unlock, PDF export, and public opt-in to ops queue

EOF
)"
```

---

### Task 12: Public UI (landing, progress, preview, unlocked report)

**Files:**
- Modify: `src/app/page.tsx`, `src/app/layout.tsx`
- Create: `src/app/scan/[token]/page.tsx`
- Create: `src/components/public/ScanForm.tsx`, `ScorePreview.tsx`, `UnlockForm.tsx`, `PageMatrix.tsx`

- [x] **Step 1: Landing**

Brand-forward hero: product name **Schema**, headline secondary, one URL field + CTA “Check your AEO/GEO readiness”. Use shadcn `Input`/`Button`. On submit → `POST /api/scans` → router push `/scan/${token}`.

Load `ui-ux-pro-max` / `frontend-design` / `brand` skills before styling. Avoid purple-on-white AI cliché; pick a clear direction (e.g. technical editorial, high-contrast ink on warm paper **or** cool industrial — one direction only).

- [x] **Step 2: Scan page**

Poll `GET /api/scans/[token]` every 2s while `queued|running`. Show progress stages. On `complete`, render `ScorePreview` (score + pillars + top 3 gaps). Show `UnlockForm`. After unlock, show `PageMatrix`, full findings, PDF download link, opt-in CTA.

- [ ] **Step 3: Manual verify**

```bash
npm run dev
# In another terminal: npx inngest-cli@latest dev
```

Run a scan against a known site with `PARALLEL_API_KEY` set.

- [x] **Step 4: Commit**

```bash
git add src/app/page.tsx src/app/layout.tsx src/app/scan/ src/components/public/
git commit -m "$(cat <<'EOF'
feat: public soft-gated AEO/GEO scan UI

EOF
)"
```

---

### Task 13: Ops auth + inbox APIs + UI

**Files:**
- Create: `src/app/ops/layout.tsx`, `login/page.tsx`, `page.tsx`
- Create: `src/app/api/ops/queue/route.ts`, `queue/[id]/route.ts`, `rescan/route.ts`
- Create: `src/lib/ops/priority.ts`, `src/lib/ops/outreach.ts`
- Create: `src/components/ops/QueueTable.tsx`, `LeadSheet.tsx`
- Test: `tests/unit/ops-priority.test.ts`, `tests/integration/ops-queue.test.ts`

- [ ] **Step 1: Priority helper tests**

```ts
import { describe, expect, it } from "vitest";
import { computeOpsPriority } from "@/lib/ops/priority";

describe("computeOpsPriority", () => {
  it("ranks low score with contact higher than high score", () => {
    const low = computeOpsPriority({ scoreTotal: 20, hasContact: true });
    const high = computeOpsPriority({ scoreTotal: 90, hasContact: true });
    expect(low).toBeGreaterThan(high);
  });

  it("penalizes missing contact", () => {
    const withEmail = computeOpsPriority({ scoreTotal: 20, hasContact: true });
    const without = computeOpsPriority({ scoreTotal: 20, hasContact: false });
    expect(withEmail).toBeGreaterThan(without);
  });
});
```

Formula: `(100 - scoreTotal) + (hasContact ? 25 : 0)`.

- [ ] **Step 2: Ops layout auth gate**

Use Supabase SSR session; if no user or no `staff_profiles` row, redirect to `/ops/login`.

- [ ] **Step 3: Queue API**

`GET /api/ops/queue` — join leads, latest scan score, contact counts; sort by `priority_score` desc; filters via query (`status`, `hasEmail`, `minScore`, `maxScore`).

`PATCH /api/ops/queue/[id]` — `{ status, notes? }` with audit row.

`POST /api/ops/rescan` — `{ leadId }` creates new scan source=ops and enqueues Inngest.

- [ ] **Step 4: Inbox UI**

shadcn Table + Badge + Sheet detail with page matrix, contacts, notes, status select, Re-scan, Copy outreach blurb (`buildOutreachBlurb(lead, scan)`).

- [ ] **Step 5: Commit**

```bash
git add src/app/ops/ src/app/api/ops/ src/lib/ops/ src/components/ops/ tests/unit/ops-priority.test.ts tests/integration/ops-queue.test.ts
git commit -m "$(cat <<'EOF'
feat: add ops inbox with priority queue and status workflow

EOF
)"
```

---

### Task 14: Ops prospecting (FindAll + enrich)

**Files:**
- Create: `src/lib/ops/prospect.ts`
- Create: `src/app/api/ops/prospect/route.ts`
- Create: `src/app/ops/prospect/page.tsx`, `src/components/ops/ProspectForm.tsx`
- Create: `src/inngest/functions/run-prospect.ts`
- Test: `tests/integration/prospect.test.ts`

- [ ] **Step 1: Integration test with mock Parallel**

Mock `findAllAndEnrich` returns two leads (one missing email). Assert: 2 `leads` upserted by domain, contacts inserted, `ops_queue` rows created, `missing_contact` true for the email-less lead, scan events requested for both.

- [ ] **Step 2: Implement prospect flow**

`POST /api/ops/prospect` `{ objective: string }` → Inngest `prospect/requested` → function calls Parallel → upsert → enqueue scans.

UI: form + confirmation of estimated async nature + progress via job status table or toast “Prospecting started”.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ops/prospect.ts src/app/api/ops/prospect/ src/app/ops/prospect/ src/components/ops/ProspectForm.tsx src/inngest/functions/run-prospect.ts tests/integration/prospect.test.ts
git commit -m "$(cat <<'EOF'
feat: prospect companies via Parallel FindAll and enqueue scans

EOF
)"
```

---

### Task 15: Playwright smoke + hardening + docs

**Files:**
- Create: `tests/e2e/public-scan.spec.ts`
- Modify: `README.md`, `.cursor/rules/project-context.mdc`, `docs/INTENT.md` status line
- Modify: rate limit / error copy as needed

- [ ] **Step 1: E2E with mocked APIs**

Use Playwright route interception to mock `POST /api/scans` and `GET /api/scans/*` progressing from running → complete preview → unlock → pages visible.

```ts
import { test, expect } from "@playwright/test";

test("soft gate unlocks page matrix", async ({ page }) => {
  await page.route("**/api/scans", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        json: { token: "tok_test", id: "1", status: "queued" },
      });
    }
  });
  let unlocked = false;
  await page.route("**/api/scans/tok_test", async (route) => {
    await route.fulfill({
      json: unlocked
        ? {
            status: "complete",
            scoreTotal: 42,
            breakdown: {},
            findings: [],
            pages: [{ url: "https://example.com/", hasJsonLd: false, schemaTypes: [] }],
          }
        : {
            status: "complete",
            scoreTotal: 42,
            breakdown: { structuredData: 10, aiDiscoveryFiles: 5, aiCrawlability: 10, pageCoverage: 5, answerReadiness: 2 },
            topGaps: ["Missing llms.txt", "No JSON-LD on home", "Low coverage"],
          },
    });
  });
  await page.route("**/api/scans/tok_test/unlock", async (route) => {
    unlocked = true;
    await route.fulfill({ json: { unlocked: true } });
  });

  await page.goto("/");
  await page.getByLabel(/website/i).fill("example.com");
  await page.getByRole("button", { name: /check/i }).click();
  await expect(page.getByText("42")).toBeVisible();
  await page.getByLabel(/email/i).fill("buyer@example.com");
  await page.getByRole("button", { name: /unlock/i }).click();
  await expect(page.getByText("example.com")).toBeVisible();
});
```

- [ ] **Step 2: Run e2e**

```bash
npx playwright install chromium
npm run test:e2e
```

- [ ] **Step 3: Full verification**

```bash
npm test
npm run lint
npm run build
```

Expected: all green.

- [ ] **Step 4: Update docs**

- README: install, env, `npm run dev` + `npx inngest-cli@latest dev`, ops login notes
- project-context: fill verification commands (`npm test`, `npm run lint`, `npm run build`)
- INTENT status → “v1 implementation in progress / complete” as appropriate
- Changelog section in README with date

- [ ] **Step 5: Final commit**

```bash
git add tests/e2e/ README.md docs/INTENT.md .cursor/rules/project-context.mdc
git commit -m "$(cat <<'EOF'
test: add public soft-gate Playwright smoke and finalize docs

EOF
)"
```

---

## Spec coverage checklist

| Spec section | Task(s) |
|---|---|
| Dual public + ops product | 12, 13, 14 |
| Parallel-only map/extract/findall/enrich | 7, 9, 14 |
| Soft gate score → email → detail/PDF | 11, 12, 15 |
| ~40 page standard depth | 8, 9 |
| Data model + RLS | 2 |
| Scoring pillars + findings | 4–6 |
| Ops inbox statuses + priority | 13 |
| Prospecting FindAll/enrich | 14 |
| Rate limit 3/domain/day | 10 |
| Error/partial success behavior | 9 |
| TDD + mocked Parallel | 3–9, 14 |
| E2E smoke | 15 |
| Non-goals (no Firecrawl/CRM/etc.) | Enforced in `aeo-geo-product.mdc`; no tasks add them |

## Self-review notes

- No Firecrawl tasks included.
- Parallel client interface keeps FindAll/enrich HTTP details swappable without changing orchestrator.
- Public reads go through service-role routes + token (avoids unsafe anon RLS inserts).
- Pillar numeric thresholds live in `constants.ts` and are locked by scoring tests (spec follow-up satisfied).
- PDF visual polish deferred beyond functional `@react-pdf/renderer` report (spec open follow-up).
