# Abracadabra marketing site — technological magic redesign plan

**Status:** Phase-four time travel chapter (`#time`) implemented and verified 2026-09-24 on top of the phase-three generalized hero, intent-and-context engineering state, and parallel-agent build sequence; supporting-page alignment, production analytics, and post-release measurement remain follow-up work. The range lead-in before `#aeo` is built: `#range` sits between `#time` and `#aeo`, specified in [anything-digital-lead-in-plan.md](anything-digital-lead-in-plan.md).
**Prepared:** 2026-09-23
**Surfaces:** `abra-ca-dabra.app` and `scrollcraft/builds/abracadabra-ai/`
**Source of truth:** [`docs/source-of-truth.md`](source-of-truth.md)
**Related media plan:** [`docs/scroll-world-review.md`](scroll-world-review.md)

## Phase-four plan: time travel chapter

The phase-three hero shows the mechanism; it does not show what the mechanism does to a calendar. Phase four adds one pinned chapter directly after the hero, `#time` ("Delivery that feels like time travel."), that makes the compression of a software delivery calendar legible without inventing a number for it.

### Narrative sequence

Four states, driven by scroll on desktop and by controls elsewhere: **Conventional → Engineer → Parallel → Arrive**.

- **Conventional** ("The serial calendar"): six lanes, Discover, Specify, Design, Build, Test, Release, laid end to end from Kickoff to a Conventional ship date. The gaps between lanes are the point: a conventional calendar is mostly waiting.
- **Engineer** ("Front-load the thinking"): the Discover and Specify lanes compress as intent and context are engineered into one brief before anything is built.
- **Parallel** ("Run everything at once"): Design, Build, Test, and Release stack in parallel from that brief instead of queueing behind one another.
- **Arrive** ("Arrive before you were due"): the Arrives marker lands well before the Conventional ship date and the remaining span is labeled "Time returned to you". The status reads "Arrived early".

The copy states the premise plainly: there is no sleight of hand, the work does not shrink, the gaps between the work disappear.

### Motion direction

- The `.time-engine` is a delivery calendar with a shared axis. Each lane carries `--start` and `--span`; the engine carries `--arrive` (1 in Conventional, shortened in Engineer, shortest in Parallel and Arrive). State changes animate lane position and width, the arrival marker, and the returned-time band, so the calendar visibly folds in on itself rather than cutting between static images.
- Panels cross-fade beside the engine; the active panel's title and body describe the state the engine is showing.
- The section pins with `data-sc-span="2.35"` and drifts the canvas to `#0A0912`, a slightly deeper, cooler tone than the hero so the chapter reads as its own room.

### Responsive and accessibility behavior

- Desktop (over 860px): scroll progress selects the state at fixed thresholds; clicking a control makes a manual choice that holds.
- Mobile (860px and under): the section runs in normal document flow (`data-sc-act` switched to `flow`), the engine sits above the copy, and the four controls drive the state directly.
- Reduced motion: the section is un-pinned, the four panels stack as static content, controls hide, and the engine renders its final Arrive state so the whole argument is readable without any scroll-driven change.
- Controls use `aria-pressed`; the engine has an `aria-label` describing what it compresses; the status element announces the current state.

### Copy direction

- Qualitative only. No durations, percentages, or calendar math appear anywhere in the chapter. The compression is shown by the geometry, not asserted by a figure.
- "At the speed of thought" remains the operating premise; the chapter never converts it into an elapsed-time promise.
- The Engineer state ties back to the hero's Engineer state so the two chapters read as one mechanism seen twice: once as what happens, once as what it does to time.

### Verification gates

- Playwright: the time travel chapter reaches all four states via controls, the arrival marker moves earlier through the sequence, engine text contains no numeric duration or percentage, and reduced motion exposes all four panels with the engine un-clipped.
- Visual: desktop Conventional and Arrive, mobile flow, and reduced motion captured and reviewed before merge.
- `npm test` green and `git diff --check` clean.

## Phase-three plan: from thought to running software

The phase-two hero proved the mechanism with Showdesk, but it asked a broad business audience to understand judges, secretaries, critiques, and certificates before they understood the studio. Phase three keeps Showdesk as proof while making the transformation legible to any operator.

The hero promise returns to the source-of-truth premise: **Abracadabra shrinks the gap between what is in an operator's head and what is running in production—from zero to scale, at the speed of thought.** The page demonstrates speed through coordinated parallel work. It does not publish an unsupported delivery duration or depict autonomous agents replacing human direction.

### Narrative sequence

The desktop hero remains one pinned scene with four scroll states:

1. **Describe** — a universal operation appears in ordinary business language: a customer request is routed, reviewed, returned when information is missing, approved, and delivered.
2. **Engineer** — before anything is built, two streams are engineered and converge:
   - **Intent** — what must be true when it ships: the request, the approved outcome, the review and exception rules, the owner.
   - **Context** — how the business already works: existing systems, data, roles, vocabulary, and constraints.
   - The streams resolve into one **Engineered build brief**: one precise model of the operation. This is the artifact every agent works from.
3. **Build** — the engineered brief dispatches five coordinated workstreams in parallel:
   - **Workflow** maps rules and handoffs;
   - **Experience** turns the operation into screens and actions;
   - **Engineering** assembles the production system;
   - **Quality** tests the normal path and exceptions;
   - **Launch** prepares the working demo and operating script.
4. **Run** — the workstreams converge into a live product. Showdesk is introduced here as one real example, not as prerequisite vocabulary.

The controls read **Describe → Engineer → Build → Run it**. The visible status progresses through **Listening → Intent and context engineered → Agents building in parallel → System live**.

Why the Engineer state exists: the most credible AI-delivery claims are not "the model wrote the code" but "the intent and context were engineered so the code was right the first time." Showing that step before the build tells operators their business knowledge is the input, not an afterthought, and it explains why five agents can work in parallel without drifting—they share one engineered brief.

### Motion direction

- The Build state is a construction lattice, not cartoon robots, decorative particles, or a fake terminal.
- The Engineer state shows two staggered streams—Intent and Context—each with a short label and its one-line meaning, joined by a connector into a single Engineered build brief. The connector is hidden on mobile, where the streams stack in one column above the brief.
- In the Build state the engineered brief enters from the left and splits into five named horizontal tracks.
- Each track advances through small, readable artifact states such as `rules`, `interface`, `system`, `tests`, and `demo`.
- Track signals move at slightly different rates and then synchronize at one convergence gate. The convergence supplies the transition into the live product.
- The choreography communicates speed by showing dependent work happening concurrently. It must not display fabricated elapsed times, completion percentages, commits, or test counts.
- Text, labels, and outputs remain semantic HTML. Motion enhances the explanation; it is not the only carrier of meaning.

### Responsive and accessibility behavior

- Desktop scroll position drives the four states.
- Mobile uses the four direct controls in normal document flow; the Build state becomes a compact five-row agent ledger without horizontal overflow.
- Reduced motion displays all four states as a static sequence and shows every agent workstream with its output.
- The skip control remains available and lands directly on the working-product state.
- Focus states, 44px targets, text contrast, and screen-reader labels remain intact.

### Copy direction

- **Eyebrow:** Software at the speed of thought
- **Headline:** From thought to working software.
- **Support:** Tell us what should exist. We engineer the intent and context behind it—then coordinated AI agents design, build, and test the system in parallel, while experienced people direct every decision.
- **Tag:** Intent and context engineered first. Five coordinated workstreams. One running system.
- **Engineer state labels:** Intent — What must be true when it ships; Context — How the business already works; Engineered build brief — One precise model of the operation.
- **Proof bridge:** One real example: this operation became Showdesk.

### Verification gates

- Browser assertions for the new headline, generalized operation, four revised labels, the Intent and Context streams converging into the Engineered build brief, five agent workstreams, convergence output, Showdesk proof bridge, skip behavior, and statuses.
- Scroll-driven desktop transition and direct mobile controls.
- Reduced-motion information parity for all states and workstreams.
- Horizontal-containment checks at 320, 390, 430, 768, 1280, 1440, and 1920 pixels.
- Visual checks of desktop Describe, Engineer, Build, and Run states plus the mobile Engineer stack and Build ledger.
- Browser console, keyboard focus, and direct-navigation regression checks.

## Phase-two decision summary

The homepage will become **The Operation Compiler**: visitors state an operation in ordinary language and watch it compile into actors, inputs, handoffs, approval gates, exceptions, outputs, and finally a working product surface. The page should behave like the software it sells, not like a brochure describing that software.

The art direction is **computational theatre with proof in the foreground**:

- A bright red/orange signal physically carries the visitor's intent through every chapter.
- Conversational text detaches into structured tokens, then locks into an executable workflow.
- Full-viewport optical surfaces, refractive edges, scan texture, and controlled perspective create the sense of advanced machinery.
- Real product UI takes over from the abstraction at every proof point.
- A dedicated Answer Engine Optimization sequence turns a buyer question into an answer block, entity graph, schema, source signals, and measured proof.
- The experience avoids generic AI styling: purple gradients, decorative particles, fake terminals, mystical symbols, and unexplained glow.

The new copy is deliberately shorter. The hero says **“Your operation, turned into software.”** Every following viewport makes one claim, demonstrates it, and places proof beside it.

## Phase-two implementation record

- Shipped the four-state **Describe → Parse → Connect → Run it** Operation Compiler using a real Showdesk workflow and product surface.
- Shipped the dedicated **Question → Answer → Verify → Measure** Answer Engine Optimization chapter with Readiness Check and Schema paths, dated Google Search Console proof, and explicit claim boundaries.
- Added the continuous signal rail, labeled chapter navigation, mobile direct controls, reduced-motion parity, complete mobile work cards, and a minimizable mobile film explanation.
- Added regression coverage for the required responsive widths, both state machines, film behavior, reduced motion, and direct navigation to the closing brief.
- Verified the desktop close and the mobile hero, AEO proof, selected work, film, minimized film, and close with saved screenshot readback; browser console and keyboard focus were also checked.

The homepage scope above is complete. The broader program remains open where this document explicitly calls for media recapture, supporting-page redesign, analytics-platform wiring, production Web Vitals, and post-release conversion measurement.

## Detailed execution gameplan

### 1. Reframe the first viewport

- Replace the long positioning paragraph with the six-word category claim.
- Keep only **Show us how it works** and **See what we've built**.
- Make the compiler surface the dominant object, spanning the viewport instead of sitting in a museum card beside the copy.
- Keep a visible “jump to product” control for visitors who do not want the sequence.

### 2. Build the Operation Compiler sequence

The desktop hero uses one pinned scene with four scroll states:

1. **Describe** — a real Showdesk operation appears as one operator sentence.
2. **Parse** — the sentence separates into actor, input, action, approval, exception, output, and timing.
3. **Connect** — the extracted parts assemble into a workflow; the signal shows ownership and decision gates.
4. **Run** — the workflow geometry aligns with the real Showdesk interface and yields to the product.

Mobile uses explicit state buttons and normal document flow. Reduced motion presents all four states at once.

### 3. Add a dedicated Answer Engine Optimization chapter

The AEO chapter is not a generic service card. It is a second pinned instrument:

1. A buyer asks a high-intent question.
2. The question fans out across the answer surfaces buyers use.
3. The page exposes the assets an answer can verify: direct answer, entity, schema, evidence, and source.
4. The sequence resolves into the measured pirx.ca proof.

The copy uses the approved claim **“Be the answer AI can verify.”** It presents AEO, GEO, and SEO as one discipline and links to both the Readiness Check and Schema. It never promises placement, claims a universal LLM retrieval mechanism, or mixes generated recommendations with measured scan output.

### 4. Make the signal continuous

- Add a fixed progress rail that advances with the page.
- Carry the same signal into compiler links, the AEO answer path, selected work, the film timeline, and the open final node.
- Change the signal's role by chapter—parse, connect, route, verify, transfer—so continuity does not become repetition.

### 5. Tighten the rest of the story

- Replace multi-paragraph explanations with one claim per viewport.
- Group proof as a small network of working systems rather than a list of capabilities.
- Keep the real Showdesk film as the interaction peak.
- Move the name origin below product and AEO proof.
- End with an unfinished workflow node representing the visitor's operation.

### 6. Verification gates

- Browser tests for hero copy, four compiler states, the AEO section and both CTAs, scroll-driven state changes, mobile controls, reduced-motion parity, and horizontal containment.
- Visual checks at 320, 390, 430, 768, 1280, 1440, and 1920 pixels.
- Keyboard, focus, console, lazy-media, and reduced-motion checks.
- Screenshot readback for the hero, AEO proof state, selected work, film, and close.

## Earlier implementation status — 2026-09-23

The earlier P0/P1 core remains the functional baseline in `scrollcraft/builds/abracadabra-ai/index.html` while phase two is implemented:

- the two-level CTA hierarchy, with the Readiness Check moved to a tertiary role;
- the three-state **Say it → Structure it → Run it** signature interaction, ending on the real Showdesk interface;
- labeled 44px chapter navigation and a compact mobile chapter readout;
- complete vertical selected-work cards on mobile;
- mobile-specific hero flow, collapsible film details, and a text-sequence fallback;
- reduced-motion information parity and responsive containment across the required viewport widths;
- a documented graphite, warm-ivory, signal-red, etched-grid visual system.

Automated browser behavior tests cover CTA hierarchy, navigation, responsive overflow, intent-state controls, mobile film behavior, and reduced-motion media loading.

The broader definition of done is intentionally not marked complete. Remaining work includes media recapture and re-encoding, captions/transcript hardening, supporting-page P2 alignment for `walkthrough.html` and `films.html`, production analytics-platform wiring, and post-release Web Vitals/conversion measurement.

## Why change

The current site already has strong positioning and proof. Its best moments are:

- the direct headline and operator-focused copy;
- the zero-to-scale receipt;
- real product surfaces and public links;
- the empty plinth;
- the scroll-scrubbed Showdesk film;
- the ABRACADABRA syllable progression.

The main gap is not credibility. It is that the central mechanism — thought becoming a system — is mostly described in copy rather than demonstrated visually.

The review also identified practical UX problems:

1. The homepage presents three competing hero and closing actions.
2. Roman-numeral navigation is elegant but cryptic, with undersized targets.
3. The roughly 15,000px desktop journey can feel long without stronger chapter transitions.
4. The product screenshot is secondary to the hero headline when the product should be proof of the promise.
5. The selected-work rail clips both imagery and copy on a 390px viewport.
6. The mobile film caption obscures much of the product footage.
7. Supporting catalog and walkthrough pages have mobile cropping, fixed-rail overlap, and excess spacing.
8. The local media set is large enough that richer effects must be progressively enhanced and tightly budgeted.

## Goals

### Business goals

- Make **Describe how you work** the unmistakable primary conversion.
- Help a qualified operator understand the offer within the first viewport.
- Demonstrate the studio's differentiator rather than merely stating it.
- Increase engagement with real work without turning the page into a portfolio menu.
- Preserve trust by keeping proof, sources, and product links visible.

### Experience goals

- The page should feel like an instrument, not a brochure.
- “Technologically magical” should mean visible transformation with understandable cause and effect.
- Every animated transition should advance the argument.
- Mobile should be a designed narrative, not a compressed desktop timeline.
- Reduced-motion users should receive the same information and hierarchy.

### Non-goals

- Replacing the proof-first showroom with a fantasy theme.
- Inventing product functionality, clients, metrics, or AI capabilities.
- Building a heavy 3D/WebGL experience solely for atmosphere.
- Treating the four named products as the limit of the studio's work.
- Turning the homepage into an exhaustive case-study archive.

## Audience and jobs to be done

The design should serve the arrivals already defined in the source of truth:

1. **Operator with an established process:** “Can you understand the way this actually works without flattening it into a template?”
2. **Founder replacing fragmented tools:** “Can one coherent system carry the customer and the operation?”
3. **Team that must sell what gets built:** “Will we leave with something we can demonstrate and explain?”
4. **Owner of a difficult, context-heavy problem:** “Will you take on the request other shops quietly decline?”

The first screen must answer, in order:

1. What is this? Bespoke software shaped around an existing operation.
2. Why is it different? Intent and context become the architecture.
3. Is it real? A working product surface is already visible.
4. What should I do? Describe how the operation works.

## Experience principles

### 1. Magic has a mechanism

Whenever the interface transforms, the visitor should understand what caused the change. A sentence becomes steps because phrases are identified. Steps become a workflow because dependencies are connected. The workflow becomes software because a real screen takes over.

### 2. Proof follows wonder

A surprising interaction should resolve into a product, metric, source, or operating detail. No ambient effect should make a claim by itself.

### 3. One signal, many states

Use one persistent visual motif — the Intent Signal — across the hero, schema, selected work, benefits, process, film, and close. Do not introduce a different visual gimmick for every chapter.

### 4. Benefits before implementation

Lead with what changes for the operator. Reveal schema, prompts, architecture, or models only after the outcome is clear.

### 5. Mobile gets a different choreography

Pinned scenes and horizontal rails may become stacked cards, step controls, or short crossfades. Preserve the argument, not the desktop geometry.

### 6. Motion is progressive

The core content must remain readable before JavaScript, with reduced motion, on a slow connection, and when a video cannot autoplay.

## The signature interaction

The hero should demonstrate the full brand mechanism in one understandable sequence.

### Input

A short operator statement appears as natural language:

> “The secretary reviews the judge's recording, fixes the draft, and releases the certificate before the team leaves.”

This is an example derived from the Showdesk workflow, not a generic AI prompt.

### Transformation

As the visitor scrolls or chooses **See how it resolves**:

1. Key phrases are underlined: `secretary`, `reviews`, `recording`, `draft`, `certificate`, `before the team leaves`.
2. The phrases lift into a lightweight structured rail:
   - actor;
   - input;
   - action;
   - approval gate;
   - output;
   - timing constraint.
3. The red Intent Signal connects them into an etched workflow.
4. The workflow aligns with regions in the real Showdesk interface.
5. The blueprint recedes and the actual product surface becomes dominant.

### Result

The visitor lands on a clear specimen card:

- **System:** Showdesk
- **Operation:** live-event review and reporting
- **Surface:** ringside phone to placements and reports
- **Proof:** live product and 44-second film

### Interaction rules

- The sequence should complete in one viewport on desktop.
- On mobile, use three explicit states: **Say it → Structure it → Run it**.
- The visitor must be able to skip directly to the product.
- Text remains selectable and accessible; do not render meaningful copy only to canvas.
- Reduced motion shows the three states as a static vertical sequence.
- The effect must work without requiring the visitor to type personal business information.

## Information architecture and CTA hierarchy

### Global actions

- **Primary:** Describe how you work
- **Secondary:** Watch the work
- **Tertiary:** Readiness Check, introduced in the situation/fit section and FAQ

The Readiness Check should not compete with the first decision in the hero. It is useful for visitors who are interested but not ready to describe an operation.

### Recommended chapter order

1. Hero: promise plus intent-to-system demonstration
2. Situation and name: why software usually fails to fit
3. Receipt: quantitative proof
4. Schema: a compact example of diagnosis becoming repair
5. Selected work: range of working systems
6. Benefits: what changes when the system fits
7. Empty plinth: the visitor's operation as the next specimen
8. Showdesk film: the deepest proof moment
9. Process and FAQ: how engagement works and common objections
10. Close: one primary action, one secondary action

## Page-by-page treatment

### Global shell and navigation

**Current issue:** Roman numerals communicate sequence but not destination, and their hit areas are too small.

**Plan:**

- Keep the numeral index as the visual shorthand.
- Reveal `I — Promise`, `II — Proof`, `III — Systems`, `IV — Film`, and `V — Process` on hover and keyboard focus.
- Give each target a minimum 44×44px interactive area.
- Add `aria-current="location"` to the active chapter.
- On mobile, replace the row of numerals with a compact progress control showing the current chapter label.
- Keep the ABRACADABRA syllable progression as a secondary atmospheric progress indicator, not as the only navigation.

**Acceptance checks:**

- Every chapter is reachable by keyboard.
- Labels are understandable without prior knowledge.
- Navigation does not overlap the headline, captions, or mobile safe areas.

### Hero

**Current issue:** The offer is clear, but three CTAs compete and the product surface reads as a small specimen beside a much larger promise.

**Plan:**

- Retain the approved headline and subhead.
- Keep only the primary and secondary CTAs above the fold.
- Make the product surface at least equal in visual importance to the copy.
- Replace the static screenshot/specimen stack with the signature interaction.
- Keep the eyebrow in signal red as the initial appearance of the Intent Signal.
- Use an explicit affordance such as **See how it resolves** for visitors who do not immediately scroll.

**Acceptance checks:**

- A visitor can identify the offer, proof, and next action in five seconds.
- The primary CTA is visually dominant.
- The product is recognizable without scrolling on desktop and before the end of the first mobile chapter.

### Situation and name

**Current issue:** The etymology is strategically valuable but can become a copy-heavy explanation.

**Plan:**

- Use the name once to frame the mechanism: “I create as I speak.”
- Visualize the distance between “the operation people describe” and “the software they were given.”
- Show fragments such as inbox, spreadsheet, spoken exception, and approval rule converging into one workflow.
- Keep the body copy plain and operational; do not repeat magical language.
- Introduce the Readiness Check here as the path for visitors who need help diagnosing fit.

### Receipt

**Current issue:** The proof is credible but visually behaves like a static report.

**Plan:**

- Preserve the exact cleared figures and source line.
- Reveal the progression rather than counting numbers theatrically:
  `blank domain → indexed questions → AI-surface impressions → clicks`.
- Use a small source trace or line plot derived only from verified data.
- Keep all figures visible without requiring animation.
- Link “how this happened” to a short explanation of the integrated AEO/GEO/SEO discipline.

**Acceptance checks:**

- No number is animated from zero in a way that implies false precision.
- Source and pull date remain legible.
- The section works as a static proof card under reduced motion.

### Schema specimen

**Current issue:** The specimen supports the argument but does not yet participate in the page's central transformation.

**Plan:**

- Show a question or visibility gap entering the Intent Signal.
- Resolve it into a small schema/repair map.
- End on the real Schema product surface.
- Distinguish measured scan output from generated recommendations.
- Preserve the source-of-truth rule that the check does not publish a score it did not measure.

### Selected work

**Current issue:** Desktop horizontal movement is visually interesting; mobile currently clips imagery and copy.

**Desktop plan:**

- Keep the horizontal museum rail.
- Add a visible progress track and previous/next affordances.
- Let the Intent Signal travel through specimen cards and stop at each outcome.
- Keep public product links obvious and keyboard reachable.
- Treat the range statement as the rail's conclusion, not as another oversized card.

**Mobile plan:**

- Replace horizontal translation with a vertical stack or snap carousel contained within the viewport.
- Show one complete card at a time: image, outcome, description, and live link.
- Provide explicit pagination and a visible next-card cue.
- Place the range statement after the cards at normal reading width.

**Acceptance checks:**

- No card or sentence is clipped at 320px, 390px, or 430px.
- Cards can be traversed without precision swipes.
- Screen-reader order matches visual order.
- The user can reach every live product link using keyboard controls.

### Benefits

**Current issue:** The section has strong copy but large dead areas and little relationship to the mechanism established above.

**Plan:**

- Group benefits into four operating outcomes:
  - expertise scales;
  - the sale advances on-screen;
  - the capability stays owned;
  - complexity remains accepted.
- Reveal one outcome at a time as the Intent Signal branches into the relevant system behavior.
- Keep all outcome headings scannable in the resting state.
- End with one **Describe how you work** CTA.

### Empty plinth

**Current issue:** The restraint is memorable and should not be filled with decorative effects.

**Plan:**

- Preserve the empty frame and silence.
- Let the Intent Signal arrive and stop at the border.
- Use a subtle cursor/caret or registration mark to imply that the next specimen has not been described yet.
- Keep the copy short: the visitor's operation is next.
- Do not place a button inside the plinth; allow anticipation to carry into the film.

### Showdesk film

**Current issue:** This is the strongest proof moment, but the mobile caption card obscures much of the interface.

**Plan:**

- Keep scroll-scrubbing and the museum-film framing.
- Re-encode the source using the keyframe guidance in `docs/scroll-world-review.md`.
- Make the caption panel collapsible on mobile after its heading has been read.
- Synchronize concise annotations to genuine product events: intake, review, approval, placement, report.
- Do not overlay text where it covers the action being described.
- Provide a conventional play control and transcript as alternatives to scroll control.

**Acceptance checks:**

- At least 70% of the important product region remains visible on mobile.
- The film is operable by keyboard and touch.
- Captions and transcript are available.
- Reduced motion uses poster frames plus the same explanation.

### Process and FAQ

**Plan:**

- Render the three moves as a compact continuation of the hero:
  `describe → build → leave with the system, film, and script`.
- Use diagrams only where they clarify ownership, decision gates, or handoff.
- Keep FAQ answers answer-first so search and answer engines can quote them.
- Introduce the Readiness Check naturally in the relevant FAQ rather than as a universal CTA.
- Keep claims aligned with the source-of-truth document.

### Closing conversion

**Current issue:** The close repeats three equal-weight choices.

**Plan:**

- Preserve **Say what you want built. We'll build it.**
- Show the Intent Signal ending in a single open input frame or brief card.
- Primary button: **Describe how you work** or the existing close label **Open a brief**, selected consistently with the destination.
- Secondary text link: **Watch the work**.
- Move the Readiness Check to a smaller supporting sentence.
- Explain exactly what the visitor should bring and what they will receive.

## Visual system

### Color

| Role | Direction | Purpose |
|---|---|---|
| Canvas | Near-black graphite | Keeps the showroom atmosphere |
| Primary text | Warm ivory | Softer and more ownable than pure white |
| Secondary text | Warm gray | Supports long-form reading |
| Signal | Red/orange | Marks intent, active state, and primary action |
| Structural line | Low-contrast graphite/ivory | Grids, schema, and specimen borders |
| Optical surface | Translucent neutral glass | Temporary structured states, never body-copy containers |

The signal color is functional. Do not spread it across large decorative gradients.

### Typography

- Retain the contrast between confident display type and precise mono labels.
- Increase body-text contrast and line height where long paragraphs currently recede.
- Keep all-caps mono labels short.
- Use sentence case for actions and chapter names.
- Avoid novelty type that makes the studio feel like a game or occult brand.

### Surfaces

- **Specimen frame:** real product screenshot or film with a concise evidence card.
- **Intent strip:** natural-language phrase under active interpretation.
- **Blueprint panel:** nodes, constraints, and relationships derived from that phrase.
- **Receipt card:** metric, source, and meaning.
- **Open frame:** reserved state for the visitor's operation.

## Motion system

### Motion roles

1. **Trace:** the Intent Signal draws a relationship.
2. **Resolve:** loose language aligns into structured elements.
3. **Transfer:** blueprint geometry maps to a real interface.
4. **Reveal:** proof enters only after its cause is understood.
5. **Rest:** every chapter has a stable reading state.

### Timing principles

- Interface feedback: approximately 120–200ms.
- Small structural transitions: approximately 250–450ms.
- Chapter transitions: approximately 500–800ms.
- Scroll-scrubbed scenes: tied to meaningful product events, not arbitrary distance.
- Use one easing family and reserve spring behavior for direct manipulation.

### Motion guardrails

- No perpetual particle fields.
- No text that must be chased while scrolling.
- No parallax on long body copy.
- No horizontal pinning on mobile unless the entire current card remains readable.
- No motion-only state change; text, focus, and semantics must update too.
- `prefers-reduced-motion` replaces tracing and scrubbing with explicit states and poster frames.

## Responsive strategy

The redesign should define behavior at content breakpoints rather than simply scaling dimensions.

### Desktop

- Two-column hero with synchronized copy and transformation.
- Pinned sequences may be used when the resting state remains understandable.
- Selected work can remain horizontal with controls and progress.

### Tablet

- Reduce pin duration.
- Keep product and evidence card in a single framed region.
- Allow specimen cards to wrap before copy becomes narrow.

### Mobile

- Stack copy and product.
- Convert pinned transformations into discrete states.
- Replace horizontal museum rail with complete cards.
- Collapse film annotations after their first appearance.
- Keep navigation, progress, and primary action clear of browser and device safe areas.

### Required viewports

Test at minimum:

- 320×568;
- 390×844;
- 430×932;
- 768×1024;
- 1280×800;
- 1440×1000;
- 1920×1080.

## Accessibility requirements

- WCAG 2.2 AA color contrast for text and controls.
- Minimum 44×44px primary touch targets.
- Visible focus indicators that use more than color alone.
- Semantic headings that preserve the chapter hierarchy.
- Landmarks and accessible chapter labels.
- Meaningful product imagery has concise alternative text.
- Decorative traces and grids are hidden from assistive technology.
- Videos include captions; substantive films include transcripts.
- Scroll-driven states can be reached by keyboard and do not trap focus.
- Reduced-motion mode contains all copy, proof, and calls to action.
- The experience remains usable at 200% zoom and with text spacing overrides.

## Performance budget

The signature interaction should be implemented primarily with HTML, CSS, SVG, and existing media. WebGL requires a separately justified prototype.

### Budgets

- Initial critical JavaScript: target under 150KB compressed for site-specific code.
- Hero image/poster: target under 250KB on mobile and 450KB on desktop.
- No deep-page video fetched before it approaches the viewport.
- One active video decoder at a time.
- CLS target below 0.1.
- LCP target below 2.5 seconds at the 75th percentile.
- INP target below 200ms at the 75th percentile.

### Media plan

- Provide AVIF/WebP posters at responsive sizes.
- Re-encode scrubbed video with short keyframe intervals and `faststart`.
- Provide mobile encodes with reduced dimensions and bitrate.
- Pause and unload films outside their chapter.
- Preserve poster-frame and transcript fallbacks when autoplay or seeking is unavailable.

## Measurement plan

### Core conversion events

- `primary_cta_view`
- `primary_cta_click`
- `brief_start`
- `brief_complete`
- `secondary_work_click`
- `readiness_check_click`

### Narrative engagement events

- `intent_demo_start`
- `intent_demo_complete`
- `proof_receipt_view`
- `specimen_view` with specimen identifier
- `specimen_live_link_click`
- `film_start`
- `film_25`, `film_50`, `film_75`, `film_complete`
- `faq_open` with question identifier

### Diagnostic dimensions

- viewport category;
- reduced-motion preference;
- navigation method where available;
- connection/media fallback state;
- chapter at exit.

Avoid treating raw scroll depth as success. The primary measures are qualified CTA progression, product-proof engagement, and completion of the brief.

## Implementation workstreams

### Workstream A — Foundation and responsive repair (P0)

1. Establish the two-level CTA hierarchy.
2. Enlarge and label chapter navigation.
3. Replace the mobile selected-work rail.
4. Repair supporting catalog and walkthrough mobile cropping/overlap.
5. Add reduced-motion and keyboard behavior to existing pinned sections.
6. Add analytics baselines before the visual redesign changes behavior.

**Exit criteria:** the current site is usable and measurable at all required viewports without introducing the new visual system.

### Workstream B — Signature hero prototype (P0)

1. Storyboard the phrase-to-workflow-to-product sequence.
2. Build a static three-state prototype.
3. Add the Intent Signal trace and transfer motion.
4. Create mobile and reduced-motion variants.
5. Test comprehension with the real approved hero copy.
6. Measure bundle, LCP, and interaction cost.

**Exit criteria:** the prototype communicates the mechanism without narration, ends on a real product, and meets performance/accessibility budgets.

### Workstream C — Design-system extraction (P1)

1. Define color, type, spacing, and motion tokens.
2. Build specimen, intent-strip, blueprint, receipt, and open-frame patterns.
3. Define chapter transition and progress behavior.
4. Document responsive variants.
5. Create fixtures using real cleared content.

**Dependency:** Workstream B establishes the visual language before it is generalized.

### Workstream D — Homepage chapters (P1)

Implement in vertical slices:

1. hero and global shell;
2. situation/name and receipt;
3. Schema and selected work;
4. benefits and plinth;
5. film;
6. process, FAQ, and close.

Each slice includes desktop, mobile, reduced motion, analytics, accessibility, and performance verification before the next slice starts.

### Workstream E — Media hardening (P1)

1. Recapture products as continuous takes where practical.
2. Encode scrub-friendly desktop and mobile variants.
3. Generate responsive posters.
4. Add captions and transcripts.
5. Validate seams, seeking, and decoder cleanup.

This work follows the more specific capture guidance in `docs/scroll-world-review.md`.

### Workstream F — Supporting pages (P2)

1. Carry the global shell and tokens into `walkthrough.html` and `films.html`.
2. Keep the walkthrough as a flight and the films page as an archive.
3. Remove duplicated navigation patterns that compete with the homepage.
4. Ensure all pages point back to the same primary conversion.

## Delivery phases and gates

### Gate 1 — Direction approval

Approve:

- Intent Signal with Living Blueprint mechanics;
- the two-level CTA hierarchy;
- the proposed chapter order;
- mobile-specific choreography;
- performance and accessibility budgets.

No broad visual implementation should begin before these decisions are stable.

### Gate 2 — UX foundation

Review the repaired current experience before adding the signature interaction. Confirm:

- mobile cards no longer clip;
- navigation is understandable;
- CTA hierarchy is consistent;
- analytics baseline is active.

### Gate 3 — Hero prototype

Review desktop, mobile, and reduced-motion recordings of the signature interaction. Confirm:

- the mechanism is understandable;
- the product remains the proof;
- motion feels precise rather than decorative;
- performance stays within budget.

### Gate 4 — Full design-system application

Review representative frames from every chapter and one continuous page recording. Confirm that the Intent Signal remains coherent without becoming repetitive.

### Gate 5 — Release candidate

Run the complete verification matrix below and compare conversion and engagement against the baseline.

## Verification matrix

### Functional

- All navigation and CTA destinations resolve.
- Every public product link works.
- Scroll-driven sections enter and leave cleanly.
- Conventional video controls work independently of scroll.
- Analytics events fire once with the expected labels.

### Visual

- No clipping, overlap, or unreadable text at required viewports.
- Every chapter has a stable resting state.
- Product UI remains legible.
- The Intent Signal is visually continuous across chapter boundaries.
- The empty plinth remains restrained.

### Accessibility

- Automated accessibility scan has no serious or critical findings.
- Complete keyboard traversal succeeds.
- Screen-reader landmarks and headings are coherent.
- Reduced-motion review preserves all information.
- Zoom and text-spacing checks pass.

### Performance

- Production Lighthouse runs meet agreed budgets.
- Web Vitals are monitored after release.
- Deep media does not load during the initial page request.
- Memory and active decoders do not accumulate during a full-page traversal.

### Content and claims

- Copy matches `docs/source-of-truth.md`.
- The receipt uses the latest approved figures and printed pull date.
- Wellness language remains non-diagnostic.
- No unnamed or uncleared client is exposed.
- Portfolio language continues to describe proof of range, not a service ceiling.

## Risks and mitigations

| Risk | Consequence | Mitigation |
|---|---|---|
| The visual metaphor becomes too abstract | Visitors admire the page but miss the offer | End every transformation on real product proof and plain-language captions |
| Scroll choreography breaks on mobile | Core proof becomes unreadable | Design discrete mobile states before implementing desktop pinning |
| Motion increases initial load | Weakened first impression and search performance | Progressive enhancement, strict budgets, poster-first media |
| The signal motif becomes repetitive | Long page feels mechanically uniform | Vary its role — trace, resolve, transfer, rest — without introducing new motifs |
| “Magic” overwhelms operator credibility | Brand feels theatrical or vague | Restrict magical language to the name and mechanism; keep facts and actions plain |
| Proof becomes stale | Trust damage | Keep source dates visible and define a re-pull step before release |
| Product footage is obscured by annotations | The strongest evidence loses impact | Reserve annotation zones and make mobile captions collapsible |

## Decisions still needed

These choices do not block documentation, but they should be resolved at Gate 1:

1. Should the primary destination label remain **Describe how you work** everywhere, or should the close retain **Open a brief**?
2. Should the intent demonstration use Showdesk throughout, or should it transition from a generic operation into the closest matching specimen?
3. Should chapter navigation remain Roman numerals with revealed labels, or move to labels at desktop sizes too?
4. Is the Readiness Check tertiary across the whole homepage, or primary for selected acquisition campaigns through dedicated landing URLs?
5. Which current analytics platform will receive the measurement events?

## Definition of done

The redesign is complete when:

- the offer, proof, and primary action are clear in the first viewport;
- the page visibly demonstrates intent becoming a working system;
- real products remain more prominent than visual effects;
- mobile contains no clipping, hidden copy, or precision-only controls;
- keyboard, screen-reader, reduced-motion, zoom, and caption checks pass;
- performance remains within the defined budgets;
- the source-of-truth claims remain intact;
- conversion and proof-engagement events are measured;
- the homepage, walkthrough, and film archive behave as one coherent system with distinct jobs.
