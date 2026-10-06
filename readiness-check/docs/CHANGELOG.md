# Changelog

## 2026-10-06 — Readiness Check runs on Cloudflare

- **What changed** — Worker `readiness-check` is the public host `check.abra-ca-dabra.app`. Scan and prospect jobs go on queue `scan-jobs`. The abandoned-assessment sweep is cron `0 8 * * *`. A finished assessment and a checked Cal booking publish `{ source, payload }` to queue `lead-intake`. Ops sign-in is the `rc_ops` cookie. Turnstile sits on the email gate when `TURNSTILE_SECRET_KEY` is set.
- **Why** — The check leaves Vercel, Supabase, and Inngest. The dashboard stays the CRM.
- **Code touchpoints** — `cloudflare-worker.ts`, `wrangler.jsonc`, `open-next.config.ts`, `src/lib/jobs.ts`, `src/lib/d1/admin.ts`, `src/lib/ops/auth.ts`, `src/lib/turnstile.ts`, `migrations/0006_readiness.sql`
- **Data-flow impact** — The check writes only `rc_` tables. It does not write CRM rows or `intake_receipts`. Worker `handoff` consumes `lead-intake` and writes those. Old Supabase rows are not copied.
- **API / schema impact** — `POST /api/ops/login`. `/api/inngest` is removed. D1 migration `0006_readiness.sql`.
- **Verification** — `npm test` (219 passed) and `npx eslint . --max-warnings 0`. Worker version `93bdfa2e-b416-4bef-8ec7-e62baf6ab86c`. `https://check.abra-ca-dabra.app/check` HTTP/2 200, `server: cloudflare`, title "Readiness Check", no `x-vercel-id`, via anycast `104.21.74.23`.

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
