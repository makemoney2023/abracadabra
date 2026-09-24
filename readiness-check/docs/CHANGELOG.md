# Changelog

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
