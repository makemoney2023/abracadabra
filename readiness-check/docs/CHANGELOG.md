# Changelog

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

- **What changed** — `/check` (landing, questions, gate, guides, on-screen results) and the assessment PDF use the Abracadabra marketing tokens: dark canvas, Tektur display, IBM Plex Sans, clipped panels, and the accent CTA. Primary button text is canvas ink (`#070706`) on `#FF4B24` so contrast clears the check’s axe gate. Score heat colors on the rings and meters are unchanged. Schema scan and ops stay on the editorial theme.
- **Why** — The check was still the Schema light theme while the public host sits next to the studio site.
- **Code touchpoints** — `src/lib/brand/studio.ts`, `src/app/globals.css`, `src/app/check/layout.tsx`, check components under `src/components/check/`, `src/lib/pdf/assessment-report.tsx`, `tests/unit/studio-tokens.test.ts`
- **Data-flow impact** — none
- **API / schema impact** — none
- **Verification** — `npm test`; `npm run lint`

## 2026-09-23 — Readiness Check

Shipped the Readiness Check inside Schema: `/check`, token sessions, email gate, four scores, suggestions, offers, PDF download, Cal.com embed with a mailto fallback, booking webhook, and an ops Check column.

Production still needs, and this commit does not invent:

- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the live Schema Vercel project (the public scan form still fails with "Missing Supabase admin env" until those exist).
- `NEXT_PUBLIC_CAL_LINK` and `CAL_WEBHOOK_SECRET` once a Cal.com "Working session" event and webhook exist. Until the link is set, the results page offers `mailto:dev@pirx.ca`.
- DNS for `check.abra-ca-dabra.app` pointed at this deployment, with `NEXT_PUBLIC_CHECK_URL=https://check.abra-ca-dabra.app`.
