# Product video pipeline — target list

Shared capture → Remotion compose → H.264 embed pattern from [Showdesk](https://github.com/makemoney2023/showdesk) (`promo/`). Marketing home gets a featured promo plus two or three muted loops in device chrome.

This list is the implementation queue. Add a product here before building its `promo/` pack.

## Pipeline (reference)

| Stage | Showdesk location | Notes |
| --- | --- | --- |
| Capture | `promo/capture/record-footage.mjs` | Playwright against a seeded demo; gold cursor; service workers blocked |
| Compose | `promo/src/` Remotion 4 | Intro → 3–4 workflows → CTA; footage sped ~1.3–1.85× |
| Render | `promo` scripts → `public/videos/` | H.264 MP4 + JPEG posters; raw `footage/` and `out/` stay gitignored |
| Embed | marketing `#demo` section | Featured play-overlay promo + intersection-observer autoplay loops |
| Walkthrough | `scrollcraft/builds/abracadabra-ai/walkthrough.html` | Cross-product walkthroughs are one scroll-scrubbed flight on the scroll-world engine, not a grid of players. Re-encode legs with `-g 8` and a poster still. See `docs/scroll-world-review.md`. |

Do **not** reuse Showdesk’s gold/Fraunces look on other products. Keep the *pipeline*; restyle frames, type, and stage to that product’s brand.

Two cuts per product when both apply:

- **Marketing promo** (~40s) — homepage `#demo`
- **Sales enablement** (2–8 min, talk-track aligned) — reps, Looms, first-demo scripts

## Targets

| # | Target | Repo / live | Status | Story / segments |
| --- | --- | --- | --- | --- |
| 1 | Showdesk | [makemoney2023/showdesk](https://github.com/makemoney2023/showdesk) · [showdesk-app.com](https://www.showdesk-app.com/) | **Stored** in `outputs/videos/showdesk/` (official promo + live home capture) | Ringside (phone + STT) → review → placements → reports |
| 2 | Canadian Discount Appliances | [makemoney2023/canadiandiscountappliances](https://github.com/makemoney2023/canadiandiscountappliances) (private) · [cdastore.ca](https://www.cdastore.ca/) · Vercel `cdastore` | **Live home stored**; seeded PDP capture still needs private-repo access | Warehouse/home → product + price → visit/delivery (phone) → reviews |
| 3 | Schema | [makemoney2023/schema](https://github.com/makemoney2023/schema) · [schema-two.vercel.app](https://schema-two.vercel.app/) | **Live home stored**; seeded `/scan/[token]` walkthrough still open | URL scan → score / gaps → generate fix → ops inbox |
| 4 | LLMCourse | [makemoney2023/LLMCourse](https://github.com/makemoney2023/LLMCourse) · [llm-leverage-course.vercel.app](https://llm-leverage-course.vercel.app) | **Home + workshops stored**; in-module lesson path still thin | Home / preview → lesson steps → practice + quiz → workshops / try-it |
| 5 | Sales enablement | Skill in this repo (not a standalone product) | **Scripts + one-pagers stored** in `outputs/sales-enablement/` | Rep-facing demo cuts, talk tracks, objection clips, one-pager / playbook leave-behinds |

---

### 1. Showdesk (reference)

Live marketing already embeds `public/videos/showdesk-promo.mp4` plus `demo-ringside`, `demo-review`, and `demo-desk` loops.

Reuse: Playwright seed + gold cursor + Remotion `Promo` / loop compositions / `DemoVideosSection`.

### 2. Canadian Discount Appliances

Appliance retail store. Capture against a seeded catalog, not live inventory.

Suggested clips: home/warehouse grid → PDP with price → visit or delivery on phone → reviews.

Blocker: this agent’s GitHub token does not see the private repo until access is granted.

### 3. Schema

AEO/GEO scanner (“AI Blind Spot”). Public repo. Existing internal sales pack in `docs/sales/` (playbook, 7-day nurture, proposal tiers) already calls for a ~2 minute Loom of `/scan/[token]`.

Suggested clips: paste URL → score and top gaps → generate fix package → ops inbox / prospect queue.

Needs a demo-mode scan fixture so capture does not hit Parallel/Inngest live.

### 4. LLMCourse

Self-paced **LLM Leverage** course (Next.js, localStorage progress, no auth in v1).

**Already in the repo (different job):** `content-studio/` Remotion for curriculum shorts / YouTube (`shorts:studio`, `shorts:batch`, `shorts:publish`). Keep that for lesson clips. Add a separate Showdesk-style `promo/` for the *product tour* (learner app on a branded stage).

**Capture source:** `e2e/smoke.spec.ts` already walks the marketing and learner paths.

Suggested clips:

| Clip | Route / action | Why |
| --- | --- | --- |
| Home | `/` — “Train teams…”, Preview / Plan a team rollout | Marketing CTA |
| Lesson | `/modules/mental-model` — mark steps done | Core learning loop |
| Practice + quiz | exercises → “Check for understanding” | Completion / certificate path |
| Workshops or try-it | `/workshops` slides **or** `/resources` → try-it sandbox | Team rollout + hands-on |

Optional loops: modules index, glossary sheet, capstone gallery, certificate.

Audience for the promo is operators buying a team rollout, not only individual learners.

### 5. Sales enablement

Not a Vercel/GitHub product. It is the B2B collateral motion: decks, one-pagers, objection docs, demo scripts, playbooks.

**Skill (this repo):** [`.cursor/skills/community/marketingskills/sales-enablement/`](../.cursor/skills/community/marketingskills/sales-enablement/SKILL.md)

| Asset the skill produces | Video / footage counterpart |
| --- | --- |
| First-demo script (30–45 min, 3–4 workflows) | Longer AE cut of the same capture as the marketing promo |
| Discovery / close talk tracks | Short objection and CTA clips |
| One-pager / leave-behind | Still posters + 15–20s silent loop |
| Playbook demo flow | Scene list that must match `promo/` chapter markers |
| Case-study brief | Optional customer-style recut (seeded demo, not real PII) |

**Per-product enablement pack** (same four products):

| Product | Enablement notes |
| --- | --- |
| Showdesk | Recut existing ringside → review → placements/reports with AE talk track; desk loop as leave-behind |
| CDA | Rep script: price/visit/delivery objections; phone clip for in-store / delivery close |
| Schema | Already specified: 2-min walkthrough of *their* `/scan/[token]`; playbook + nurture + proposal tiers in `schema/docs/sales/` |
| LLMCourse | Team-rollout motion: home `#rollout` / `#contact`, workshop slides, certificate as proof of completion |

When implementing a product `promo/`, ship marketing and sales-enablement compositions from the **same** footage so chapter markers line up with the demo script.

## Implementation order

1. Schema (public, sales docs already ask for the 2-min walkthrough)
2. LLMCourse (public, e2e is a ready capture script; keep `content-studio` for shorts)
3. CDA (after private-repo access)
4. Sales enablement packs for each, starting with Schema’s existing playbook

Showdesk stays the reference; do not rebuild it unless the pipeline itself changes.
