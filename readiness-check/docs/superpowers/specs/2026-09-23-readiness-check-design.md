# Readiness Check — Design Spec

**Date:** 2026-09-23
**Status:** approved for planning; implementation plan at [2026-09-23-readiness-check-plan.md](./2026-09-23-readiness-check-plan.md)
**Gameplan (why):** [../lead-survey-gameplan.md](../lead-survey-gameplan.md)
**Implemented in:** the Schema repo (`makemoney2023/schema`). This document lives in the Abracadabra repo because the marketing site, the source of truth, and the offer map live here; copy it into `docs/superpowers/specs/` in Schema when work starts so both repos carry the same text.

---

## 1. Problem

Abracadabra's site says what the studio does; nothing on it asks the visitor about their business or gives them a reason to book. Schema already scores one thing well (how readable a website is to AI answer engines) and already turns an email into a queued lead, but it knows nothing about the business behind the domain: where the work slows down, whether the team could put AI to work, who decides, or when.

Sales calls start cold. Ops opens a lead with a score and a domain, not a story.

## 2. Goals

1. A stranger finishes a five-to-seven-minute check on a phone and sees, per section, a score they can read and three things to do.
2. The check produces a booked working session as its primary outcome; a downloadable report is secondary.
3. Every completed check reaches `/ops` as a lead with a pressure profile, readiness sub-scores, a Schema scan, free-text answers, and (when booked) an appointment.
4. The check's questions become indexable, question-first guide pages with structured data, so the product itself is an SEO/AEO/GEO asset.
5. Scoring is deterministic, versioned, and explainable from the saved answers. No LLM in the scoring path.

## 3. Non-goals (v1)

- CRM sync. The queue in `/ops` is the CRM.
- Emailing the report. No mail provider exists in Schema; "Email me this report" ships as "Download report" (PDF) and email delivery is deferred to v1.1.
- Aggregate/benchmark content ("most businesses score…"). Deferred until real data exists and is cleared.
- Multi-language. English only.
- Per-industry question variants. One question bank, one config version.
- Public user accounts. The token is the identity, as with scans.
- A/B testing framework. Funnel events are recorded; experimentation is manual.

## 4. Product decisions

Defaults are set so work can start. Each can be changed by editing `config.v1.json` or an env var without touching the plan.

| Decision | Default | Where it lives |
|---|---|---|
| Public name | **Readiness Check** | config `meta.name`; landing copy |
| Hostname | `check.abra-ca-dabra.app`, attached to the Schema Vercel project; `/check*` routes canonicalize to it, all other routes canonicalize to `NEXT_PUBLIC_APP_URL` | `NEXT_PUBLIC_CHECK_URL` |
| Gate | Email required after the last question, before results. Band name shown greyed on the gate screen. | config `gate.mode = "before_results"` |
| Booking | Cal.com hosted, 30-minute event type "Working session", embedded on results with prefill; webhook back to Schema | `NEXT_PUBLIC_CAL_LINK`, `CAL_WEBHOOK_SECRET` |
| Ops notification | Cal.com notifies the host on booking. Completions without a booking are worked from `/ops`; no email in v1. | — |
| Scoring | Deterministic, config-versioned, `scoreAssessment()` pure function | `src/lib/assessment/` |
| Scan | Reuse Schema `POST /api/scans` with `source: "public"`; reuse the newest completed scan for the domain when the 3/domain/24h limit is hit | `src/lib/assessment/scan-link.ts` |
| Copy rules | `docs/source-of-truth.md` › Brand. No "streamline", "leverage" (except the product name LLM Leverage), "innovative", "transformational". No invented numbers. Non-diagnostic. Bands are states, not grades. | config review checklist |

## 5. System architecture

Monolith inside Schema (Next.js App Router, Supabase, Inngest). One new domain module, `src/lib/assessment/`, holds the config, the scorer, suggestion and offer selection, and the scan-link logic — all pure and unit-tested. Routes are thin. The results page reads one payload.

```
Browser (/check, /check/[token])
   │  PATCH answers per step          POST complete        POST opt-in
   ▼                                   ▼                    ▼
/api/assessments/*  ──────────────►  src/lib/assessment/{score,suggest,offers}
   │ URL step: create-or-reuse scan            │
   ▼                                           ▼
POST /api/scans (existing) ─► Inngest scan/requested ─► scans/scan_pages/scan_findings
   │                                           │
   └──────── assessments.scan_id ◄─────────────┘
opt-in ─► applyPublicOptIn (existing) ─► leads, ops_queue(new) ─► assessments.lead_id
Cal.com ─► POST /api/webhooks/booking ─► appointments, ops_queue(booked)
/ops (existing) ─► QueueTable column, LeadSheet "Check" tab
```

### Layers

- **Config** — `config.v1.json`, validated at build and in tests by a zod schema (`config-schema.ts`). Contains meta, sections, questions, options with scores, sub-dimension weights, band thresholds, suggestion library, offer map, copy strings.
- **Domain (pure)** — `score.ts` (`scoreAssessment`), `suggest.ts` (`selectSuggestions`), `offers.ts` (`mapPressuresToOffers`), `bands.ts`, `present.ts` (gated payload projection, mirrors `lib/scan/present.ts`), `scan-link.ts` (create-or-reuse decision, injected client).
- **Persistence** — `repository.ts` interface + `supabase-repository.ts`, following the scan repository pattern.
- **Routes** — `src/app/api/assessments/**`, `src/app/api/webhooks/booking/route.ts`, `src/app/api/ops/assessments/[token]/route.ts`.
- **UI** — `src/app/check/**` pages, `src/components/check/**`, reusing `ScoreRing`, `PillarMeter`, `FindingsList`.
- **Content** — `src/content/check-guides/*.mdx` (or TSX) for guide pages; JSON-LD builders in `src/lib/seo/`.

## 6. Data model

New migration `supabase/migrations/20260923000000_readiness_check.sql`.

```sql
alter type ops_status add value if not exists 'booked';

create type assessment_status as enum ('in_progress', 'completed', 'abandoned');
create type appointment_status as enum ('scheduled', 'rescheduled', 'cancelled', 'completed', 'no_show');

create table assessments (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique,
  config_version text not null,
  status assessment_status not null default 'in_progress',
  lead_id uuid references leads (id) on delete set null,
  scan_id uuid references scans (id) on delete set null,
  domain text,
  email text,
  name text,
  answers jsonb not null default '{}'::jsonb,
  qualifiers jsonb not null default '{}'::jsonb,
  scores jsonb,
  utm jsonb not null default '{}'::jsonb,
  current_step text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  opted_in_at timestamptz
);

create table assessment_events (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments (id) on delete cascade,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid references assessments (id) on delete set null,
  lead_id uuid not null references leads (id) on delete cascade,
  provider text not null,
  external_id text not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status appointment_status not null default 'scheduled',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ops_queue add column assessment_id uuid references assessments (id) on delete set null;

create index assessments_domain_idx on assessments (domain);
create index assessments_lead_id_idx on assessments (lead_id);
create index assessment_events_assessment_id_idx on assessment_events (assessment_id);
create index appointments_lead_id_idx on appointments (lead_id);

alter table assessments enable row level security;
alter table assessment_events enable row level security;
alter table appointments enable row level security;

create policy "ops full assessments" on assessments for all using (is_ops()) with check (is_ops());
create policy "ops read assessment events" on assessment_events for select using (is_ops());
create policy "ops full appointments" on appointments for all using (is_ops()) with check (is_ops());
```

Public writes go through the service-role admin client, as scans do. `leads.source` gains the value `'readiness_check'` (text column, no enum change).

### `scores` JSON shape (stored, and returned in the payload)

```ts
type AssessmentScores = {
  configVersion: "v1";
  readiness: { total: number; data: number; process: number; people: number; decision: number };
  growth: { total: number };
  visibility: { total: number | null; breakdown: ScoreBreakdown | null; status: "complete" | "pending" | "unavailable" };
  overall: { total: number; band: "early" | "forming" | "ready" | "running"; weights: { readiness: number; visibility: number; growth: number } };
  pressures: Array<{ code: string; severity: 1 | 2 | 3; offerRow: string }>;
  topPressure: string | null;
};
```

### Event kinds

`started`, `step` (`{ stepId }`), `section_complete` (`{ sectionId }`), `scan_requested` (`{ scanId, reused }`), `completed`, `gate_shown`, `opted_in`, `results_viewed`, `booking_opened`, `booked`, `booking_cancelled`, `pdf_downloaded`.

## 7. Question bank (config v1)

Every question has a stable `id`, a `sectionId`, a `type`, and options with `score`. Copy below is the v1 copy; it is the thing to review before code.

### Section A — `pressure` — "Where does the work slow down?"

`type: "multi_select"` over the twelve symptoms, then for each selected symptom a `severity` single-select: 1 "It's a nuisance" · 2 "It costs us time or money every week" · 3 "It caps how far we can grow".

| id | Statement | `offerRow` (Business value table) |
|---|---|---|
| P01 | Our process is real, but no software fits exactly how we run it. | `custom_fit` |
| P02 | Our experts are the queue. Answers wait on two or three people. | `experts_queue` |
| P03 | New people don't sound like our best people. | `rep_standard` |
| P04 | Leads arrive with no story attached. | `lead_story` |
| P05 | We don't know if AI answer engines can even find us. | `ai_visibility` |
| P06 | Decisions wait on last month's numbers. | `decisions_wait` |
| P07 | A new channel or market feels like it needs a whole department. | `new_channel` |
| P08 | The sale still needs a visit or a specialist's hour before anyone says yes. | `sale_visit` |
| P09 | The vendor bill grows as we grow. | `vendor_bill` |
| P10 | One person knows how the important thing works. | `one_person` |
| P11 | Fraud or order review eats someone's morning. | `fraud_review` |
| P12 | Our claims drift the moment someone new writes for us. | `claims_drift` |

Zero selections is allowed; the results page then skips the "how we can help" pressure block and shows the general one.

### Section B — `readiness` — "Could AI do real work here?"

`type: "single_select"`, four options scored 0–3, two questions per sub-dimension.

| id | dim | Question | 0 | 1 | 2 | 3 |
|---|---|---|---|---|---|---|
| R01 | data | Where does the knowledge that runs the business live? | In people's heads | In documents and chats, spread around | In a few systems we can export from | In systems we can connect to |
| R02 | data | Customer, product, and process records — where are they? | Many places, and they don't match | Several places, reconciled by hand | Mostly one place | One system of record |
| R03 | process | Is the core workflow written down? | No | Partly, and it's out of date | Documented, followed most of the time | Documented, followed, and someone owns it |
| R04 | process | Same job twice — same result? | Depends who does it | Usually, with exceptions | Yes, with a checklist | Yes, and we measure it |
| R05 | people | Who would own a new system day to day? | Nobody has the time | We'd work it out | A named person, part time | A named person — it's already part of their role |
| R06 | people | Has the team used AI tools? | Not really | A few people, on their own | We tried something together, mixed results | It's in a real workflow today |
| R07 | decision | Who decides, and how long does it take? | Unclear | The owner, over months | The owner, over weeks | A named person, within the month |
| R08 | decision | Timeline and budget? | No timeline | Exploring, no budget | Budget exists, timeline open | We want to start this quarter |

### Section C — `growth` — "Where do new customers come from?"

| id | type | Question | 0 | 1 | 2 | 3 |
|---|---|---|---|---|---|---|
| G01 | single_select | Where do new customers come from today? | Referrals only, or we're not sure | Mostly one channel | Two or three channels | Several channels we can measure |
| G02 | single_select | Have you checked how your business shows up in ChatGPT, Perplexity, or Google AI Overviews? | No | Once — didn't like it | Yes, now and then | Yes, and we act on what we see |
| G03 | single_select | Who looks after the website? | Nobody, really | A vendor; changes take weeks | A vendor; changes take days | In-house; we ship changes ourselves |
| G04 | url | Your website | required; normalized with `normalizeDomain`; triggers the scan | | | |

### Qualifiers — `about` — "About you"

| id | type | Question | Options |
|---|---|---|---|
| Q01 | single_select | Your role | Owner or executive · Operations · Marketing or sales · IT or engineering · Other |
| Q02 | single_select | Team size | 1–10 · 11–50 · 51–200 · 200+ |
| Q03 | text (≤80) | Industry | free text with suggestions |
| Q04 | text (≤240) | If one thing were fixed by tomorrow, what would it be? | free text |

Qualifiers do not score. They are for the salesperson and the ops filter.

### Step order

`pressure` → `readiness` → `growth` (URL last in the section so the scan starts as early as possible without asking for it cold) → `about` → gate → results. Steps are one question per screen on mobile; the pressure multi-select is one screen followed by one severity screen per selected symptom.

## 8. Scoring model

All functions pure, in `src/lib/assessment/score.ts`. Input: `answers`, `scanResult | null`, `config`. Output: `AssessmentScores`.

- **Sub-dimension** = round(mean(option scores) / 3 × 100). Unanswered questions are excluded from the mean; a sub-dimension with no answers scores 0 and is flagged in `scores.readiness` as `incomplete: true`.
- **Readiness total** = round(mean of four sub-dimensions).
- **Growth total** = round(mean(G01..G03) / 3 × 100).
- **Visibility total** = Schema `scoreTotal` when the linked scan is `complete`; `null` with `status: "pending"` while queued/running; `null` with `status: "unavailable"` when failed or no scan.
- **Overall** = round(0.5 × readiness + 0.3 × visibility + 0.2 × growth). When visibility is `null`, re-weight to readiness 0.7 / growth 0.3 and record the weights used.
- **Band**: `early` 0–39 · `forming` 40–59 · `ready` 60–79 · `running` 80–100. Thresholds in config.
- **Pressures** = selected symptoms ordered by severity desc, then by selection order. `topPressure` = first code or `null`.

Rules: no LLM; no randomness; the same answers and the same config version always produce the same scores; a scored assessment stores `config_version` and is never re-scored by a newer config unless explicitly requested by ops.

## 9. Suggestions and offers

### Suggestion library (`config.suggestions`)

Each entry: `{ code, section, severity: "info" | "warn" | "critical", title, body, guideSlug }`. Selection (`suggest.ts`) returns up to three per section, highest severity first.

| Section | Trigger | Codes |
|---|---|---|
| readiness | sub-dimension < 40 | `READY_DATA_LOW`, `READY_PROCESS_LOW`, `READY_PEOPLE_LOW`, `READY_DECISION_LOW` (critical) |
| readiness | sub-dimension 40–69 | `READY_DATA_MID`, `READY_PROCESS_MID`, `READY_PEOPLE_MID`, `READY_DECISION_MID` (warn) |
| readiness | all ≥ 70 | `READY_STRONG` (info) |
| growth | G01 ≤ 1 | `GROWTH_ONE_CHANNEL` (warn) |
| growth | G02 ≤ 1 | `GROWTH_AI_UNCHECKED` (warn) |
| growth | G03 ≤ 1 | `GROWTH_SITE_STUCK` (warn) |
| visibility | scan complete | Schema `priorityFixes` top 3, mapped by finding code to guide slug `fix/<code-kebab>` |
| visibility | scan pending | `VIS_PENDING` (info): "Still scanning — open the full scan when it finishes." |
| visibility | scan unavailable | `VIS_UNAVAILABLE` (info) with a link to run the scan directly |

Every suggestion body is advice, present tense, one to three sentences, and links to its guide page.

### Offer map (`config.offers`)

Keyed by `offerRow`. Each: `{ row, said, build, specimens: Array<{ name, url }> }`. `said` is the symptom restated; `build` is the *What they get* column from the Business value table in `docs/source-of-truth.md`, lightly shortened; `specimens` name only work cleared for public use:

| row | specimens |
|---|---|
| `custom_fit` | — (links to abra-ca-dabra.app "How it works") |
| `experts_queue` | — |
| `rep_standard` | — |
| `lead_story` | Readiness Check itself |
| `ai_visibility` | Schema (schema-two.vercel.app), pirx.ca visibility case (cleared figures only) |
| `decisions_wait` | — |
| `new_channel` | — |
| `sale_visit` | Canadian Discount Appliances (cdastore.vercel.app), Showdesk (showdesk-app.com) |
| `vendor_bill` | — |
| `one_person` | LLM Leverage (llm-leverage-course.vercel.app) |
| `fraud_review` | — |
| `claims_drift` | — |

Rows with no specimen render `build` and a link to the studio site. Adding a specimen is a config edit once naming is cleared in the source of truth.

## 10. Public UX

### `/check` (landing, indexable)

Question-first hero ("Is your business ready to put AI to work?"), what the check measures (four cards), what you get, time to complete, one button "Start the check". FAQ block (six questions) rendered as `FAQPage`. Footer link to abra-ca-dabra.app.

### `/check/[token]` while `in_progress`

- One question per screen. Progress by section (four segments).
- Every answer `PATCH`es immediately; the URL is the resume link.
- URL step: inline validation via `normalizeDomain`; on success the scan is created or reused and the screen says "We're reading your site while you finish."
- Back is allowed; answers are overwritten.

### Gate (after `about`, before results)

Headline "Your check is scored." Band name shown greyed with the sentence "Where should we send it?" Fields: email (required), name (optional). Consent line under the button: "We'll send this report and, if you book, the notes from your session. Nothing else." Submit → `opt-in` → results.

### `/check/[token]` results (noindex)

1. Band + one sentence naming the band and the top pressure.
2. Four section cards: Readiness (ring + four `PillarMeter`s), Visibility (Schema ring + five pillars, link to `/scan/[token]`), Growth (ring), Pressure (ordered list with severity chips).
3. Three suggestions per section (`FindingsList` styling), each linking to its guide.
4. "How we can help": one block per selected pressure, top three by severity, from the offer map. If none selected, the `custom_fit` block.
5. Primary CTA card: "Book a working session — thirty minutes, bring the workflow, we leave with a brief." Cal.com inline embed with prefill (`name`, `email`, `metadata[assessment]=token`, `metadata[domain]`, `metadata[band]`, `metadata[pressure]`). A `mailto:dev@pirx.ca` line sits under the embed.
6. Secondary: "Download report" (PDF), "Open the full site scan".
7. Visibility pending: card shows a spinner and the page polls `GET /api/assessments/[token]` every 5 s for up to 3 min, then shows `VIS_UNAVAILABLE` copy without blocking anything else.

### Guide pages (indexable)

`/check/guide/[section]` (4), `/check/guide/band/[band]` (4), `/check/guide/fix/[code]` (one per suggestion code, including every Schema finding code). Each: H1 as a question, answer in the first 60 words, "what strong looks like", "what to do first", link to start the check. `Article` + `FAQPage` + `BreadcrumbList` JSON-LD; `HowTo` on band and fix pages.

### Metadata rules

- `/check` and `/check/guide/**`: index, canonical on `NEXT_PUBLIC_CHECK_URL`, OG image per page.
- `/check/[token]`: `noindex, nofollow`, no OG image with personal data.
- Both hosts' `sitemap.xml` and `llms.txt` list the guide pages. The Abracadabra site adds the check to its hero, "Situation" act, close, `llms.txt`, sitemap, and a `FAQPage` entry.

## 11. Ops

- `QueueTable`: new column **Check** showing band chip + readiness total; filter `status = booked`; sort by `priority_score` unchanged.
- `computeOpsPriority` extended: `100 − scoreTotal + (hasContact ? 25 : 0) + (readiness != null && readiness < 50 ? 15 : 0) + (topPressureSeverity === 3 ? 10 : 0) + (booked ? 50 : 0)`. Existing behavior preserved when the new inputs are absent.
- `LeadSheet`: new tab **Check** — band, four sub-dimension bars, pressures with severity, growth answers, qualifiers, Q04 verbatim, appointment time and status, link to results page and scan.
- `GET /api/ops/assessments/[token]` returns the full record including events for drop-off review.

## 12. API

All public routes: token-scoped, JSON, zod-validated, service-role admin client, same error envelope as scans (`{ error, message?, details? }`).

| Method + route | Request | Response | Notes |
|---|---|---|---|
| `POST /api/assessments` | `{ utm?: Record<string,string> }` | `201 { token, configVersion, firstStep }` | inserts `assessments` with `nanoid(24)`, event `started` |
| `GET /api/assessments/[token]` | — | `{ status, currentStep, answers, qualifiers, scores?, gated: boolean, results?: ResultsPayload }` | `results` only when `opted_in_at` set (or ops); polls scan status when visibility pending |
| `PATCH /api/assessments/[token]` | `{ stepId, answer }` | `{ ok, nextStep, scan?: { id, token, status, reused } }` | validates answer against config; URL step calls `scan-link` |
| `POST /api/assessments/[token]/complete` | — | `{ ok, band }` | scores, sets `status = completed`, event `completed`; idempotent |
| `POST /api/assessments/[token]/opt-in` | `{ email, name? }` | `{ ok, leadId, results: ResultsPayload }` | `applyPublicOptIn` with `source: "readiness_check"`, links `lead_id`, sets scan unlock cookie, `ops_queue.assessment_id`, event `opted_in` |
| `GET /api/assessments/[token]/pdf` | — | `application/pdf` | requires opted in; assessment + scan sections |
| `POST /api/assessments/[token]/events` | `{ kind, data? }` | `{ ok }` | client-side events only from the allowed list (`results_viewed`, `booking_opened`, `pdf_downloaded`) |
| `POST /api/webhooks/booking` | Cal.com payload | `200 { ok }` | verify `x-cal-signature-256` HMAC with `CAL_WEBHOOK_SECRET`; handle `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`; upsert `appointments` by `external_id`; set `ops_queue.status = 'booked'` on create (audit row via admin client); event `booked` / `booking_cancelled` |
| `GET /api/ops/assessments/[token]` | — | full record + events | `requireOps()` |

`ResultsPayload` = `{ domain, scores, suggestions: Record<section, Suggestion[]>, offers: Offer[], scan: { token, status, scoreTotal, breakdown, topGaps } | null, booking: { calLink, prefill } , appointment?: { startsAt, status } }`. Built by `present.ts`.

### Scan link (`scan-link.ts`)

```
given domain:
  newest completed public scan for domain within 24h  → reuse it
  else if countRecentPublicScans(domain).allowed      → POST create (existing path)
  else newest scan of any status for domain           → reuse it
  else                                                → visibility unavailable
```

Inngest: existing `scan/requested` unchanged. New event `assessment/completed` emitted on complete (no consumer in v1 beyond logging; reserved for nurture).

## 13. Booking

Cal.com hosted account, event type `working-session` (30 min), host = studio calendar. Embed via `@calcom/embed-react` inline on results; prefill from the assessment. Webhook subscription on the event type to `${NEXT_PUBLIC_APP_URL}/api/webhooks/booking` with a secret. Cal.com sends host and attendee confirmations; Schema does not send email in v1.

Fallback when `NEXT_PUBLIC_CAL_LINK` is unset: the CTA card renders "Open a brief" as `mailto:dev@pirx.ca?subject=Working%20session%20—%20{domain}` with the band in the body.

## 14. Error handling and limits

- Invalid or unknown token → 404, page shows "This check link isn't valid. Start a new one."
- Answer fails config validation → 400 with `details`; UI shows inline error, never loses other answers.
- Scan create fails (Parallel down, env missing) → assessment continues; visibility `unavailable`; event `scan_requested` with `error`. Never block the survey on the scan.
- Opt-in fails → 500; UI keeps the gate with a retry; answers remain saved.
- Webhook signature mismatch → 401, logged, no writes. Unknown event types → 200 no-op.
- Abandonment: an Inngest cron (`assessment/sweep`, daily) marks `in_progress` assessments older than 48 h as `abandoned`. If `domain` is set and no `lead_id`, upsert a lead with `source: "readiness_check_partial"`, `missing_contact: true`, and an `ops_queue` row, so ops can enrich through the existing prospect path.
- Rate limits: reuse the scan rate limiter; add a soft limit of 20 assessments per IP per day at `POST /api/assessments` (in-memory is fine on Vercel; a DB count keyed on hashed IP in `utm.ip_hash` is the fallback).

## 15. Testing

- **Vitest** (`src/lib/assessment/*.test.ts`): config validates; every band boundary (39/40, 59/60, 79/80); each sub-dimension formula; visibility null re-weighting; pressure ordering; suggestion selection for each trigger; offer mapping including zero pressures; `present` gating; `scan-link` all four branches with a mocked client; webhook signature verify/reject; `computeOpsPriority` backward compatibility.
- **Route tests**: zod rejection shapes; opt-in idempotency (second opt-in same email does not duplicate queue rows — existing behavior).
- **Playwright** (`e2e/check.spec.ts`): start → answer all → URL step with `PARALLEL_MOCK` → gate → results with all four cards → PDF responds 200 → booking card visible with fallback `mailto` when `NEXT_PUBLIC_CAL_LINK` unset → guide pages return `FAQPage` JSON-LD.
- **Accessibility**: axe pass on landing, one question screen, gate, results; keyboard-only run through the whole check.
- **Rich Results**: guide pages validated with Google's Rich Results Test before launch.

## 16. Tech stack additions

`@calcom/embed-react` (results embed). Everything else already in Schema: Next.js 16, React 19, Tailwind 4, shadcn/ui, zod 4, Supabase, Inngest, `@react-pdf/renderer`, Vitest, Playwright.

New env: `NEXT_PUBLIC_CHECK_URL`, `NEXT_PUBLIC_CAL_LINK`, `CAL_WEBHOOK_SECRET`. Add to `.env.example` with placeholders only.

## 17. Open follow-ups (explicitly deferred)

- Email delivery of the report and a "check but no booking" nurture (needs a mail provider — Resend is the natural fit).
- Aggregate readiness index page once N is real and cleared.
- Ops-triggered re-score against a newer config version.
- Share card (OG image with band only) for social.
- Second language.
