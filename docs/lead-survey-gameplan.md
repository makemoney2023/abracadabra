# Readiness Check — lead-generation survey gameplan

**Status:** plan, not yet built. Written 2026-09-23.
**Owner:** Abracadabra (dev@pirx.ca)
**Depends on:** the Schema repo (`makemoney2023/schema`, live at schema-two.vercel.app), the Abracadabra site (`scrollcraft/builds/abracadabra-ai`, live at abra-ca-dabra.app), `docs/source-of-truth.md`.

## 1. What we are building

A public assessment a business owner or operator finishes in five to seven minutes. It asks where the work slows down today and how ready the business is to put AI to work, runs the Schema scanner on their website while they answer, and ends on a results page with a score per section, plain-language suggestions per section, a "how we can help" block mapped to work we have already shipped, and one primary action: **book a working session**.

The booked session is the conversion. Everything else on the page exists to earn it.

Working name: **Readiness Check**. Public copy avoids "transformation" and the banned brand words (see `docs/source-of-truth.md` › Brand); internally "AI transformation" is fine as a label for what the second section measures.

## 2. Where it lives

**Build it inside the Schema repo.** Schema already has the pieces a survey needs and a static Scrollcraft site does not:

| Need | Already in Schema |
|---|---|
| Website structure score, 0–100, five pillars, findings, priority fixes | `scoreScan()` in `src/lib/scoring`, `POST /api/scans`, `GET /api/scans/[token]` |
| Email gate that unlocks detail | `POST /api/scans/[token]/unlock`, httpOnly cookie |
| Lead record → ops queue → inbox | `applyPublicOptIn()` → `leads`, `ops_queue`, `/ops`, `LeadSheet` |
| Background jobs | Inngest (`scan/requested`) |
| PDF report | `GET /api/scans/[token]/pdf` |
| Score UI | `ScoreRing`, `PillarMeter`, `FindingsList` |
| Sales follow-through | `docs/sales/ai-blind-spot-playbook.md`, `nurture-7-day.md`, `proposal-tiers.md` |

Routes: `/check` (start), `/check/[token]` (in-progress and results), plus public explainer pages under `/check/guide/...` (section 8). Serve it on a subdomain of the studio domain, recommended `check.abra-ca-dabra.app`, so the results and the explainer pages accrue to the Abracadabra domain family rather than a Vercel default hostname. The Abracadabra site links to it from the hero, the "Situation" act, and the close.

Alternative considered: build the survey as a static page on abra-ca-dabra.app and post to Schema's API. Rejected because scoring, gating, lead linking, PDF, and ops all live server-side in Schema; splitting them means two deployments to keep in step.

**Prerequisite:** the live Schema form currently fails with "Missing Supabase admin env" (`docs/scroll-world-review.md`). Fix the Vercel env before anything else here ships.

## 3. Survey design

Four sections. Three are answered; one is measured automatically.

### A. Where the work slows down (business problems)

Purpose: surface the pressure the person already feels, in their words, so the results page and the first call speak to it. This section produces a **pressure profile**, not a good/bad score.

Question types: multi-select of symptoms, then one single-select per selected symptom for severity ("a nuisance" → "it caps our growth"). Symptom list is drawn straight from the *Pressure on the business* column of the Business value table in `docs/source-of-truth.md`, reworded as first-person statements:

- Our process is real, but no software fits exactly how we run it.
- Our experts are the queue; answers wait on two or three people.
- New people don't sound like our best people.
- Leads arrive with no story attached.
- We don't know if AI answer engines can find us.
- Decisions wait on last month's numbers.
- A new channel or market feels like it needs a department.
- The sale still needs a visit or a specialist's hour before anyone says yes.
- The vendor bill grows as we grow.
- One person knows how the important thing works.
- Fraud or order review eats someone's morning.
- Our claims drift the moment someone new writes for us.

Each symptom maps to one row of the Business value table, which is the mapping the "how we can help" block reads later.

### B. Ready for AI (readiness)

Purpose: score readiness on four sub-dimensions, 0–100 each, averaged to the section score. Six to eight single-select questions, four anchored options each, scored 0–3.

| Sub-dimension | What we ask |
|---|---|
| **Data** | Where the operating knowledge lives (people's heads → documents → systems with an API). Whether customer, product, and process records are in one place or many. |
| **Process** | Whether the core workflow is written down. Whether it is followed the same way twice. Whether there is a person who owns it. |
| **People** | Who would own a new system day to day. Whether the team has tried AI tools and what happened. Appetite: "we'd pilot it this quarter" → "we'd need to be convinced." |
| **Decision** | Who signs, how long a decision usually takes, whether a budget line exists, timeline ("this quarter" → "no timeline"). |

### C. Growth and visibility (self-report)

Three or four questions: where new customers come from today, whether they have ever checked how the business appears in ChatGPT / Perplexity / AI Overviews, whether the website is maintained in-house or by a vendor, and the **website URL** (required; it feeds section D).

### D. AI visibility (measured)

No questions. When the URL is entered in section C, the app calls `POST /api/scans { url, source: "public" }` and the scan runs in the background while the person finishes B and the qualifiers. The section score is Schema's `scoreTotal`; the section's suggestions are Schema's `priorityFixes`. The results page links to the full scan at `/scan/[token]`.

Handle the rate limit: 3 public scans per domain per 24 hours. If the limit is hit, reuse the most recent completed scan for that domain instead of failing the survey.

### Qualifiers (asked last, before the gate)

Role, company size band, industry (free text with suggestions), and the one thing they would fix first if it were fixed tomorrow (free text, one line). The free-text lines are for the salesperson, not the score.

Total: roughly 20 interactions. Progress bar by section. Answers saved after every step so an abandoned check still reaches ops with partial data (section 6).

## 4. Scoring model

Deterministic, versioned, no LLM in the scoring path — the same locked decision Schema made. Questions, options, weights, band thresholds, suggestion text, and offer mappings live in one JSON config (`src/lib/assessment/config.v1.json`) so copy and weights change without touching code, and every saved assessment records the config version it was scored with.

| Output | Range | How |
|---|---|---|
| Readiness (B) | 0–100 | Mean of four sub-dimension scores, each normalized from 0–3 answers |
| Visibility (D) | 0–100 | Schema `scoreTotal` as-is; pillars carried through |
| Growth signal (C) | 0–100 | Small weighted set; mostly informs suggestions |
| Pressure profile (A) | list | Selected symptoms ordered by severity, each tagged with its offer row |
| Overall band | four bands | Weighted: readiness 50, visibility 30, growth 20. Bands named as states, not grades — e.g. *Early*, *Forming*, *Ready*, *Running* |

Rules the results copy must follow: no invented statistics, no benchmark claims ("most businesses score…") until we have real aggregate data and choose to publish it, non-diagnostic language throughout.

## 5. Results page

One page, `/check/[token]`, `noindex`. Order:

1. **Band and one sentence** that names the band and the top pressure they selected.
2. **Four section cards** with a ring each (reuse `ScoreRing`), sub-dimension meters for readiness (reuse `PillarMeter`), Schema's pillars for visibility.
3. **Per section, three suggestions** from a suggestion library keyed the same way Schema keys findings (stable codes, severity, message). Visibility suggestions come straight from `priorityFixes`. Each suggestion links to a public explainer page (section 8), which is how the results page feeds SEO without being indexed itself.
4. **How we can help.** For each selected pressure, the matching row of the Business value table rendered as: what they said → what we build for that → a named public specimen where one exists (Schema, LLM Leverage, Canadian Discount Appliances, Showdesk, pirx.ca visibility case). Only public-cleared work is named.
5. **Primary CTA: Book a working session.** Embedded booking (section 7), pre-filled with name, email, domain, band, and the top pressure. Copy: "Thirty minutes. Bring the workflow. We'll leave with a brief."
6. **Secondary:** "Email me this report" (PDF, extend the existing PDF route to include the assessment) and a link to the full Schema scan.

## 6. Gate and lead capture

Recommended gate: **email before results, after the last question.** The person has invested five minutes; the scan is already complete or nearly so. The gate screen shows the band name greyed and "Your check is scored. Where should we send it?" Name optional, email required. Company and phone are collected at booking, not here.

On submit:

1. Reuse `applyPublicOptIn()` with `source: "readiness_check"` so the lead, `ops_queue` row, and scan link are created exactly as Schema does today.
2. Link the assessment to the lead and scan.
3. Set the unlock cookie for the scan token so the linked Schema scan page is also unlocked.

Partial completions: because answers are saved per step with the URL captured in section C, an abandoned check still yields a domain and a scan. Insert the lead with `missing_contact: true` so ops can decide whether to prospect it through the existing Parallel enrich path. Only do this for checks that got past section C.

## 7. Booking

There is no booking tool in the stack today; every CTA on abra-ca-dabra.app is a `mailto:`. Pick one:

- **Cal.com** (recommended): open source, self-hostable or hosted, embeddable, prefill via URL params, webhooks on `BOOKING_CREATED` / `BOOKING_CANCELLED`, free tier sufficient to start.
- Calendly: simpler, hosted only, webhooks on paid tiers.

Either way: embed on the results page, prefill from the assessment, receive the webhook at `POST /api/webhooks/booking`, write an `appointments` row, move the `ops_queue` row to a new `booked` status, and notify ops. The `mailto:` fallback stays visible under the embed for people who won't use a calendar widget.

## 8. SEO / AEO / GEO — how the check feeds visibility

The check is a lead tool first, but it is also the best source of evergreen, answerable content we have, because every question is a question real operators ask.

**Indexable pages (all with JSON-LD, all in the sitemap and `llms.txt`):**

| Page | Purpose | Schema types |
|---|---|---|
| `/check` landing | "Is your business ready for AI?" — the question cluster, what the check measures, what you get | `WebPage`, `WebApplication`, `FAQPage`, `Organization` |
| `/check/guide/readiness`, `/check/guide/visibility`, `/check/guide/growth`, `/check/guide/pressure` | One explainer per section: what it measures, why, what strong looks like | `Article`, `FAQPage`, `BreadcrumbList` |
| `/check/guide/band/[band]` | "What an *Early* result means and what to do first" — one per band | `Article`, `HowTo` |
| `/check/guide/fix/[code]` | One short page per suggestion code (the visibility ones map 1:1 to Schema finding codes: `MISSING_LLMS_TXT`, `NO_ORG_SCHEMA`, …) | `Article`, `HowTo`, `FAQPage` |

**Non-indexable:** `/check/[token]` results, `/scan/[token]` — personal, `noindex, nofollow`.

**Why this helps AEO/GEO specifically:** answer engines quote pages that ask and answer a question in the first screen, with structured data confirming the entity and the FAQ. Each guide page is written that way, links back to the check, and is linked from the relevant suggestion on thousands of private results pages — an internal linking pattern that scales with usage. Every finding code Schema already emits becomes a URL we own.

**Later, only with real data:** an anonymized aggregate "readiness index" page (share of checks in each band, most-selected pressures). Do not publish until the sample is real and the numbers are cleared; never invent.

**On abra-ca-dabra.app:** add the check to the hero, the Situation act, and the close ("Take the five-minute check"), add it to `llms.txt` and the sitemap, and add a `FAQPage` entry answering "How do I know if my business is ready for AI?" pointing at the check.

## 9. Data model (new migration in Schema)

```sql
alter type ops_status add value 'booked';

create table assessments (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique,
  config_version text not null,
  lead_id uuid references leads (id) on delete set null,
  scan_id uuid references scans (id) on delete set null,
  email text,
  name text,
  answers jsonb not null default '{}'::jsonb,        -- questionId -> value, saved per step
  scores jsonb,                                       -- sections, sub-dimensions, band, pressure profile
  qualifiers jsonb not null default '{}'::jsonb,      -- role, size, industry, first-fix text
  utm jsonb not null default '{}'::jsonb,
  current_step text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  opted_in_at timestamptz
);

create table assessment_events (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments (id) on delete cascade,
  kind text not null,                                 -- started, step, section_complete, gate_shown, opted_in, results_viewed, booking_opened, booked
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid references assessments (id) on delete set null,
  lead_id uuid not null references leads (id) on delete cascade,
  provider text not null,                             -- cal.com | calendly
  external_id text not null unique,
  starts_at timestamptz not null,
  status text not null default 'scheduled',           -- scheduled | cancelled | completed | no_show
  created_at timestamptz not null default now()
);
```

RLS mirrors the existing tables: ops-only policies, service role for public writes. `ops_queue` gets an `assessment_id` column so `LeadSheet` can show the answers. Extend `computeOpsPriority` to add weight for a low readiness score with a high-severity pressure and a booked appointment, e.g. `100 − scoreTotal + (hasContact ? 25 : 0) + (readiness < 50 ? 15 : 0) + (booked ? 50 : 0)`.

## 10. API surface (new routes in Schema)

| Route | Does |
|---|---|
| `POST /api/assessments` | Create assessment, return token. Body: `utm`. |
| `PATCH /api/assessments/[token]` | Save answers for a step; if the URL step, normalize domain and create/reuse a scan (rate-limit aware), store `scan_id`. |
| `POST /api/assessments/[token]/complete` | Score against config version, persist `scores`, return gated payload (band only). |
| `POST /api/assessments/[token]/opt-in` | Email (+ name) → `applyPublicOptIn`, link lead, set scan unlock cookie, return full results. |
| `GET /api/assessments/[token]` | Full results if opted in, band-only otherwise. Polls scan status until `complete`. |
| `GET /api/assessments/[token]/pdf` | Assessment + scan PDF. |
| `POST /api/webhooks/booking` | Verify signature, write `appointments`, move queue to `booked`, notify. |
| `GET /api/ops/assessments/[token]` | Ops view, includes free-text answers. |

Inngest: reuse `scan/requested`; add `assessment/completed` for the notification and any nurture trigger.

## 11. Ops and follow-up

- `/ops` queue shows a new **Check** column (band + readiness) and a filter for `booked`.
- `LeadSheet` gets an "Assessment" tab: pressure profile, sub-dimension scores, the free-text answers, and the booking time.
- The first call uses the pressure profile as the agenda. `docs/sales/proposal-tiers.md` covers the visibility work; the other pressure rows map to the offers in `docs/source-of-truth.md` and `outputs/sales-enablement/`.
- Nurture: adapt `docs/sales/nurture-7-day.md` into a "check but no booking" variant. Sending requires an email provider in Schema (Resend is the natural fit; confirm none is wired today before assuming).

## 12. Analytics and QA

- Funnel events in `assessment_events`: started → each section complete → gate shown → opted in → results viewed → booking opened → booked. That is the whole dashboard; no third-party analytics required to start.
- Vitest: scoring is pure — table-driven tests over the config (every band boundary, every sub-dimension, missing answers, scan failed / rate-limited / slow).
- Playwright: full flow including a stubbed scan, the gate, results, and the booking embed loading with prefilled params.
- Accessibility: keyboard-only completion, visible focus, labels on every option, colour never the only signal on rings and meters.
- Mobile first: most of these will be taken on a phone from a link in a message.

## 13. Build order

Ordered by dependency, described by component rather than time.

0. **Unblock and decide.** Fix the Schema Supabase env on Vercel. Decide booking tool, hostname, gate timing, check name (section 14).
1. **Question bank and scoring config.** `config.v1.json` with every question, option, weight, band, suggestion, and offer mapping; the pure `scoreAssessment()` function; Vitest suite. No UI yet — copy can be reviewed as a document.
2. **Migration and API.** Tables in section 9, routes in section 10, `applyPublicOptIn` reuse, rate-limit-aware scan creation, `computeOpsPriority` extension.
3. **Survey UI and results page.** Step flow with autosave, background scan kick-off at the URL step, gate, results page reusing `ScoreRing` / `PillarMeter`, suggestions, "how we can help" block, PDF.
4. **Booking and ops.** Embed, webhook, `appointments`, `booked` status, queue column, `LeadSheet` tab, notification.
5. **Public content and structured data.** `/check` landing, guide pages per section, band, and fix code; JSON-LD; sitemap and `llms.txt` on both domains; links and FAQ entry on abra-ca-dabra.app; subdomain attached in Vercel.
6. **Launch QA.** Playwright flow, accessibility pass, mobile pass, Rich Results validation of the guide pages, a dry-run booking end to end into `/ops`.

Phase 1 can be reviewed by the founder as prose before any code exists; that is the point of putting it first.

## 14. Decisions needed

1. Booking tool: Cal.com (recommended) or Calendly. Who owns the calendar and who is notified.
2. Hostname: `check.abra-ca-dabra.app` (recommended) or a path on schema-two.vercel.app.
3. Gate: email before results (recommended) or results free with email for PDF and booking only.
4. Public name of the check.
5. Whether to notify ops per completion (email/Slack) or rely on the `/ops` queue.

## 15. Risks

- **Scan latency and cost.** Parallel fetch of up to 40 pages takes time and money per scan. Start the scan at the URL step, cap wait on the results page with a "still scanning — we'll email the rest" state, and reuse recent scans per domain.
- **Rate limit collisions.** The 3/domain/24h limit will hit anyone re-testing. Reuse rather than reject.
- **Drop-off.** Twenty interactions is the upper bound. Watch section-complete events and cut questions that don't change a score or a suggestion.
- **Over-claiming in results copy.** Suggestions are advice, bands are states, nothing is a diagnosis or a forecast. Review every string in the config against the brand rules before launch.
- **Two repos.** The check lives in Schema; the marketing site lives here. Both `README`s should point at each other and at this document.
