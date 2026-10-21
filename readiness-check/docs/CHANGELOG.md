# Changelog

## Prices: 40-page fix files $99.99, deep 200 $149.99, deep 1000 $249.99 — 2026-10-21

**Offer (config only).** The free scan stays free. 40-page fix files go from $149.99 to $99.99 (`PRICE_DISPLAY=$99.99`, `PRICE_AMOUNT_CENTS=9999` in `wrangler.jsonc`). With the $10 credit, the panel reads "you pay $89.99". Deep tiers (`TIER_PRICES`): 200 pages $149.99, 1,000 pages $249.99, fix files included. `scripts/stripe-setup.mjs` now defaults to 9999 (lookup key `schema_fix_files_9999_usd`). It has not been run, and checkout is unchanged and unwired for deep tiers.

## Deep scans: chunked plan / chunk / finalize, 200 and 1000 page tiers behind a flag — 2026-10-21

**Chunked scans.** Every scan now runs as plan → chunks of 50 URLs → finalize over `scan-jobs` (`src/lib/scan/pipeline.ts`, store in `src/lib/scan/d1-pipeline-store.ts`). Each chunk writes its rows and bumps `pages_done` in one `db.batch()`. Duplicate deliveries do not double-count, a chunk that failed part-way is retried by the queue, exactly one invocation finalizes, and a delayed watchdog re-sends lost chunks and finalizes a stuck scan as partial after 30 minutes. The free 40-page scan is one chunk run inline, so it still finishes in one invocation with the same pages and score as before.

**Tiers.** `free` 40, `deep-200`, `deep-1000` (`src/lib/scan/tiers.ts`, `SCAN_TIER_LIMITS` override). Deep tiers need `DEEP_SCAN_ENABLED=1` (off) and start only from `POST /api/internal/deep-scans` with the internal job token. The public endpoint ignores any tier. No prices and no checkout: those are open questions.

**Prices.** `TIER_PRICES` in `tiers.ts`: free stays free; `deep-200` $99.99 and `deep-1000` $249.99 (USD), both with the fix files included. Config only: no checkout, and the tiers stay off. The internal deep-scan endpoint returns the price. The free scan's separate $149.99 fix-file offer is unchanged.

**robots.txt.** Deep scans follow robots.txt per RFC 9309 for `SchemaAEOScanner`, falling back to `*` (`src/lib/robots-rules.ts`). Longest match wins, Allow wins ties, `*`/`$` patterns. Disallowed URLs are not fetched or probed, and the skipped count is stored and shown. A 4xx means allow all. A 5xx or network error means nothing is read and the scan fails with a clear message. `Crawl-delay` (capped at 10 s) paces requests one at a time, shrinks chunks to about 4 minutes, runs them one after another, and stretches the deadline past 30 minutes (a 1,000-page scan at 10 s takes about three hours). The free scan is unchanged.

**Report.** Progress (`pages_done / pages_total`) on the scan page. The page matrix groups pages by type or top-level section, shows sections with failures first and the worst pages first, and pages through each section 25 rows at a time. The PDF has the summary, a per-section table and the 50 worst pages. New CSV download of every page (`/api/scans/[token]/csv`), behind the same email unlock as the matrix. The free "pages missing JSON-LD" list shows at most 40 and gives the total.

**Lighter D1 use.** Status polls skip page rows, and the matrix, PDF and CSV skip the evidence column. Deep pages after the first 40 keep a 1,500-character text excerpt. Findings and pages are written as multi-row inserts in one transaction (D1 query limit per invocation). HTML extract results are no longer fetched twice for schema: the `MAX_SCHEMA_HTML_FETCHES=12` cap now only applies to markdown backends.

**Migration.** `migrations/0014_scan_runs.sql`: new tables `readiness_scan_runs` and `readiness_scan_chunks`, plus an index on `readiness_scan_pages (scan_id, url)`. The runs table carries `chunk_size`, `robots_status`, `robots_skipped` and `crawl_delay_ms`. Nothing existing is altered. Apply it before deploying this code.

**Touchpoints.** `src/lib/robots-rules.ts`, `src/lib/scan/{pipeline,d1-pipeline-store,tiers,page-groups,site-files-store,orchestrator,schema-html,page-record,d1-store,present,robots-note}.ts`, `src/lib/jobs/{dispatch,run-cloudflare,auth}.ts`, `src/app/api/internal/deep-scans/route.ts`, `src/app/api/scans/[token]/{route,csv/route,pdf/route}.ts`, `src/lib/pdf/{report-props,scan-report-pdf}.ts`, `src/components/public/{PageMatrix,ScorePreview}.tsx`, `src/app/scan/[token]/page.tsx`. Tests: `tests/integration/{scan-pipeline,scan-robots,deep-scan-route,scan-csv-route}.test.ts`, `tests/unit/{scan-tiers,robots-rules,page-groups,site-files-store,schema-html-lifted}.test.ts`.

## Scanner: real pages before guessed paths — 2026-10-21

**Guessed paths are checked, not counted.** The scanner still tries common paths (`/contact`, `/faq`, `/pricing`, `/book`, …), but only for page types the sitemap and search results don't already cover. Each guess gets a cheap existence check first (`probeUrl` in `src/lib/fetch-html.ts`: HEAD, or GET when HEAD is refused with 403/405/501; 3 s timeout; scanner user agent; redirects followed). Only 2xx/3xx guesses go to extraction, and a guess that redirects onto a page already in the list is dropped. A guess that still fails extraction is dropped silently. `PAGES_FETCH_FAILED` now counts only sitemap and search URLs.

**Real pages get the 40-page budget.** `prioritizeUrls` orders home, then sitemap and search URLs, then guesses. In a first pass each page type, or each top-level section for unclassified pages (`/portfolio/`, `/start/`), gets at most 8 slots (`PER_TYPE_FIRST_PASS`); what the cap held back fills any room left before guesses. A site with 24 blog posts and 13 service pages now still gets its portfolio, products and contact pages scanned.

**Touchpoints.** `src/lib/prioritize-urls.ts` (`templateSeedUrls`, `PER_TYPE_FIRST_PASS`, `source` on each URL), `src/lib/scan/orchestrator.ts` (`probe` dependency, guesses dropped on failure), `src/lib/fetch-html.ts` (`probeUrl`, `SCANNER_USER_AGENT`). Tests: `tests/unit/prioritize-urls.test.ts`, `tests/unit/fetch-html.test.ts`, `tests/integration/orchestrator.test.ts`. No schema or API change.

## Schema fix files: $149.99 offer, working generation, D1 unlock/PDF/refresh — 2026-10-20

**Offer (config only).** wrangler vars: `PRICE_DISPLAY=$149.99`, `PRICE_AMOUNT_CENTS=14999`, `PRICE_CURRENCY=usd`, `CREDIT_AMOUNT_CENTS=1000`. The panel reads "Buy the files $149.99" and "$10 credit applied at checkout, you pay $139.99". Checkout auto-applies `STRIPE_CREDIT_COUPON_ID` via `discounts[0][coupon]` and leaves promotion codes off (Stripe won't take both). With a credit configured, buying stays off until the coupon id is set too, so the panel never promises a credit Stripe won't apply. Currency is USD: the repo defaults to `usd` everywhere. Confirm before creating the Price.

**Stripe setup script.** `STRIPE_SECRET_KEY=sk_test_… node scripts/stripe-setup.mjs` creates or reuses product `schema_fix_files`, a $149.99 one-time price (lookup key `schema_fix_files_14999_usd`) and coupon `schema_files_credit_10_usd` ($10, once). It prints only the IDs and refuses live keys. Not run against any account.

**Preview-only test bypass.** `PAYWALL_TEST_BYPASS=1` lets file generation run without payment, for checking the generators end to end. It is honoured only on a preview alias host (`<alias>-readiness-check.<sub>.workers.dev`) or localhost, and only when the request opts in (`x-paywall-test-bypass: 1` or `?paywall_test=1`). It is never set in `wrangler.jsonc`. Set it only on a preview upload: `wrangler versions upload --preview-alias <alias> --var PAYWALL_TEST_BYPASS:1`. Production hosts ignore it even if a version carrying the var is promoted.

**Generators verified on real scans.** `tests/integration/fix-files-real-scans.test.ts` and `tests/unit/full-schema-real-scans.test.ts` run on the real D1 rows for example.com and abra-ca-dabra.app. They check llms.txt format, sitemap, that every JSON-LD file parses and uses schema.org types (checked against the schema.org vocabulary), and that the zip opens and matches the export. Fixes found on the way:
- Duplicate-@id false positives: the validator walked `@graph` twice and counted references.
- Breadcrumb last item now names the page, not its type.
- llms.txt links use the page headline/description, and service pages get their own names instead of eleven "Services".

**Off Supabase.** Email unlock (new table `readiness_scan_unlocks`, migration 0013, applied to `handoff`), PDF report and "Refresh facts from site" now use D1. Unlock records the email and sets the cookie. It sends no email.

**PDF on Workers.** @react-pdf can't run on Workers: it compiles its layout WebAssembly at runtime and reads fonts from disk. The scan report is now drawn with pdf-lib, using brand fonts served from `public/pdf-fonts`. The assessment PDF still uses @react-pdf.

## Schema fix files behind a paywall — 2026-10-20

- **What changed** — The scan result keeps the score, pillars, every issue, and a new "What each page needs" list free (no email, no payment). Only generating and downloading the fix files (zip and data export) is paid. `POST /api/scans/[token]/fixes` checks for a paid entitlement in D1 and a short-lived signed download token before anything is generated. It answers 402 without payment and 403 with a missing or wrong token. The full issue list moved out of the email gate. The page matrix and the PDF stay behind the email unlock.
- **Why** — Christopher asked to charge for the generated files and keep the diagnosis free.
- **Provider** — Stripe Checkout over fetch (no SDK). The paywall stays off until `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_ID` are all set. While it is off, the result page shows "Not on sale yet" and the file endpoint returns 402 `purchase_unavailable`. `PRICE_DISPLAY` is an optional label on the buy button. The amount charged always comes from the Stripe Price. `DOWNLOAD_TOKEN_SECRET` is optional; by default the signing key is derived from the webhook secret.
- **Code touchpoints** — `src/lib/paywall/*`, `src/app/api/scans/[token]/{entitlement,checkout,checkout/confirm}/route.ts`, `src/app/api/webhooks/stripe/route.ts`, `src/app/api/scans/[token]/fixes/route.ts` (now reads D1, gated POST), `src/lib/scan/present.ts`, `src/lib/fixes/guidance.ts`, `src/components/public/{PageGuidance,FixPackageDownload}.tsx`, `src/app/scan/[token]/page.tsx`, `migrations/0012_scan_file_entitlements.sql`
- **Data-flow impact** — New D1 table `readiness_scan_entitlements` (one row per paid scan: session id, status, amount, currency; no email). Grants come from the signed webhook or from a server-side session read on the success URL; both paths are idempotent.
- **Before turning it on** — Apply `migrations/0012_scan_file_entitlements.sql` to D1 `handoff`. Create the Price. Set the three secrets/vars on Worker `readiness-check`. Point a Stripe webhook at `https://check.abra-ca-dabra.app/api/webhooks/stripe` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
- **Verification** — `npx vitest run tests/unit/paywall.test.ts tests/integration/fixes-paywall.test.ts`, plus the full suite.

## Chat booking session — 2026-10-19

- **What changed** — Cal.com webhook payloads now keep `metadata.chat_session_id`. That id is forwarded on `POST /api/intake/booking` as `chat_session_id`.
- **Why** — A working session booked inside the site chat has to stay tied to that chat when HQ files the appointment.
- **Code touchpoints** — `src/lib/booking/cal-payload.ts`, `src/lib/handoff-intake.ts`, `src/app/api/webhooks/booking/route.ts`
- **Data-flow impact** — HQ booking intake gains an optional `chat_session_id`. Assessment bookings are unchanged.
- **API / schema impact** — none on the check app. The HQ activity JSON stores the id when it is present.
- **Verification** — `npx vitest run tests/unit/assessment-suggest.test.ts tests/unit/handoff-intake.test.ts`

## Plain-language questions — 2026-10-19

- **What changed** — Question prompts and answer labels in the readiness check are rewritten in plain, human wording at about a grade 5 reading level. Jargon such as "system of record", "reconciled by hand", "workflow", and "answer engines" is gone.
- **Why** — Match the plain voice of the blog posts so owners can answer without decoding the question.
- **Code touchpoints** — `src/lib/assessment/config.v1.json` (only `prompt` and `label` text)
- **Data-flow impact** — none
- **API / schema impact** — none. Ids, values, scores, bands, and offers are unchanged, so saved answers and scoring behave as before. The design spec in `docs/superpowers/specs/` still quotes the original wording as a historical record.
- **Verification** — `npm test` (239 passed), `npm run lint` (0 errors)

## Schema mint heat + CTA — 2026-10-19

- **What changed** — Score ring/bars/Strong labels use studio heat (vermilion → amber → cyan → mint `#C6FFB3`). Scan CTA is full `#FF4B24` with dark text; disabled uses muted surface instead of washed vermilion.
- **Why** — Match Abracadabra tokens; remove generic green and muddy CTA.

## Schema scanner studio tokens — 2026-10-19

- **What changed** — Schema landing (`/`), `/scan`, ops, and the Schema PDF use the same Abracadabra studio tokens as `/check` and marketing (dark canvas, vermilion accent, Inter Tight + IBM Plex Sans). Editorial cream/slate styling is removed.
- **Why** — One design language across Abracadabra-owned surfaces.


## Fonts aligned with marketing — 2026-10-19

- **What changed** — Schema scanner, ops, `/check`, and both PDFs use Inter Tight for headings and labels, IBM Plex Sans for body. Newsreader, Tektur, and IBM Plex Mono are retired from visitor-facing type.
- **Why** — Keep every Abracadabra-owned surface on the same type roles as `abra-ca-dabra.app`.


## 2026-10-14 — The check declares its sitemap

- **What changed** — `robots.ts` allows crawlers and points them at `${checkUrl()}/sitemap.xml`. The pressure and readiness guides link to the matching studio notes.
- **Why** — The check app had a sitemap and no robots file, so crawlers were not told where the sitemap lived.
- **Code touchpoints** — `src/app/robots.ts`, `src/content/check-guides/index.ts`, `src/components/check/GuideArticle.tsx`
- **Data-flow impact** — none
- **API / schema impact** — none
- **Verification** — `npx vitest run tests/unit/robots.test.ts tests/unit/assessment-config.test.ts`

## 2026-10-08 — A finished staff scan wakes the lead

- **What changed** — A completed or failed scan that belongs to an organization sends `scan_ready` on `lead-intake`. A finished scan stays finished if a later step throws. Only scans with no organization count toward the public daily cap.
- **Why** — The agent was waking before the scan existed, a later error could flip a successful scan to failed, and staff scans were using the public 3-per-domain limit.
- **Code touchpoints** — `src/lib/jobs/scan-ready.ts`, `src/lib/jobs/run-cloudflare.ts`, `src/lib/scan/d1-store.ts`, `src/lib/scan/orchestrator.ts`
- **Data-flow impact** — `runCloudflareJob` notifies after `runScan`. A retry of a finished scan returns without scanning again.
- **API / schema impact** — none. The existing `lead-intake` queue carries `{ source, organizationId, scanId, status }`.
- **Verification** — `npx vitest run tests/unit/d1-scan-store.test.ts tests/unit/scan-ready.test.ts`.

## 2026-10-07 — The schema scan report uses the studio design

- **What changed** — The public scan report uses the studio canvas, Tektur, and accent. An ops scan opens the full page matrix without the email gate, so the lead's report link shows the findings.
- **Why** — The scan report still used the editorial theme, and the staff link would have stopped at the email gate.
- **Code touchpoints** — `src/app/scan/layout.tsx`, `src/app/scan/[token]/page.tsx`, `src/app/api/scans/[token]/route.ts`, `src/lib/scan/unlock.ts`
- **Data-flow impact** — `GET /api/scans/{token}` returns the unlocked payload when the scan source is `ops`.
- **API / schema impact** — Ops scan responses include pages and findings without the unlock cookie.
- **Verification** — `npx vitest run tests/unit/unlock-gate.test.ts tests/unit/d1-scan-store.test.ts`.

## 2026-10-07 — Schema results show the scan report

- **What changed** — Every site in a schema check queues a full scan. HQ shows that scan's score, pillars, pages, and findings, including sites that do not become a lead.
- **Why** — The schema page only showed the short verdict. The scan report is the detailed record.
- **Code touchpoints** — `src/lib/ops/schema-check.ts`, `migrations/0011_schema_check_scan.sql`, `handoff/src/app/schema/page.tsx`
- **Data-flow impact** — Covered and unread sites now enqueue `scan-jobs` the same way a needs-us site does. The site row stores `scan_id`.
- **API / schema impact** — `schema_check_sites.scan_id`.
- **Verification** — `npx vitest run tests/unit/schema-check.test.ts`.

## 2026-10-07 — Schema ops is a Handoff menu item

- **What changed** — HQ has a Schema item. A check lists every site. A site that needs us becomes a lead, and contacts found on the page are saved on that lead.
- **Why** — Schema ops belongs with the rest of the studio, and a covered site still needs a result.
- **Code touchpoints** — `handoff/src/app/schema/page.tsx`, `handoff/src/app/staff-nav.tsx`, `handoff/migrations/0010_schema_checks.sql`, `readiness-check/src/lib/ops/schema-check.ts`, `readiness-check/src/lib/ai-search/prospect.ts`
- **Data-flow impact** — HQ inserts `schema_checks` and asks the readiness-check worker to read each homepage. Covered and unread sites stay on the result list. `NEEDS_US` still opens an organization, a deal, and a scan.
- **API / schema impact** — D1 tables `schema_checks` and `schema_check_sites`. Prospect jobs accept an optional `checkId`.
- **Verification** — readiness-check `npx vitest run` on the prospect, schema, and nav tests. handoff `npx tsc --noEmit` and the migration test.

## 2026-10-07 — The readiness questionnaire uses Cloudflare D1

- **What changed** — Starting a check, saving an answer, scoring it, and leaving an email write `check_assessments` in D1. An email also files the finished check on the Handoff client record.
- **Why** — The live Worker has no Supabase credentials, so the questionnaire could not open a session.
- **Code touchpoints** — `src/lib/assessment/d1-admin.ts`, `src/lib/assessment/actions.ts`, `src/app/check/start/route.ts`, `src/app/api/assessments/route.ts`, `src/app/api/assessments/[token]/route.ts`, `migrations/0002_check_assessments.sql`
- **Data-flow impact** — Public check routes no longer call Supabase. Completing a check does not send Inngest when D1 is bound. A website answer still queues `scan-jobs`.
- **API / schema impact** — New D1 tables `check_assessments` and `check_assessment_events`. Response shapes are unchanged.
- **Verification** — `npx vitest run` (225 passed). `npx eslint` on the touched files.

## 2026-10-07 — URL scans and prospecting use Cloudflare, not Supabase

- **What changed** — Submitting a website URL writes a scan in D1 and queues `scan-jobs`. The prospect form queues the same worker. A site that needs us becomes a Handoff lead and a new deal. The public scan page reads that D1 row.
- **Why** — The live Worker had no Supabase credentials, so submit returned a 500 the form showed as a network error.
- **Code touchpoints** — `src/app/api/scans/route.ts`, `src/app/api/scans/[token]/route.ts`, `src/app/api/ops/prospect/route.ts`, `src/app/api/internal/jobs/route.ts`, `src/lib/scan/d1-store.ts`, `src/lib/ops/d1-prospect-store.ts`, `cloudflare-worker.ts`, `migrations/0001_readiness_scans.sql`
- **Data-flow impact** — Public and prospect scans no longer insert Supabase `scans`. Prospecting no longer sends an Inngest event. The queue calls `/api/internal/jobs` with the Cloudflare API token as `x-job-token`.
- **API / schema impact** — New D1 tables `readiness_scans`, `readiness_scan_pages`, `readiness_scan_findings` on database `handoff`. `POST /api/scans` and `POST /api/ops/prospect` response shapes are unchanged.
- **Verification** — `npx vitest run` (224 passed). `npx eslint` on the touched files (no new errors).

## 2026-10-06 — Finished checks and bookings can open a Handoff lead

- **What changed** — When an assessment finishes and the row has an email, the `assessment-completed` job POSTs a signed body to Handoff. Saving an email later sends that event again. After a Cal.com booking checks out, the same job posts a signed booking body. Handoff still checks Cal's signature here first.
- **Why** — Step 3 of the agency dashboard. The check stays on Vercel. New leads go to Handoff.
- **Code touchpoints** — `src/lib/handoff-intake.ts`, `src/inngest/functions/assessment-completed.ts`, `src/lib/assessment/actions.ts`, `src/app/api/webhooks/booking/route.ts`
- **Data-flow impact** — The person's result still saves in Supabase. The Handoff POST runs after that. A missing `HANDOFF_INTAKE_ORIGIN` or `INTAKE_SIGNING_SECRET` skips the POST. A response other than 202 throws so the job can retry.
- **API / schema impact** — Env `HANDOFF_INTAKE_ORIGIN` and `INTAKE_SIGNING_SECRET`. No schema change.
- **Verification** — `npm test` (198 passed) and `npm run lint`.

## 2026-09-24 — Readiness Check uses the studio design system

- **What changed** — `/check` (landing, questions, gate, guides, on-screen results) and the assessment PDF use the Abracadabra marketing tokens: dark canvas, Inter Tight display/labels, IBM Plex Sans body, clipped panels, and the accent CTA. Primary button text is canvas ink (`#070706`) on `#FF4B24` so contrast clears the check’s axe gate. Score heat colors on the rings and meters are unchanged. Schema scan and ops stay on the editorial theme.
- **Why** — The check was still the Schema light theme while the public host sits next to the studio site.
- **Code touchpoints** — `src/lib/brand/studio.ts`, `src/app/globals.css`, `src/app/check/layout.tsx`, check components under `src/components/check/`, `src/lib/pdf/assessment-report.tsx`, `tests/unit/studio-tokens.test.ts`
- **Data-flow impact** — none
- **API / schema impact** — none
- **Verification** — `npm test`; `npm run lint`

## 2026-09-23 — Readiness Check

Shipped the Readiness Check inside Schema: `/check`, token sessions, email gate, four scores, suggestions, offers, PDF download, Cal.com embed with a mailto fallback, booking webhook, and an ops Check column.

Production still needs, and this commit does not invent:

- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the live Schema Vercel project (the public scan form still fails with "Missing Supabase admin env" until those exist).
- `NEXT_PUBLIC_CAL_LINK` and `CAL_WEBHOOK_SECRET` once a Cal.com "Working session" event and webhook exist. Until the link is set, the results page offers `mailto:houdini@abra-ca-dabra.app`.
- DNS for `check.abra-ca-dabra.app` pointed at this deployment, with `NEXT_PUBLIC_CHECK_URL=https://check.abra-ca-dabra.app`.
