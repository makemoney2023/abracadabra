# Anything digital — lead-in to the AEO chapter

**Status:** Shipped 2026-09-25. `#range` is on the homepage between `#time` and `#aeo`. Copy revised the same day so the chapter speaks to the operator: headline **Software for the way your company actually works.**
**Prepared:** 2026-09-25
**Surfaces:** `abra-ca-dabra.app` and `scrollcraft/builds/abracadabra-ai/`
**Source of truth:** [`docs/source-of-truth.md`](source-of-truth.md)
**Sits on:** the time-travel chapter (`#time`) and the Answer Engine Optimization chapter (`#aeo`)

## Why this chapter exists

The homepage currently goes from the delivery calendar straight into Answer Engine Optimization. A visitor who has only seen the mechanism and the calendar can read the studio as a search shop. AEO is one discipline inside a studio that builds the rest of a digital operation: marketing, applications, machine learning, systems of record, stores, and lead generation.

That range is already true in [`docs/source-of-truth.md`](source-of-truth.md) and in one buried sentence on the selected-work rail ("a sample of what shipped, not a ceiling"). It is not yet a room the reader walks through before the receipt. This chapter is that room. The next pin stays the receipt.

## Where it goes

Insert one pinned chapter, `#range`, immediately after `#time` and immediately before `#aeo`.

```
Compile (#i) → name → situation → Time (#time) → Range (#range) → Answer (#aeo) → Schema → selected work → …
```

Time says the calendar folds. Range says that calendar covers the whole digital operation, not only an app. Answer says being found is one of those systems, and here is the measured proof. Do not move the pirx.ca figures into this chapter. The receipt stays in `#aeo`, the FAQ, and `llms.txt`.

The utterance strip stays five syllables. This chapter is not a specimen and does not get `data-specimen`. Ink still belongs to the objects already in the room.

## What the reader should believe

By the end of the pin, before the AEO headline:

1. The studio takes the digital work an operation actually needs, not a single product category.
2. Marketing, applications, models, the customer record, and commerce are the same method: intent, context, then a system that ships.
3. Named public proof is a sample. Other work is named when the client allows it.
4. The next room is how a brand gets found. The reader should want the receipt, not another menu.

## Narrative sequence

Five states, driven by scroll on desktop and by controls elsewhere: **Market → Product → Model → Record → Commerce**.

The left column stays put. The right column is one instrument, the same pattern as `.time-engine` and `.aeo-engine`: chrome, one active plate, a status line, and buttons.

| State | Plate title | What it claims | What may be named |
|---|---|---|---|
| `market` | Marketing | Campaigns, films, and pages, in the words the team already uses. They sell what the software does. | The films on file. No client content-studio names. |
| `product` | Applications | The steps the team already runs, as software they can demo. | Showdesk runs a live event from entry through review, placements, and reports. |
| `model` | Machine learning | PIRX reads the training and says what the work can support right now. | PIRX. Qualitative only: wearable ingestion, projections, chat, mobile. No accuracy, latency, or lift figures. |
| `record` | The record | The pipeline, the agreement, the order, and the customer history, in one place. | Nothing by product name. One line: we name it when you allow it. |
| `commerce` | The sale | Canadian Discount Appliances answers fit, price, and the next step before anyone gets in a car. | Canadian Discount Appliances. The Readiness Check may be mentioned as the studio's own door, without stealing the AEO calls to action. |

The commerce plate closes the pin. Its last sentence is the handoff, and it is the only place this chapter points forward:

> Getting found works the same way. The next room is the receipt.

That sentence is the bridge into "Be the answer AI can verify." Do not preview 201K, 21.8K, clicks, or the pull date here. Do not add a sixth "Answer" state. AEO already is that state, at full length.

### Copy

- **Eyebrow:** The range
- **Headline:** Software for the way your company actually works.
- **Support:** Your people keep the order of work they already trust. The screen follows that order: the product, the way you sell it, and one record of the customer.
- **Qualifier:** The names here are work we have shipped. They are not a limit.
- **Quiet link, under the qualifier:** The answer is next → `#aeo`
- **No primary button.** "Show us how it works" stays on the hero, the benefits pin, and the close. This chapter should release the reader into AEO, not start a second conversion path.

Status line as the plates advance: `In the words you already use` → `Software they can demo` → `What the work can support` → `One place for the customer` → `Before anyone gets in a car`. PIRX is not in the status line. It stays on the model plate.

### PIRX, said once and split in two

PIRX is public enough to name. It is a venture: what training structurally supports right now. That is the machine-learning plate.

pirx.ca is also the content engine behind the search receipt. Those are the same project and they are not the same claim. This chapter may say PIRX is the model. It may not imply that the Search Console figures prove the model. The figures stay next door, attached to AEO, GEO, and SEO run as one discipline.

## Motion and art direction

Same computational theatre as the chapters on either side. Not a six-card services grid, not icons, not a pricing table.

- The instrument is a stack of job tickets. The active ticket is in the foreground (ivory type, signal rule). The other four stay etched behind it, titles only, so the range is visible even when one plate is being read.
- State changes cross-fade the active plate's body. The stack reorders so the active ticket comes forward. No counters, no progress percent, no fake terminal.
- Drift the canvas to `#0C0B10`, between Time (`#0A0912`) and Answer (`#071012`), so the rooms step toward the answer surface.
- Pin span `2.6`. Five beats need more travel than the four-state pins at `2.35`.
- Scroll thresholds: under `0.18` market, under `0.38` product, under `0.58` model, under `0.78` record, otherwise commerce.
- A manual control click holds, the same way the compiler, time, and AEO engines already do.

## Responsive and accessibility

- Desktop, over 860px: scroll selects the state. Controls remain and a click holds.
- Mobile, 860px and under: `data-sc-act` becomes `flow` (add `range` to the existing `flowIds` list). The instrument sits above the copy. Five buttons drive the state. No horizontal overflow.
- Reduced motion: unpin the section, hide the controls, stack all five plates as static articles with their bodies visible. The handoff sentence remains on the commerce plate.
- Controls use `aria-pressed`. The instrument `aria-label` is "The kinds of digital work Abracadabra builds." The status element announces the current plate.
- Plate text is semantic HTML. Motion is not the only carrier of the five claims.

## Chapter index

Insert the chapter and shift the roman numerals after it. The `ST` close stays.

| Label | Target |
|---|---|
| I — Compile | `#i` |
| II — Time | `#time` |
| III — Range | `#range` |
| IV — Answer | `#aeo` |
| V — Proof | `#iii` |
| VI — Watch | `#film` |
| VII — Build | `#v` |
| ST — Start | `#brief` |

The scroll spy node list becomes `['i', 'time', 'range', 'aeo', 'iii', 'film', 'v', 'brief']`.

## FAQ and crawler files

Add one question after "What does Abracadabra AI build?" so an answer engine can lift the range without reading the pin.

**Question:** Do you only build software?

**Answer, first sentence then the qualifier:** No. The same studio ships marketing, applications, machine-learning products, systems of record, stores, and the work that gets a brand found. Software is the method. The surface changes with the operation. Public examples on this page include Showdesk, Schema, LLM Leverage, Canadian Discount Appliances, and PIRX. Other work is named when the client allows it.

Mirror that question in the JSON-LD `FAQPage`. Do not add a `Service` item list. A services schema would let an answer engine quote the plates as a guaranteed menu.

When the chapter ships, add one short paragraph to `llms.txt` under "What we do": the five surfaces, the sample-not-a-ceiling line, and a pointer that the measured visibility proof is the pirx.ca block already in that file. No new numbers.

## Claim boundary

Allowed:

- The five categories, in outcome language.
- Showdesk, the films on file, Canadian Discount Appliances, PIRX as a qualitative model, Schema only as the thing the next chapter opens.
- "Named when the client allows it."
- "A sample, not the edge."
- The existing promise that if a product they can buy already does the job, the studio says so. That sentence already lives in the FAQ. Do not weaken it with "we can do anything" as an unbounded offer. The headline is the range of digital work. The fit rule still holds.

Held out of this chapter:

- SuperPatch system names, S.T.A.R., J.Ai, SPSign, and any other name in "What stays off the public site."
- Unconfirmed metrics: search-operation reductions, identity-API savings, fraud-review hours, associate counts, hotel-rate hours, close rates, model accuracy.
- The pirx.ca impression and click figures. They belong to `#aeo`.
- Durations, percentages, and "at the speed of thought" turned into an elapsed-time promise.
- Diagnostic language. If an assessment is mentioned at all, it educates and routes. It does not diagnose. Prefer leaving assessments to the existing FAQ answer rather than putting them on a plate.
- A second primary call to action.

## Files to touch when this is built

| File | Change |
|---|---|
| `scrollcraft/builds/abracadabra-ai/index.html` | Chapter markup, styles beside `.time-*` / `.aeo-*`, nav labels, scroll spy, `flowIds`, a `setRangeState` / `resolveRangeFromScroll` pair wired into `updateScrollStates`, FAQ answer, JSON-LD FAQ entry. |
| `scrollcraft/builds/abracadabra-ai/tests/marketing-site.test.mjs` | The tests below. Write them first. |
| `scrollcraft/builds/abracadabra-ai/llms.txt` | One range paragraph. No new figures. |
| `scrollcraft/builds/abracadabra-ai/BRIEF.md` | A revision note once the chapter is on the page. |
| `docs/source-of-truth.md` | Site-build note once the chapter is on the page. Do not rewrite the portfolio tables for this. |
| `README.md` | Point at this plan until the chapter ships, then point at the shipped behavior. |

`scrollcraft.js` and `scrollcraft.css` stay untouched unless a pin-span or drift token is missing. The other engines are page-local script and page-local style. Match that.

## Tests, written first

In `scrollcraft/builds/abracadabra-ai/tests/marketing-site.test.mjs`:

1. **Order.** `main > section` ids put `time` immediately before `range` and `range` immediately before `aeo`.
2. **Copy.** The level-2 heading is "Software for the way your company actually works." The left column says the screen follows the order of work the team already trusts. The five control labels are Marketing, Applications, Machine learning, The record, The sale. Showdesk is named as the live-event product that runs entry through review, placements, and reports, not as "one shape."
3. **Plates.** The model plate is the only plate whose text includes `PIRX`. The product plate names Showdesk. The commerce plate names Canadian Discount Appliances and contains the handoff "the next room is the receipt."
4. **Boundary.** `#range` text does not match `201K`, `21.8K`, `SuperPatch`, `SPSign`, `S.T.A.R.`, or a percent sign used as a metric.
5. **Interaction.** Clicking "The record" sets `.range-engine` to `data-active-state="record"` and `aria-pressed="true"` on that button only.
6. **Scroll.** Extend the existing desktop scroll test so `#range` reaches `commerce` near the end of its pin, the same way `#time` reaches `arrive` and `#aeo` reaches `measure`.
7. **Index.** The chapter link order includes `III — Range` immediately before `IV — Answer`.
8. **Reduced motion.** All five plate bodies are visible without scrolling inside a clipped viewport, and the controls are not displayed.
9. **FAQ.** The new question's first sentence answers "No." and the JSON-LD `FAQPage` contains the same question text.

Run from `scrollcraft/builds/abracadabra-ai/`:

```bash
npm test
```

Confirm the new test fails on current `main` because `#range` does not exist, then implement.

## Verification before calling it done

- `npm test` green.
- `git diff --check` clean.
- Browser, desktop: scroll the pin through all five plates, then continue into AEO and confirm the receipt is still the first place the 201K figures appear.
- Browser, mobile (390px): five controls, no horizontal overflow, plates readable in document flow.
- Browser, reduced motion: five plates stacked, handoff sentence present, AEO still reachable.
- Keyboard: each control is focusable and at least 44px, matching the existing chapter-nav assertion.

## Out of scope

- New specimens, films, or screenshots.
- Renaming PIRX, or publishing model benchmarks.
- Moving Schema, the selected-work rail, or the benefits pin.
- A services page, a pricing table, or a second marketing site.
- Clearing held-out client names. If a name needs to become public, that is a source-of-truth decision, not a styling change.
