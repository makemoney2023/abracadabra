# Schema — AI Visibility (AEO / GEO Readiness)

Free AI-visibility scanner for Answer Engine Optimization (AEO) and Generative Engine Optimization (GEO), plus an internal ops inbox for outbound prospecting. Public positioning: **AI Blind Spot** — sell visibility to answer engines, not “schema markup.”

## Start here

| Doc | Purpose |
|-----|---------|
| [docs/EXECUTIVE-SUMMARY.md](docs/EXECUTIVE-SUMMARY.md) | Short overview |
| [docs/INTENT.md](docs/INTENT.md) | Intent, value prop, success criteria |
| [docs/brand-guidelines.md](docs/brand-guidelines.md) | Brand voice + messaging |
| [.agents/product-marketing.md](.agents/product-marketing.md) | Product marketing context for copy skills |
| [docs/sales/](docs/sales/) | Ops playbook, 7-day nurture, proposal tiers |
| [docs/superpowers/specs/2026-08-11-aeo-geo-readiness-scanner-design.md](docs/superpowers/specs/2026-08-11-aeo-geo-readiness-scanner-design.md) | Approved design |
| [docs/SKILLS-AND-RULES-INVENTORY.md](docs/SKILLS-AND-RULES-INVENTORY.md) | Which ClaudeSkills rules/skills apply and were pulled in |

## Product snapshot

- **Public / internal:** URL → score + gaps + generate fixes on the fly → email unlocks full page matrix / findings + PDF (marketing soft-gate later)
- **Ops:** Parallel FindAll → enrich contacts → auto-scan → inbox queue
- **Fetch layer:** Parallel only (`search`, `extract`/`fetch`, `findall`, `enrich`) — no Firecrawl in v1
- **Stack:** Next.js + Supabase + Inngest + shadcn + Vitest/Playwright

## Local setup

1. Copy env and fill values (use Obsidian secrets / your vault — never commit keys):

   ```bash
   cp .env.example .env.local
   ```

   Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PARALLEL_API_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `NEXT_PUBLIC_APP_URL`.

2. Apply DB migrations (Docker + Supabase CLI, or linked remote project):

   ```bash
   npx supabase start   # local Docker stack, if using CLI
   npx supabase db reset
   ```

   Migrations: `supabase/migrations/20260811000000_init.sql` and
   `20260811120000_grant_service_role.sql` (table privileges for `service_role`).

3. Install and run the app + Inngest dev server (two terminals):

   ```bash
   npm install
   npm run dev
   npx inngest-cli@latest dev
   ```

4. **Ops login:** create a Supabase Auth user, then insert a `staff_profiles` row (`user_id`, `role = 'ops'`). Sign in at `/ops/login` (email/password or magic link). Inbox: `/ops`. Prospecting: `/ops/prospect`.

## Verification

```bash
npm test
npm run lint
npm run build
npx playwright install chromium   # once
npm run test:e2e
```

## API (current)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/scans` | Create public scan (`{ url }`) → `{ token, id, status }`; rate limit 3/domain/24h |
| `GET` | `/api/scans/[token]` | Soft-gated status: score + top gaps + `pagesMissingJsonLd` + `pillarWhy`; pages/findings when unlocked |
| `GET`/`POST` | `/api/scans/[token]/fixes` | List/generate fix package (Organization-tree types; zero-TODO; `requiredFields` gate; 422 if incomplete; INSTALL path map + VALIDATION deep-links) |
| `POST` | `/api/scans/[token]/fixes/refresh` | HTML fact refresh (≤5 critical URLs) → persist `evidence` + return prefills/`requiredFields` |
| `POST` | `/api/scans/[token]/unlock` | Soft-gate unlock (`{ email }`) → httpOnly cookie + `{ unlocked: true }` |
| `POST` | `/api/scans/[token]/opt-in` | Public opt-in → upsert lead, ensure `ops_queue` `new`, link `scan.lead_id` |
| `GET` | `/api/scans/[token]/pdf` | PDF report (requires unlock cookie only) |
| `GET` | `/api/ops/scans/[token]` | Ops full scan detail — pages + findings (staff session) |
| `GET` | `/api/ops/queue` | Ops inbox list (staff) — filters: `status`, `hasEmail`, `minScore`, `maxScore` |
| `PATCH` | `/api/ops/queue/[id]` | Update status/notes + audit row (staff) |
| `POST` | `/api/ops/rescan` | `{ leadId }` → new ops scan + Inngest `scan/requested` |
| `POST` | `/api/ops/prospect` | `{ objective }` → Inngest `prospect/requested` (FindAll → enrich → scans) |
| `GET/POST/PUT` | `/api/inngest` | Inngest serve (`scan/requested`, `prospect/requested`) |

Unlock for public detail: httpOnly cookie `scan_unlock_${token}=1` after email unlock. No query-param bypass. Ops uses `GET /api/ops/scans/[token]`.

## Agent setup

Project rules live in `.cursor/rules/` (session startup, TDD, product locks).  
Project skills live in `.cursor/skills/` (UI/UX Pro Max, Parallel, Superpowers, GEO/schema, Supabase, etc.).

On every coding session, follow `startup-session` → read INTENT + design + `project-context`.

## Status

v1 implementation complete for public soft-gate flow + ops inbox/prospecting (Parallel-only). Deploy/CI polish still open.

## Changelog

### 2026-08-13 — JSON-LD fix templates upgraded (fuller graphs)

- **What changed** — Fix-package JSON-LD builders emit richer Schema.org graphs when facts exist: Organization `image` + `areaServed` + `geo` + `openingHoursSpecification` + richer `contactPoint`; WebSite `about`/`description`; Product `image`/`Offer` (price only when known); Event `location`/`endDate`/`image`; JobPosting `datePosted`/`jobLocation`/expanded `hiringOrganization`; BlogPosting `ImageObject` + org `@id` author; Service `areaServed`; About/Contact/WebPage `description`/`primaryImageOfPage`/`inLanguage`. Still omits unknowns (zero-TODO; no invented ratings/prices).
- **Why** — Templates were minimum-viable vs Google/schema.org recommended properties (same gap class as pre-v2 `llms.txt`).
- **Code touchpoints** — `src/lib/fixes/jsonld-templates.ts`, `generate-package.ts`, `extract-page-facts.ts` (geo + freeOffer merge), skill `jsonld-templates.md`, tests
- **Data-flow impact** — Fix zip JSON-LD richer when evidence/overrides supply fields
- **API / schema impact** — none (artifact content only)
- **Verification** — `npm test` (168); `npm run lint`

### 2026-08-13 — llms.txt / llms-full.txt templates → llmstxt.org v2

- **What changed** — Fix-package `llms.txt` and `llms-full.txt` now follow [llmstxt.org v2](https://llmstxt.org/): H1, blockquote summary, detail prose (entity contact / sameAs), H2 curated sections (`Core` / `Offers` / `Support` / `Optional`) with `- [Title](url): notes` links. `llms-full` is an extended annotated index (not a bare URL dump). Detector `analyzeLlmsTxt` requires H1 + `>` + markdown link for “useful.”
- **Why** — Prior template was a lite pageType URL list and failed v2 completeness.
- **Code touchpoints** — `src/lib/fixes/llms-txt-template.ts`, `generate-package.ts`, `src/lib/detect/llms-txt.ts`, `src/fixtures/sample-llms.txt`, tests
- **Data-flow impact** — Fix zip site-file contents richer; scoring “useful llms” stricter
- **API / schema impact** — none (artifact content only)
- **Verification** — `npm test`; `npm run lint`

### 2026-08-13 — ColorBrewer heat palette + pillar info tooltips

- **What changed** — Score colors use vibrant Lighthouse-forward heat stops (`#FF4E42` → `#FF8A00` → `#FFCC00` → `#34C759` → `#0CCE6B`), RGB-interpolated; ring track is higher-opacity. Each pillar title has an info icon tooltip explaining what it measures.
- **Why** — Prior oklch hue walk did not read as a true heat ring; tooltips make pillars self-explanatory.
- **Code touchpoints** — `score-color.ts`, `pillar-why.ts` (`PILLAR_DESCRIPTIONS`), `ScoreRing.tsx`, `PillarMeter.tsx`, `ScorePreview.tsx`, tests
- **Data-flow impact** — none (presentation)
- **API / schema impact** — none
- **Verification** — `npm test`; `npm run lint`
- **Sources** — ColorBrewer RdYlGn; Chrome Lighthouse score colors/thresholds; accessible traffic-light color guidance

### 2026-08-13 — Heat-ring palette + written score summary

- **What changed** — Deterministic `scoreSummary` (headline, body, drivers) on scan payload + report UI + PDF; earlier heat attempt (superseded by ColorBrewer stops above).
- **Why** — Explicit written “why this score” without LLM subjectivity.
- **Code touchpoints** — `score-summary.ts`, `present.ts`, `ScorePreview.tsx`, `pdf/report.tsx`, tests
- **Data-flow impact** — `GET /api/scans/[token]` adds `scoreSummary` (additive)
- **API / schema impact** — additive JSON field
- **Verification** — `npm test`; `npm run lint`

### 2026-08-13 — Report UI/UX pass (gauge + pillar meters)

- **What changed** — Report redesign per ClaudeSkills UI packs: one overall gauge (single KPI), five pillar **bullet meters** (multi-KPI), soft oklch red→green + Poor/Fair/Good/Strong labels (not color-alone). Print + unlock-gated PDF kept.
- **Why** — First ring grid was weak UX (five gauges); chart guidance prefers meters for 3+ KPIs and Schema brand over garish traffic-light rings.
- **Code touchpoints** — `score-color.ts`, `ScoreRing.tsx`, `PillarMeter.tsx`, `ScorePreview.tsx`, `ScanReportActions.tsx`, scan page, `globals.css`, tests
- **Data-flow impact** — none
- **API / schema impact** — none
- **Verification** — `npm test`; `npm run lint`
- **Skills used** — web-designer pack list, ui-ux-pro-max (chart/ux), frontend-design, ui-styling, brand-guidelines, Vercel web-interface-guidelines

### 2026-08-13 — Pillar score rings + print / PDF actions (superseded)

- Initial rings + print/PDF; replaced same day by gauge + meter pass above.

### 2026-08-11 — Prefill sameAs + opening hours in fix UI

- **What changed** — `listFixOptions` prefills now include `sameAs`, `openingHours`, `searchUrlTemplate`, and `address` from merged page evidence; FixPackageDownload loads them into the form.
- **Why** — Evidence was already extracted at scan time but the UI left those fields blank.
- **Code touchpoints** — `src/lib/fixes/generate-package.ts`, `FixPackageDownload.tsx`, `tests/unit/fix-package.test.ts`
- **Data-flow impact** — evidence → prefills → form fields → package selection
- **API / schema impact** — prefills shape extended (additive)
- **Verification** — `npm test` (fix-package prefills)

### 2026-08-11 — Auto-detect board of trade / chamber business type

- **What changed** — Detect “board of trade” / “chamber of commerce” as schema.org `Organization` (no BoardOfTrade type exists). Prefer that over LocalBusiness-from-address so fix UI doesn’t force subtype/address selection. Prefills brand name from evidence; auto-detected types show a locked label with optional Change.
- **Why** — Sites like bot.com (Toronto Region Board of Trade) were misclassified as LocalBusiness and required manual type picking.
- **Code touchpoints** — `src/lib/facts/detect-business-type.ts`, `src/lib/fixes/generate-package.ts`, `FixPackageDownload.tsx`, `/fixes` route, tests
- **Data-flow impact** — Scan evidence → detectBusinessType → prefills.businessType / businessTypeAuto
- **API / schema impact** — prefills may include `businessTypeLabel`, `businessTypeAuto`
- **Verification** — `npm test` (detect + fix-package)

### 2026-08-11 — AI Blind Spot marketing reposition

- **What changed** — Public landing expanded with problem / analogy / how-it-works / FAQ / final CTA; primary CTA “Check your AI visibility”; soft-gate, opt-in, score preview, and meta copy aligned. Added product-marketing context, brand guidelines, and ops sales docs (playbook, 7-day nurture, proposal tiers). Prices stay internal (no public `/pricing`).
- **Why** — Sell AI visibility / AI-readiness upgrade instead of “schema markup,” matching GTM strategy.
- **Code touchpoints** — `src/lib/marketing/copy.ts`, `src/app/page.tsx`, `src/components/public/{ScanForm,UnlockForm,OptInForm,ScorePreview}.tsx`, `src/components/public/landing/`, `src/app/layout.tsx`, `src/lib/ops/outreach.ts`, `.agents/product-marketing.md`, `docs/brand-guidelines.md`, `docs/sales/*`, tests
- **Data-flow impact** — none (copy + docs; same scan/unlock/opt-in flows)
- **API / schema impact** — none
- **Verification** — `npm test`; `npm run lint`; `npm run build`

### 2026-08-11 — Organization catalog, typed pages, plug-and-play INSTALL

- **What changed** — Vendored schema.org Organization-tree catalog (~167 types) for home `@type`; expanded page typing (testimonial, appointment, event, careers, menu, broader blog paths) with content reclassify; generators emit Review/ReserveAction/Event/JobPosting/Menu/HowTo when facts exist; HTML budgets 12/10; refresh persists `page_type`; NAP/hours/reviews/HowTo extractors; searchable business-type UI + sameAs/hours/searchUrlTemplate; INSTALL path map + CMS guides; VALIDATION.md Rich Results deep-links; soft-gate copy polish. Zero-TODO preserved.
- **Why** — Make fix zips plug-and-play across verticals and page types without inventing ratings.
- **Code touchpoints** — `src/lib/schema-org/`, `src/lib/prioritize-urls.ts`, `src/lib/scan/{reclassify-page-type,refresh-page-facts,schema-html,orchestrator}.ts`, `src/lib/facts/*`, `src/lib/fixes/{generate-package,validate-package}.ts`, `src/components/public/FixPackageDownload.tsx`, `src/app/api/scans/[token]/fixes/**`, tests under `tests/unit/`
- **Data-flow impact** — Scan/refresh → reclassify `page_type` + richer evidence → typed fix package → INSTALL/VALIDATION
- **API / schema impact** — `businessType` accepts any Organization subtype (+ SoftwareApplication); refresh updates `page_type`; selection accepts `searchUrlTemplate` / `openingHours` / `sameAs`
- **Verification** — `npm test`; `npm run lint`

### 2026-08-11 — Zero-TODO fix packages + facts refresh

- **What changed** — Fix packages never emit `TODO_*`. Generators omit unknown optional Schema.org props; FAQ/BlogPosting only when real content exists; `requiredFields` blocks Download and POST returns 422 until filled. HTML/meta/link + FAQ-from-copy extraction; `detectBusinessType` prefills; Missing vs Additive UX; `POST /fixes/refresh` re-fetches ≤10 pages, reclassifies `page_type`, persists evidence. Offline validation errors on any `TODO_`.
- **Why** — Ship installable packages with no invented placeholders; revive fact fill for old scans without a full re-scan.
- **Code touchpoints** — `src/lib/facts/*`, `src/lib/fixes/*`, `src/lib/scan/refresh-page-facts.ts`, `schema-html.ts`, `FixPackageDownload.tsx`, `/fixes` + `/fixes/refresh` routes, tests
- **Data-flow impact** — Scan/refresh HTML → evidence → requiredFields gate → zero-TODO zip
- **API / schema impact** — GET `/fixes` returns `requiredFields`; POST 422 on gaps/validation; new refresh endpoint
- **Verification** — `npm test` + `npm run lint`

### 2026-08-11 — Fix package evidence + scanner quality roadmap

- **What changed** — Scans persist `PageFacts` on `scan_pages.evidence`. Fix generate prefills from facts + UI overrides (business type, email, phone, logo, SearchAction opt-in). Additive schema merge, Service/Product/HowTo templates, local `VALIDATION.md`. Scoring adds `llms-full.txt`, Breadcrumb/HowTo/Product info findings; URL map seeds templates and splits `blog`/`blogPost`.
- **Why** — Ship installable fix zips from scan evidence without Parallel at generate time; close scoring gaps that feed the package.
- **Code touchpoints** — `src/lib/facts/*`, `src/lib/fixes/*`, `src/lib/scan/*`, `src/lib/scoring/*`, `src/lib/prioritize-urls.ts`, `FixPackageDownload.tsx`, tests
- **Data-flow impact** — Scan → evidence jsonb → `/fixes` → merged JSON-LD zip
- **API / schema impact** — `/fixes` GET returns `prefills`; POST accepts overrides; uses existing `evidence` column
- **Verification** — `npm test` (100)

### 2026-08-11 — Fix package schema quality upgrade

- **What changed** — Home JSON-LD now includes Google-recommended Organization fields (`logo` ImageObject, `sameAs`, `contactPoint`, `address`, `description`) plus WebSite `SearchAction`. Inner pages emit `@graph` with `BreadcrumbList`. About/Contact use `mainEntity`. Blog listings use `CollectionPage`; deep blog URLs use `BlogPosting` with author/publisher/image/dates. FAQPage binds to the scanned page URL.
- **Why** — Templates drifted behind Schema.org + Google Search Central guidance; listing pages were incorrectly typed as `BlogPosting`.
- **Code touchpoints** — `src/lib/fixes/generate-package.ts`, `tests/unit/fix-package.test.ts`, skill `jsonld-templates.md`
- **Data-flow impact** — Fix zip contents richer; still TODO placeholders for unknown facts
- **API / schema impact** — none (same `/fixes` contract)
- **Verification** — `npm test`

### 2026-08-11 — Concrete pillar gaps + ungated fix generate

- **What changed** — “Why this score” summaries list concrete gaps (e.g. empty llms.txt). Gaps section lists every page missing JSON-LD. Fix package generate/download no longer requires email unlock (internal on-the-fly use); unlock still gates page matrix / findings / PDF.
- **Why** — Partial AI discovery scores were vague; operators need the page list and immediate fixes without the marketing soft-gate.
- **Code touchpoints** — `src/lib/scoring/pillar-why.ts`, `src/lib/scan/present.ts`, `ScorePreview.tsx`, `scan/[token]/page.tsx`, `fixes/route.ts`, `UnlockForm.tsx`, tests
- **Data-flow impact** — Scan GET always includes `pagesMissingJsonLd` + concrete `pillarWhy`; `/fixes` loads without unlock cookie
- **API / schema impact** — `/fixes` no longer returns 401 for missing unlock
- **Verification** — `npm test`

### 2026-08-11 — User-controlled fix package (all missing page schemas)

- **What changed** — Fix export is checkbox-driven: site files, FAQ template, and **every** scanned page missing JSON-LD. `GET /fixes` returns options; `POST /fixes` generates only the user’s selection (zip or JSON). Page schemas use type-aware JSON-LD (Organization/WebSite, AboutPage, ContactPage, BlogPosting, WebPage).
- **Why** — Users control what to fix; coverage gaps need schemas for all missing pages, not a small capped subset.
- **Code touchpoints** — `src/lib/fixes/generate-package.ts`, `src/app/api/scans/[token]/fixes/route.ts`, `src/components/public/FixPackageDownload.tsx`, `checkbox` UI, tests, skill refs
- **Data-flow impact** — Load options → select → POST download (no unlock)
- **API / schema impact** — `GET` options; `POST` `{ selection…, format }` (breaking vs prior GET-zip)
- **Verification** — `npm test`

### 2026-08-11 — Pillar “Why this score” + fix package export

- **What changed** — Each pillar on the public report has a “Why this score” accordion (from findings). Initial fix zip/JSON export landed (later made user-controlled).
- **Why** — Explain cambridgechamber-style scores and let users export installable gap fixes.
- **Code touchpoints** — `src/lib/scoring/pillar-why.ts`, `src/lib/scan/present.ts`, `ScorePreview`, accordion, fixes lib
- **Data-flow impact** — Soft-gated GET payload includes `pillarWhy`
- **API / schema impact** — early fixes route (superseded by selection POST)
- **Verification** — `npm test`

### 2026-08-11 — Cap schema HTML fetches (scan no longer hangs)

- **What changed** — Schema HTML recovery is capped (8 URLs), parallelized, and times out at 5s; extract URL matching ignores `www`/slash drift; page Parallel extracts use excerpts (not full markdown) for speed.
- **Why** — After JSON-LD HTML fallback, scans fetched up to ~40 pages sequentially (15s each) and appeared stuck on “Scanning…”.
- **Code touchpoints** — `src/lib/scan/schema-html.ts`, `src/lib/scan/orchestrator.ts`, `src/lib/fetch-html.ts`, `src/app/scan/[token]/page.tsx`, unit tests
- **Data-flow impact** — Orchestrator schema enrichment bounded; scoring still uses recovered JSON-LD on priority pages
- **API / schema impact** — none
- **Verification** — `npm test` (73)

### 2026-08-11 — Schema.org gap-fix skill (next stage)

- **What changed** — Added `.cursor/skills/schema-org-gap-fixes` to map scan findings to downloadable fix packages (JSON-LD, `llms.txt`, `robots.txt`, `sitemap.xml`) using Schema.org JSON-LD conventions from Context7.
- **Why** — Prepare the “fix top gaps → download files” product stage with a reusable agent/implementation contract.
- **Code touchpoints** — `.cursor/skills/schema-org-gap-fixes/**`, `docs/SKILLS-AND-RULES-INVENTORY.md`
- **Data-flow impact** — none yet (skill/docs only; app zip API not wired)
- **API / schema impact** — none
- **Verification** — skill structure + Context7 `/schemaorg/schemaorg` + `/websites/schema` queries

### 2026-08-11 — Fix Parallel extract content mapping (false zero scores)

- **What changed** — Parallel client maps `full_content` / `excerpts` into `content`; sitemap parser accepts Parallel-flattened URL lists; URL prioritizer keeps `www` same-site URLs and drops off-domain search noise; JSON-LD detection falls back to a direct HTML GET because Parallel markdown strips `ld+json` scripts; robots detector only treats same-agent-group `Disallow: /` as a full block. Local Supabase also grants `service_role` table privileges.
- **Why** — Scans marked every page failed (empty content), so structured data / discovery / coverage / answer readiness scored 0 even when the site was healthy.
- **Code touchpoints** — `src/lib/parallel/client.ts`, `src/lib/detect/sitemap.ts`, `src/lib/prioritize-urls.ts`, `src/lib/fetch-html.ts`, `src/lib/scan/orchestrator.ts`, `supabase/migrations/20260811120000_grant_service_role.sql`, related unit tests
- **Data-flow impact** — Extract → detectors → scoring now sees real page/site-file bodies; schema via HTML fallback
- **API / schema impact** — migration grants only (no table shape change)
- **Verification** — `npm test` (69); live `pirx.ca` rescan → score 80 with non-zero structured/discovery/coverage/answer pillars

### 2026-08-11 — Close public soft-gate bypass

- **What changed** — Public scan GET and PDF ignore `?unlocked=1`; unlock requires httpOnly cookie only. Ops LeadSheet loads pages via authenticated `GET /api/ops/scans/[token]`. Unlock cookie sets `secure` in production.
- **Why** — Query bypass let anyone with a public token read full page/findings detail.
- **Code touchpoints** — `src/app/api/scans/[token]/route.ts`, `src/app/api/scans/[token]/pdf/route.tsx`, `src/app/api/scans/[token]/unlock/route.ts`, `src/app/api/ops/scans/[token]/route.ts`, `src/components/ops/LeadSheet.tsx`, soft-gate/ops scan tests
- **Data-flow impact** — Public soft gate cookie-only; ops detail via staff session API
- **API / schema impact** — New ops scan detail route; removed public query unlock bypass
- **Verification** — `npm test`, `npm run lint`

### 2026-08-11 — Playwright soft-gate smoke + docs finalize

- **What changed** — E2E soft-gate smoke with mocked scan APIs; README setup (env, Inngest, Supabase/Docker, ops login); project-context verification commands; INTENT status.
- **Why** — Lock the public unlock path and make local/agent verification deterministic.
- **Code touchpoints** — `tests/e2e/public-scan.spec.ts`, `README.md`, `docs/INTENT.md`, `.cursor/rules/project-context.mdc`
- **Data-flow impact** — none (test + docs)
- **API / schema impact** — none
- **Verification** — `npm test`; `npm run lint`; `npm run build`; `npm run test:e2e`

### 2026-08-11 — Ops prospecting (FindAll + enrich)

- **What changed** — Prospect objective → Inngest `prospect/requested` → Parallel FindAll/enrich → leads/contacts/ops_queue → ops scans enqueued.
- **Why** — Outbound pipeline for the ops inbox.
- **Code touchpoints** — `src/lib/ops/prospect.ts`, `src/inngest/functions/run-prospect.ts`, `src/app/api/ops/prospect/`, `src/app/ops/prospect/`, `src/components/ops/ProspectForm.tsx`, `tests/integration/prospect.test.ts`
- **Data-flow impact** — Ops prospect → Parallel → DB upsert → `scan/requested` per lead
- **API / schema impact** — New `POST /api/ops/prospect`; Inngest function registered
- **Verification** — `npm test`

### 2026-08-11 — Ops inbox + priority queue

- **What changed** — Staff auth gate, queue list/PATCH/rescan APIs, inbox Table + LeadSheet, outreach blurb helper.
- **Why** — Work prioritized opportunities (low score + contact).
- **Code touchpoints** — `src/app/ops/`, `src/app/api/ops/`, `src/lib/ops/`, `src/components/ops/`, `src/middleware.ts`, ops unit/integration tests
- **Data-flow impact** — Ops session → queue read/update/audit → rescan → Inngest
- **API / schema impact** — New ops HTTP routes; uses `ops_status_audit` via admin client
- **Verification** — `npm test`

### 2026-08-11 — Public soft-gated scan UI

- **What changed** — Landing page (Schema brand + ScanForm), scan result page with 2s polling, ScorePreview, UnlockForm, PageMatrix, findings, PDF link, opt-in CTA.
- **Why** — Let visitors run a scan and experience the soft gate end-to-end.
- **Code touchpoints** — `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/scan/[token]/page.tsx`, `src/components/public/*`
- **Data-flow impact** — Browser → `POST /api/scans` → poll `GET /api/scans/[token]` → unlock/PDF/opt-in
- **API / schema impact** — none
- **Verification** — `npm test`; `npm run lint`

### 2026-08-11 — Soft-gate unlock, PDF, public opt-in

- **What changed** — Email unlock sets httpOnly cookie; React-PDF export; public opt-in upserts lead + ops queue.
- **Why** — Soft-gate detail + PDF and route interested visitors into ops inbox.
- **Code touchpoints** — `src/app/api/scans/[token]/{unlock,opt-in,pdf}/`, `src/lib/pdf/report.tsx`, `src/lib/scan/{unlock,opt-in}.ts`, `tests/unit/unlock-gate.test.ts`, `tests/unit/pdf-report.test.ts`, `tests/integration/unlock-api.test.ts`
- **Data-flow impact** — Preview → email unlock → full pages/findings/PDF; optional opt-in → `leads` + `ops_queue`
- **API / schema impact** — New unlock/opt-in/pdf routes; writes `scan_unlocks`, `leads`, `ops_queue`, `scans.lead_id`
- **Verification** — `npm test` (45 passed)

### 2026-08-11 — Scan create/status API + Inngest job

- **What changed** — Public `POST/GET /api/scans`, Inngest `run-scan`, Supabase-backed `ScanRepository`, soft-gate payload helper, 3/day domain rate limit.
- **Why** — Wire queued scans to async orchestration and expose status with soft gate.
- **Code touchpoints** — `src/inngest/`, `src/app/api/scans/`, `src/app/api/inngest/`, `src/lib/rate-limit.ts`, `src/lib/scan/present.ts`, `src/lib/scan/supabase-repository.ts`, `tests/unit/present.test.ts`, `tests/unit/rate-limit.test.ts`, `tests/integration/scans-api.test.ts`
- **Data-flow impact** — Public create → DB queued → Inngest → `runScan` → status poll with soft gate
- **API / schema impact** — New HTTP routes; uses existing `scans` / `scan_pages` / `scan_findings` / `ops_queue` tables
- **Verification** — `npm test` (38 passed); `npx tsc --noEmit` clean
