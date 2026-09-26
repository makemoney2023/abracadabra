# Anything digital — lead-in to the AEO chapter

**Status:** Shipped 2026-09-25. `#range` is on the homepage between `#time` and `#aeo`. Copy revised 2026-09-26 into a menu of services with no named work: headline **The only limit is what you can think of.**
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
3. The menu is not fixed. If they can describe it, the studio can build it.
4. The next room is how a brand gets found. The reader should want the receipt, not another menu.

## Narrative sequence

Five states, driven by scroll on desktop and by controls elsewhere: **Market → Product → Model → Record → Commerce**.

The left column stays put. The right column is one instrument, the same pattern as `.time-engine` and `.aeo-engine`: chrome, one active plate, a status line, and buttons.

The plates are a menu of services. No plate names a product, client, or project, and no plate links out.

| State | Plate title | What it offers |
|---|---|---|
| `market` | Marketing | Campaigns, films, websites, and content, written in the words your customers already use. |
| `product` | Applications | Custom software for the steps your team already runs: web apps, mobile apps, internal tools, and portals. |
| `model` | Machine learning | Models trained on your own data that predict, sort, and recommend, so decisions get made faster. |
| `record` | The record | A CRM or ERP built around your business: the pipeline, agreements, orders, inventory, and customer history in one place. |
| `commerce` | The sale | Online stores and lead generation that answer a buyer's questions and move them to the next step. |

The commerce plate closes the pin. Its last sentence is the handoff, and it is the only place this chapter points forward:

> Getting found works the same way. The next room is the receipt.

That sentence is the bridge into "Be the answer AI can verify." Do not preview 201K, 21.8K, clicks, or the pull date here. Do not add a sixth "Answer" state. AEO already is that state, at full length.

### Copy

- **Eyebrow:** The menu
- **Headline:** The only limit is what you can think of.
- **Support:** Pick one service or all of them. Each is built around how your company already works.
- **Qualifier:** Nothing on this menu is fixed. If you can describe it, we can build it.
- **Quiet link, under the qualifier:** The answer is next → `#aeo`
- **No primary button.** "Show us how it works" stays on the hero, the benefits pin, and the close. This chapter should release the reader into AEO, not start a second conversion path.

Status line as the plates advance: `Get the word out` → `Built around your steps` → `Decisions from your data` → `One place for every customer` → `From question to sale`.

### No named work in this chapter

The chapter is a menu, not a portfolio. Named proof lives elsewhere on the page: the pirx.ca receipt in `#aeo`, Schema, the selected-work rail, and the FAQ. Keeping names off the plates also keeps the machine-learning plate from implying that the Search Console figures prove any model.

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

- The five services, in outcome language.
- "The only limit is what you can think of" and "If you can describe it, we can build it." These describe the range of digital work, not a promise to build something the client should buy off the shelf.
- The existing promise that if a product they can buy already does the job, the studio says so. That sentence already lives in the FAQ and still holds.
- No product, client, or project names on the plates, and no outbound links from the plates.

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
2. **Copy.** The eyebrow is "The menu" and the level-2 heading is "The only limit is what you can think of." The left column says nothing on the menu is fixed. The five control labels are Marketing, Applications, Machine learning, The record, The sale.
3. **Plates.** No plate names Showdesk, PIRX, or Canadian Discount Appliances, and no plate contains a link. The commerce plate contains the handoff "the next room is the receipt."
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
