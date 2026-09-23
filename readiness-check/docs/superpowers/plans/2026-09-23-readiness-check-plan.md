# Readiness Check — Implementation Plan

**Date:** 2026-09-23
**Spec:** [2026-09-23-readiness-check-design.md](./2026-09-23-readiness-check-design.md)
**Gameplan:** [../lead-survey-gameplan.md](../lead-survey-gameplan.md)
**Repo where the work lands:** Schema (`makemoney2023/schema`). Paths below are relative to the Schema repo root unless marked `Abracadabra/`. Copy this plan into Schema's `docs/superpowers/plans/` when work starts.

> **For agentic workers:** work one task at a time, in order, in a fresh branch per phase (`feat/readiness-check-p<N>`). Each task lists the files it touches and ends with a runnable check and a commit. Steps use checkbox (`- [ ]`) syntax; tick them as you go. Write the failing test first where a test is listed. Do not skip ahead to UI before the domain module is green.

---

## Goal

Ship the Readiness Check inside Schema: a token-scoped, five-to-seven-minute check that scores pressure, readiness, growth, and website visibility (via the existing scanner), gates results behind an email, shows suggestions and an offer map, embeds a Cal.com booking, and lands every completion — booked or not — in `/ops`.

## Architecture

One new pure domain module `src/lib/assessment/` (config, scorer, suggestions, offers, presentation, scan-link), one migration, thin App Router routes under `src/app/api/assessments/**`, a Cal.com webhook, UI under `src/app/check/**` reusing the scan components, and indexable guide pages with JSON-LD. Existing scan, opt-in, ops queue, and Inngest paths are reused, not forked.

## Tech stack

Already present: Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui, zod 4, Supabase (Postgres, RLS, service role), Inngest 4, `@react-pdf/renderer`, react-hook-form, Vitest 4, Playwright, `nanoid`.
Added: `@calcom/embed-react`.
New env: `NEXT_PUBLIC_CHECK_URL`, `NEXT_PUBLIC_CAL_LINK`, `CAL_WEBHOOK_SECRET` (placeholders only in `.env.example`; never commit values).

## Working rules

- Scoring stays deterministic and config-driven. No LLM anywhere in the scoring or suggestion path.
- Copy obeys `Abracadabra/docs/source-of-truth.md` › Brand. Banned words: "streamline", "leverage" (except the product name LLM Leverage), "innovative", "transformational". No invented numbers. Non-diagnostic.
- Public routes use the service-role admin client and `nanoid(24)` tokens, exactly like `src/app/api/scans/route.ts`.
- Error envelope everywhere: `{ error, message?, details? }`.
- One commit per task. Commit message prefix `check:`.

---

## File structure (create as tasks progress)

```
Schema/
├── .env.example                                   (+3 keys, placeholders)
├── package.json                                   (+ @calcom/embed-react)
├── supabase/migrations/
│   └── 20260923000000_readiness_check.sql
├── src/lib/assessment/
│   ├── config.v1.json
│   ├── config-schema.ts
│   ├── config.ts                                  (loads + validates, exports CONFIG_VERSION)
│   ├── types.ts
│   ├── bands.ts
│   ├── score.ts
│   ├── suggest.ts
│   ├── offers.ts
│   ├── present.ts
│   ├── scan-link.ts
│   ├── repository.ts
│   ├── supabase-repository.ts
│   ├── steps.ts                                   (step order, next/prev)
│   ├── validate-answer.ts
│   ├── ip-limit.ts
│   └── *.test.ts
├── src/lib/booking/
│   ├── cal-signature.ts
│   ├── cal-payload.ts
│   └── *.test.ts
├── src/lib/ops/priority.ts                        (extended)
├── src/lib/seo/
│   ├── json-ld.ts
│   └── check-metadata.ts
├── src/lib/pdf/
│   └── assessment-report.tsx
├── src/inngest/functions/
│   ├── assessment-completed.ts
│   └── assessment-sweep.ts
├── src/app/api/assessments/
│   ├── route.ts                                   (POST create)
│   └── [token]/
│       ├── route.ts                               (GET, PATCH)
│       ├── complete/route.ts
│       ├── opt-in/route.ts
│       ├── pdf/route.ts
│       └── events/route.ts
├── src/app/api/webhooks/booking/route.ts
├── src/app/api/ops/assessments/[token]/route.ts
├── src/app/check/
│   ├── layout.tsx
│   ├── page.tsx                                   (landing, indexable)
│   ├── start/route.ts                             (POST → redirect to /check/[token])
│   ├── [token]/page.tsx                           (in-progress + gate + results)
│   ├── [token]/opengraph-image.tsx                (band-only, only when opted in; else generic)
│   └── guide/
│       ├── [section]/page.tsx
│       ├── band/[band]/page.tsx
│       └── fix/[code]/page.tsx
├── src/components/check/
│   ├── StepShell.tsx
│   ├── ProgressSegments.tsx
│   ├── questions/
│   │   ├── MultiSelect.tsx
│   │   ├── SeverityPicker.tsx
│   │   ├── SingleSelect.tsx
│   │   ├── TextField.tsx
│   │   └── UrlField.tsx
│   ├── GateForm.tsx
│   ├── results/
│   │   ├── BandHeader.tsx
│   │   ├── SectionCard.tsx
│   │   ├── ReadinessCard.tsx
│   │   ├── VisibilityCard.tsx
│   │   ├── GrowthCard.tsx
│   │   ├── PressureCard.tsx
│   │   ├── SuggestionList.tsx
│   │   ├── OfferBlocks.tsx
│   │   ├── BookingCard.tsx
│   │   └── ReportActions.tsx
│   └── landing/
│       ├── Hero.tsx
│       ├── WhatWeMeasure.tsx
│       └── CheckFaq.tsx
├── src/content/check-guides/
│   ├── sections/{pressure,readiness,growth,visibility}.mdx
│   ├── bands/{early,forming,ready,running}.mdx
│   └── fixes/<code-kebab>.mdx                      (one per suggestion + finding code)
├── src/components/ops/QueueTable.tsx              (+ Check column)
├── src/components/ops/LeadSheet.tsx               (+ Check tab)
├── src/app/sitemap.ts                             (+ guide pages)
├── src/app/llms.txt/route.ts                      (+ guide pages)
└── e2e/check.spec.ts

Abracadabra/scrollcraft/builds/abracadabra-ai/       (Phase 5 only)
├── hero, "Situation" act, close: link to check
├── llms.txt, sitemap.xml                          (+ check URLs)
└── FAQPage entry
```

---

## Phase 0 — Unblock and decide

Goal: the Schema app runs end to end locally and in production, and every default in spec §4 is either accepted or changed in one place.

### Task 0.1 — Fix "Missing Supabase admin env" on the live Schema form
**Files:** Vercel project env for Schema (no code unless a name mismatch is found).
- [ ] Read `src/lib/supabase/` to confirm the exact env names the admin client expects.
- [ ] Compare against the Schema Vercel project's Production env; add the missing key(s) by name only.
- [ ] Redeploy; submit a public scan on schema-two.vercel.app; confirm a `scans` row and an Inngest run.
- [ ] Record in Schema `docs/CHANGELOG.md` (newest on top): "Fixed missing admin env in production."

### Task 0.2 — Lock decisions
**Files:** `Abracadabra/docs/readiness-check/2026-09-23-readiness-check-design.md` §4 (only if a default changes).
- [ ] Confirm or change: name, hostname, gate mode, booking provider, ops notification.
- [ ] If anything changes, edit the spec table and this plan's affected tasks in the same commit.

### Task 0.3 — Cal.com account and event type
**Files:** none in repo.
- [ ] Create the studio Cal.com account; event type `working-session`, 30 min, host = studio calendar, buffer and availability set.
- [ ] Enable booking questions: name, email (default); allow `metadata` prefill.
- [ ] Create a webhook subscription (trigger: `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`) pointing at `https://<schema-prod-host>/api/webhooks/booking` with a generated secret. Leave it disabled until Task 4.3 ships.
- [ ] Store the secret in Vercel as `CAL_WEBHOOK_SECRET`; store the public link as `NEXT_PUBLIC_CAL_LINK`.

### Task 0.4 — Env and dependency scaffolding
**Files:** `.env.example`, `package.json`, `src/lib/env.ts` (or wherever env is read).
- [ ] Add `NEXT_PUBLIC_CHECK_URL=`, `NEXT_PUBLIC_CAL_LINK=`, `CAL_WEBHOOK_SECRET=` to `.env.example` as empty placeholders.
- [ ] `npm i @calcom/embed-react`.
- [ ] Add typed accessors for the three vars; `CAL_WEBHOOK_SECRET` is server-only.
- [ ] Run: `npm run build` passes.
- [ ] Commit: `check: scaffold env and booking dependency`.

### Task 0.5 — Hostname
**Files:** Vercel (Schema project), Vercel DNS for abra-ca-dabra.app.
- [ ] Add `check.abra-ca-dabra.app` as a domain on the Schema project; add the CNAME in the abra-ca-dabra.app zone (Vercel nameservers).
- [ ] Set `NEXT_PUBLIC_CHECK_URL=https://check.abra-ca-dabra.app` in Production and Preview.
- [ ] Verify TLS and that `/` on the new host renders the current Schema landing (canonical work comes in Task 5.4).

---

## Phase 1 — Config and domain module (pure, tested)

Goal: `scoreAssessment`, `selectSuggestions`, `mapPressuresToOffers`, and `present` are green under Vitest with no I/O.

### Task 1.1 — Types and config schema
**Files:** `src/lib/assessment/types.ts`, `src/lib/assessment/config-schema.ts`, `src/lib/assessment/config-schema.test.ts`.
- [ ] Define `AssessmentScores`, `Answer` union (`multi_select`, `severity`, `single_select`, `text`, `url`), `Suggestion`, `Offer`, `Band`.
- [ ] zod schema for the config: `meta { name, version }`, `sections[]`, `questions[]` (id, sectionId, type, prompt, options[{ value, label, score }], dim?, offerRow?, maxLength?), `weights { readiness, visibility, growth, fallbackWithoutVisibility }`, `bands[{ id, min, max, label, sentence }]`, `suggestions[]`, `offers[]`, `copy`.
- [ ] Refinements: question ids unique; every `offerRow` referenced by a P-question exists in `offers`; band ranges are contiguous 0–100; `guideSlug` unique.
- [ ] Test: a minimal valid config passes; each refinement fails with a readable path.
- [ ] Commit: `check: assessment types and config schema`.

### Task 1.2 — Write `config.v1.json`
**Files:** `src/lib/assessment/config.v1.json`, `src/lib/assessment/config.ts`, `src/lib/assessment/config.test.ts`.
- [ ] Transcribe spec §7 (P01–P12 with `offerRow` and severity labels, R01–R08, G01–G04, Q01–Q04), §8 weights and bands, §9 suggestion library (title/body/guideSlug for every code) and offer map (row, said, build, specimens — cleared names only).
- [ ] `config.ts` imports the JSON, parses with the schema at module load, exports `config`, `CONFIG_VERSION = "v1"`.
- [ ] Test: the real config validates; count of P questions is 12, R is 8, G is 4, Q is 4; every suggestion `guideSlug` is kebab-case; no banned word appears in any string (regex test over the whole JSON, allowing "LLM Leverage").
- [ ] Commit: `check: v1 question bank, suggestions, offer map`.

### Task 1.3 — Step engine and answer validation
**Files:** `src/lib/assessment/steps.ts`, `src/lib/assessment/validate-answer.ts`, tests.
- [ ] `getSteps(config, answers)` returns the ordered step list: pressure multi-select → one severity step per selected symptom → R01–R08 → G01–G03 → G04 → Q01–Q04 → `gate` → `results`.
- [ ] `nextStep(config, answers, currentStepId)` / `prevStep(...)`; `firstStep(config)`.
- [ ] `validateAnswer(config, stepId, answer)` returns `{ ok: true, value } | { ok: false, details }`; url answers normalized with `normalizeDomain` from `src/lib/domain.ts`; text capped by `maxLength`.
- [ ] Test: severity steps appear only for selected symptoms and disappear when a symptom is deselected; invalid option value rejected; URL normalization produces `{ domain, origin }`.
- [ ] Commit: `check: step engine and answer validation`.

### Task 1.4 — Scorer
**Files:** `src/lib/assessment/bands.ts`, `src/lib/assessment/score.ts`, `src/lib/assessment/score.test.ts`.
- [ ] `bandFor(total, config)`.
- [ ] `scoreAssessment({ answers, scan: { status, scoreTotal, breakdown } | null, config }) → AssessmentScores` per spec §8: sub-dimension mean/3×100 with `incomplete` flag; readiness mean of four; growth from G01–G03; visibility complete/pending/unavailable; overall with weight fallback and `weights` recorded; pressures ordered by severity desc then selection order; `topPressure`.
- [ ] Test: fixtures for all-zero, all-three, mixed; every band boundary (39/40, 59/60, 79/80); visibility null re-weights to 0.7/0.3 and records it; pressure ordering with ties; unanswered sub-dimension scores 0 and is `incomplete`; same input twice gives deep-equal output.
- [ ] Commit: `check: deterministic scorer`.

### Task 1.5 — Suggestions and offers
**Files:** `src/lib/assessment/suggest.ts`, `src/lib/assessment/offers.ts`, tests.
- [ ] `selectSuggestions({ scores, answers, scan, config })` → `Record<"readiness"|"growth"|"visibility", Suggestion[]>`, max three per section, severity order, triggers per spec §9 table; visibility maps Schema `priorityFixes` codes to `fix/<code-kebab>` via `src/lib/scoring/findings.ts` labels; `VIS_PENDING` / `VIS_UNAVAILABLE` fallbacks.
- [ ] `mapPressuresToOffers({ pressures, config })` → top three by severity; empty input → `[custom_fit]`.
- [ ] Test: each trigger row; `READY_STRONG` only when all four ≥ 70; cap at three; every Schema finding code in `findings.ts` has a `fix/` guide slug mapping (guards against a new finding code shipping without a guide).
- [ ] Commit: `check: suggestion selection and offer mapping`.

### Task 1.6 — Presentation projection
**Files:** `src/lib/assessment/present.ts`, `present.test.ts`.
- [ ] `selectAssessmentPayload(record, { optedIn, scanView, calLink })` → `{ status, currentStep, answers, qualifiers, scores?, gated, results? }`; `results: ResultsPayload` (spec §12) only when opted in; `booking` uses `calLink` or the `mailto:` fallback; `scan` block mirrors `selectScanPayload` base fields.
- [ ] Test: gated payload has no `results` and no `email`; opted-in payload includes suggestions, offers, booking prefill with `metadata[assessment]`; fallback mailto includes domain and band.
- [ ] Commit: `check: results payload projection`.

### Task 1.7 — Scan-link decision
**Files:** `src/lib/assessment/scan-link.ts`, `scan-link.test.ts`.
- [ ] `decideScanLink({ domain, findNewestCompletedWithin24h, countRecentPublicScans, findNewestAny })` returns `{ action: "reuse", scanId } | { action: "create" } | { action: "unavailable" }` per spec §12 pseudocode; all dependencies injected.
- [ ] Test: all four branches with stubs.
- [ ] Commit: `check: scan create-or-reuse decision`.

---

## Phase 2 — Persistence and API

Goal: the full server path works via `curl`: create → answer → URL step triggers/reuses a scan → complete → opt-in → gated payload.

### Task 2.1 — Migration
**Files:** `supabase/migrations/20260923000000_readiness_check.sql`.
- [ ] Paste spec §6 SQL verbatim (enum value `booked`, `assessment_status`, `appointment_status`, `assessments`, `assessment_events`, `appointments`, `ops_queue.assessment_id`, indexes, RLS, policies).
- [ ] Add `updated_at` trigger reuse if `init.sql` defines one; else add a small `set_updated_at()` for the two new tables.
- [ ] Run: `supabase db reset` locally; `supabase gen types typescript --local` updates `src/lib/supabase/types.ts` (or the project's equivalent).
- [ ] Commit: `check: migration for assessments, events, appointments`.

### Task 2.2 — Repository
**Files:** `src/lib/assessment/repository.ts`, `src/lib/assessment/supabase-repository.ts`, `supabase-repository.test.ts` (integration, gated on local Supabase like the scan repo tests).
- [ ] Interface: `create({ token, configVersion, utm })`, `getByToken`, `updateAnswers(id, { answers, qualifiers, currentStep, domain? })`, `setScan(id, scanId)`, `complete(id, scores)`, `optIn(id, { email, name, leadId })`, `addEvent(id, kind, data)`, `listEvents(id)`, `findAbandoned(olderThan)`, `markAbandoned(ids)`.
- [ ] Supabase implementation with the admin client; follows `src/lib/scan/supabase-repository.ts` conventions.
- [ ] Test: round-trip create → update → complete → opt-in; events ordered by `created_at`.
- [ ] Commit: `check: assessment repository`.

### Task 2.3 — Create and read routes
**Files:** `src/app/api/assessments/route.ts`, `src/app/api/assessments/[token]/route.ts`, `src/lib/assessment/ip-limit.ts`, route tests.
- [ ] `POST /api/assessments`: zod `{ utm?: Record<string,string> }`; soft IP limit 20/day (in-memory Map keyed on hashed IP, TTL 24 h); insert with `nanoid(24)`; event `started`; `201 { token, configVersion, firstStep }`.
- [ ] `GET /api/assessments/[token]`: load record; if `scan_id` set, load scan via `loadScanByPublicToken`-equivalent by id and re-run `scoreAssessment` when stored visibility was `pending` and scan is now `complete` (persist the refreshed scores); return `selectAssessmentPayload` with `optedIn = !!opted_in_at`.
- [ ] Test: 404 on bad token; 429 after limit; gated vs opted-in shape.
- [ ] Commit: `check: create and read assessment routes`.

### Task 2.4 — Answer route with scan link
**Files:** `src/app/api/assessments/[token]/route.ts` (PATCH), `src/lib/assessment/scan-link.ts` (wire real deps), tests.
- [ ] `PATCH`: zod `{ stepId, answer }`; `validateAnswer`; persist; compute `nextStep`; if `stepId === "G04"`, run `decideScanLink` with real Supabase queries and `countRecentPublicScans`; on `create`, reuse the exact insert + `inngest.send({ name: "scan/requested" })` logic from `src/app/api/scans/route.ts` (extract a shared `createPublicScan()` helper in `src/lib/scan/create.ts` rather than duplicating); set `assessments.scan_id`, event `scan_requested { scanId, reused }`; on failure, event with `error` and continue.
- [ ] Response `{ ok, nextStep, scan?: { id, token, status, reused } }`.
- [ ] Test: URL step creates a scan when allowed; reuses when rate-limited; survey continues when scan creation throws.
- [ ] Commit: `check: answer route and scan linking`.

### Task 2.5 — Complete and opt-in routes
**Files:** `src/app/api/assessments/[token]/complete/route.ts`, `src/app/api/assessments/[token]/opt-in/route.ts`, `src/lib/scan/opt-in.ts` (source parameter), tests.
- [ ] `complete`: idempotent; scores via `scoreAssessment`; `status = completed`, `completed_at`; event `completed`; `inngest.send({ name: "assessment/completed", data: { assessmentId } })`; `200 { ok, band }`.
- [ ] `opt-in`: zod `{ email, name? }`; require `status = completed`; call `applyPublicOptIn` (extend it to accept `source` with default `"public_opt_in"`, pass `"readiness_check"`); set `assessments.lead_id`, `email`, `name`, `opted_in_at`; set `ops_queue.assessment_id`; set the scan unlock cookie via `unlockCookieName(scanToken)` when a scan exists; event `opted_in`; return `{ ok, leadId, results }`.
- [ ] Test: complete twice returns the same band and one `completed` event; opt-in before complete → 409; second opt-in with the same email does not create a second queue row.
- [ ] Commit: `check: complete and opt-in routes`.

### Task 2.6 — Client events and ops read route
**Files:** `src/app/api/assessments/[token]/events/route.ts`, `src/app/api/ops/assessments/[token]/route.ts`, tests.
- [ ] `events`: allow-list `results_viewed`, `booking_opened`, `pdf_downloaded`; 400 otherwise.
- [ ] Ops route: `requireOps()`; returns full record + events + appointment.
- [ ] Commit: `check: client events and ops read route`.

### Task 2.7 — Ops priority extension
**Files:** `src/lib/ops/priority.ts`, `src/lib/ops/priority.test.ts`, callers in `src/lib/ops/queue.ts` and the opt-in path.
- [ ] Extend `computeOpsPriority({ scoreTotal, hasContact, readiness?, topPressureSeverity?, booked? })` per spec §11; existing two-argument calls unchanged.
- [ ] Recompute priority on opt-in (readiness and pressure now known) and on booking.
- [ ] Test: old inputs give old outputs; each new term adds its bonus.
- [ ] Commit: `check: ops priority accounts for readiness, pressure, booking`.

### Task 2.8 — Inngest functions
**Files:** `src/inngest/functions/assessment-completed.ts`, `src/inngest/functions/assessment-sweep.ts`, `src/inngest/functions/index.ts` (register), tests.
- [ ] `assessment-completed`: trigger `assessment/completed`; v1 body logs and returns (reserved for nurture).
- [ ] `assessment-sweep`: cron daily; `findAbandoned(48h)`; mark `abandoned`; for rows with `domain` and no `lead_id`, upsert lead `source: "readiness_check_partial"` and `ops_queue` row with `missing_contact: true`, priority via `computeOpsPriority`.
- [ ] Test: sweep with a fixture set; idempotent on re-run.
- [ ] Commit: `check: completion event and abandonment sweep`.

---

## Phase 3 — Public UI: check flow, gate, results, PDF

Goal: a person can complete the check on a phone from `/check` to results without dev tools.

### Task 3.1 — Layout, start, and step shell
**Files:** `src/app/check/layout.tsx`, `src/app/check/start/route.ts`, `src/app/check/[token]/page.tsx`, `src/components/check/StepShell.tsx`, `src/components/check/ProgressSegments.tsx`.
- [ ] `start` route handler: POST → create assessment (pass through `utm_*` query params) → redirect to `/check/[token]`.
- [ ] `[token]/page.tsx` (server): fetch payload; branch on `status` and `gated`: in-progress → `StepShell`; completed and gated → `GateForm`; opted in → results.
- [ ] `StepShell` (client): renders the current question component, Back/Next, autosaves via `PATCH` on change (optimistic, with inline error and retry), keyboard navigation, focus management, `ProgressSegments` by section.
- [ ] Commit: `check: step shell and start route`.

### Task 3.2 — Question components
**Files:** `src/components/check/questions/*.tsx`.
- [ ] `MultiSelect` (chips, zero allowed), `SeverityPicker` (three options with the severity copy), `SingleSelect` (radio cards, 0–3), `TextField` (length counter), `UrlField` (inline `normalizeDomain` feedback; on success shows "We're reading your site while you finish.").
- [ ] All components: label association, `aria-describedby` for errors, 44 px targets, no color-only meaning.
- [ ] Commit: `check: question components`.

### Task 3.3 — Gate
**Files:** `src/components/check/GateForm.tsx`.
- [ ] Headline "Your check is scored.", greyed band name, email (required) + name (optional), consent line per spec §10, submit → `opt-in` → router refresh to results; retry state on 500.
- [ ] Commit: `check: results gate`.

### Task 3.4 — Results page
**Files:** `src/components/check/results/*.tsx`, `src/app/check/[token]/page.tsx`.
- [ ] `BandHeader` (band + sentence with top pressure), `ReadinessCard` (`ScoreRing` + four `PillarMeter`s), `VisibilityCard` (`ScoreRing`, five pillars from `breakdown`, link to `/scan/[token]`; pending state polls `GET` every 5 s up to 3 min then shows `VIS_UNAVAILABLE`), `GrowthCard`, `PressureCard` (severity chips), `SuggestionList` (reuses `FindingsList` styling; links to guides), `OfferBlocks` (top three offers; `custom_fit` when none), `BookingCard` (placeholder until Task 4.1; renders the `mailto:` fallback now), `ReportActions` (Download report, Open the full site scan).
- [ ] Post `results_viewed` once on mount.
- [ ] `noindex, nofollow` metadata for `/check/[token]`.
- [ ] Commit: `check: results page`.

### Task 3.5 — PDF report
**Files:** `src/lib/pdf/assessment-report.tsx`, `src/app/api/assessments/[token]/pdf/route.ts`.
- [ ] Follow `src/lib/pdf/` patterns; sections: band, four scores, suggestions, offers, scan top gaps, "book a working session" with the Cal.com link or mailto.
- [ ] Route: requires `opted_in_at`; streams `application/pdf`; event `pdf_downloaded` (server-side, so the client event is optional).
- [ ] Test: route returns 200 and a PDF magic number for an opted-in fixture; 403 otherwise.
- [ ] Commit: `check: downloadable report`.

---

## Phase 4 — Booking and ops

Goal: a booking made from the results page appears in `/ops` as `booked` with the appointment time.

### Task 4.1 — Cal.com embed
**Files:** `src/components/check/results/BookingCard.tsx`.
- [ ] Inline `@calcom/embed-react` with `calLink` from `NEXT_PUBLIC_CAL_LINK`; prefill `name`, `email`, `metadata[assessment]`, `metadata[domain]`, `metadata[band]`, `metadata[pressure]`; post `booking_opened` on first interaction; `mailto:` line beneath.
- [ ] When `NEXT_PUBLIC_CAL_LINK` is unset, render only the "Open a brief" `mailto:` CTA (spec §13).
- [ ] Commit: `check: booking embed with fallback`.

### Task 4.2 — Webhook signature and payload parsing
**Files:** `src/lib/booking/cal-signature.ts`, `src/lib/booking/cal-payload.ts`, tests.
- [ ] `verifyCalSignature(rawBody, header, secret)` — HMAC-SHA256 hex, constant-time compare.
- [ ] zod for `BOOKING_CREATED` / `BOOKING_RESCHEDULED` / `BOOKING_CANCELLED` extracting `uid`, `startTime`, `endTime`, attendee email/name, `metadata.assessment`.
- [ ] Test: valid signature accepted; tampered body rejected; unknown `triggerEvent` parsed as `ignored`.
- [ ] Commit: `check: Cal.com signature and payload parsing`.

### Task 4.3 — Webhook route
**Files:** `src/app/api/webhooks/booking/route.ts`, tests.
- [ ] Read raw body; verify; 401 on mismatch (log, no writes); unknown types → 200 no-op.
- [ ] Resolve assessment by `metadata.assessment`; else resolve lead by attendee email; else create a lead with `source: "readiness_check_booking"`.
- [ ] Upsert `appointments` by `external_id`; status per event; on create set `ops_queue.status = 'booked'` and write the `ops_status_audit` row (admin client), recompute priority with `booked: true`; events `booked` / `booking_cancelled`.
- [ ] Enable the Cal.com webhook subscription from Task 0.3; make a real test booking in Preview; confirm rows.
- [ ] Commit: `check: booking webhook`.

### Task 4.4 — Ops surfaces
**Files:** `src/components/ops/QueueTable.tsx`, `src/components/ops/LeadSheet.tsx`, `src/lib/ops/queue.ts`, `src/app/api/ops/queue/route.ts` (join).
- [ ] Queue query joins `assessments` via `ops_queue.assessment_id` for band, readiness total, appointment `starts_at`.
- [ ] `QueueTable`: **Check** column (band chip + readiness total; "—" when absent); status filter includes `booked`.
- [ ] `LeadSheet`: **Check** tab — band, four sub-dimension bars, pressures with severity, growth answers, qualifiers, Q04 verbatim, appointment time/status, links to results and scan.
- [ ] Commit: `check: ops queue column and lead sheet tab`.

---

## Phase 5 — Landing, guide pages, SEO/AEO/GEO surfaces

Goal: the check is discoverable and its questions are indexable answers.

### Task 5.1 — Landing page
**Files:** `src/app/check/page.tsx`, `src/components/check/landing/*.tsx`, `src/lib/seo/json-ld.ts`.
- [ ] Hero "Is your business ready to put AI to work?", four "what we measure" cards, what you get, time to complete, "Start the check" (form POST to `/check/start`), six-question FAQ rendered as `FAQPage` JSON-LD, footer link to abra-ca-dabra.app.
- [ ] `json-ld.ts`: builders for `FAQPage`, `Article`, `BreadcrumbList`, `HowTo`, `WebApplication` (for the check itself).
- [ ] Commit: `check: landing page with FAQPage`.

### Task 5.2 — Guide content
**Files:** `src/content/check-guides/**/*.mdx`.
- [ ] Four section guides, four band guides, one fix guide per suggestion code and per Schema finding code (`MISSING_FAQ_SCHEMA` → `missing-faq-schema`, etc.). Front matter: `title` (a question), `answer` (≤60 words), `strong`, `first`, `faq[]`.
- [ ] Copy review against the brand word list (add the regex test from Task 1.2 over this directory).
- [ ] Commit: `check: guide content`.

### Task 5.3 — Guide routes
**Files:** `src/app/check/guide/[section]/page.tsx`, `src/app/check/guide/band/[band]/page.tsx`, `src/app/check/guide/fix/[code]/page.tsx`, `src/lib/seo/check-metadata.ts`.
- [ ] `generateStaticParams` from config and content; `generateMetadata` with canonical on `NEXT_PUBLIC_CHECK_URL`, OG image per page.
- [ ] Body: H1 question, answer first, "what strong looks like", "what to do first", "Start the check" link; JSON-LD `Article` + `FAQPage` + `BreadcrumbList`, plus `HowTo` on band and fix pages.
- [ ] Test: each route renders and includes a `<script type="application/ld+json">` with the expected `@type`s.
- [ ] Commit: `check: guide pages with structured data`.

### Task 5.4 — Canonical host, sitemap, llms.txt
**Files:** `src/app/sitemap.ts`, `src/app/llms.txt/route.ts` (or `public/llms.txt` generator), `src/lib/seo/check-metadata.ts`, `middleware.ts` if a host redirect is chosen.
- [ ] `/check*` canonical → `NEXT_PUBLIC_CHECK_URL`; everything else → `NEXT_PUBLIC_APP_URL`. Prefer canonical tags over redirects so both hosts serve; if redirecting, exempt `/api/**`.
- [ ] Sitemap and `llms.txt` list `/check` and all guide pages on both hosts; `/check/[token]` excluded.
- [ ] Commit: `check: canonical host, sitemap, llms.txt`.

### Task 5.5 — Abracadabra site links
**Files:** `Abracadabra/scrollcraft/builds/abracadabra-ai/**` (hero, "Situation" act, close, `llms.txt`, `sitemap.xml`, FAQ JSON-LD).
- [ ] Add "Take the Readiness Check" as a secondary CTA in the hero and the close; a one-line link in the "Situation" act.
- [ ] Add a `FAQPage` entry ("How do I know if my business is ready to put AI to work?") answering with the check.
- [ ] Add `https://check.abra-ca-dabra.app/` and the guide index to `llms.txt` and `sitemap.xml`.
- [ ] Update `Abracadabra/docs/source-of-truth.md` › Public specimens to name the Readiness Check with its URL; changelog entry on top.
- [ ] Commit (Abracadabra repo): `site: link the Readiness Check`.

---

## Phase 6 — QA and launch

Goal: green end-to-end run, accessibility pass, structured data validated, first real booking traced.

### Task 6.1 — Playwright
**Files:** `e2e/check.spec.ts`, `playwright.config.ts` (env for `PARALLEL_MOCK`).
- [ ] Start → answer every step → URL step with the mock Parallel client → gate → results with all four cards → PDF returns 200 → booking card shows the `mailto:` fallback when `NEXT_PUBLIC_CAL_LINK` is unset → two guide pages return `FAQPage` JSON-LD.
- [ ] Mobile viewport variant (iPhone 13).
- [ ] Commit: `check: end-to-end tests`.

### Task 6.2 — Accessibility
**Files:** `e2e/check-a11y.spec.ts` (axe via `@axe-core/playwright`, add if missing).
- [ ] axe passes on landing, one question screen, gate, results.
- [ ] Manual keyboard-only run of the whole check; fix focus traps.
- [ ] Commit: `check: accessibility checks`.

### Task 6.3 — Structured data and metadata
- [ ] Google Rich Results Test on `/check`, one section guide, one band guide, one fix guide.
- [ ] Confirm `/check/[token]` is `noindex` and has no personal data in OG.
- [ ] Fix any warnings; commit.

### Task 6.4 — Production dry run
- [ ] Deploy Schema; complete a real check on `check.abra-ca-dabra.app` from a phone with a real domain.
- [ ] Book a test session; confirm the webhook created the appointment, `ops_queue.status = booked`, and the queue row shows the band.
- [ ] Cancel the test booking; confirm `booking_cancelled` and appointment status.
- [ ] Download the PDF; open the linked scan.
- [ ] Schema `docs/CHANGELOG.md`: "Readiness Check launched" on top; Abracadabra `docs/lead-survey-gameplan.md` status → "built".

### Task 6.5 — First-week review checklist (no code)
- [ ] Funnel from `assessment_events`: started → section_complete × 4 → completed → opted_in → results_viewed → booking_opened → booked.
- [ ] Per-question drop-off; flag any step with > 15 % exit for copy review.
- [ ] Scan pending rate at results view; if high, revisit polling window or reorder G04 earlier.
- [ ] Decide on v1.1 items from spec §17 (report email via Resend, nurture for "completed, not booked").

---

## Definition of done

- All Vitest and Playwright suites green in CI.
- Every route in spec §12 exists, is zod-validated, and returns the documented shape.
- A completed check with a booking appears in `/ops` as `booked` with band, sub-scores, pressures, qualifiers, and appointment time.
- `/check` and every guide page pass Rich Results Test and are listed in both hosts' sitemaps and `llms.txt`.
- No banned brand words, no invented numbers, no unreleased specimen names in shipped copy (guarded by the regex test).
- `.env.example` documents the three new variables; no secrets in the repo.
