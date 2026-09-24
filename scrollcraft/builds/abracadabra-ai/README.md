# Abracadabra AI catalog

One-page Scrollcraft gallery of shipped work. Brief is in `BRIEF.md`. Footage and sales packs live in `/outputs`.

```bash
# from this folder
npx --yes serve -l 4500

# behavior and responsive regression tests
npm test
```

Then open http://localhost:4500. Scroll is the timeline. The hero demonstrates the core mechanism in four explicit states: **Describe → Engineer → Build → Run it**. Its Engineer state converges an Intent stream and a Context stream into one engineered build brief before anything is built; its Build state dispatches five coordinated AI-agent workstreams from that brief and converges their outputs into a working system. The time travel chapter that follows the hero moves a delivery calendar through **Conventional → Engineer → Parallel → Arrive** to show the serial calendar folding in on itself, without stating a duration. The dedicated AEO chapter follows **Question → Answer → Verify → Measure**. On desktop these sequences resolve as their chapters scroll; on mobile they use direct controls in normal document flow; reduced motion presents every state as a static sequence. The fixed signal rail reports page progress, the utterance strip inks one syllable per specimen on larger screens, and the Showdesk promo remains the only video scrub on the page.

Copy comes from [`docs/source-of-truth.md`](../../../docs/source-of-truth.md). If the page and that file disagree, fix the file first, then the page.

## Design revision — 2026-09-24: Time travel chapter

- Added a pinned chapter, `#time` (**Delivery that feels like time travel.**), directly after the hero. It carries `data-sc-span="2.35"` and drifts the canvas to `#0A0912`.
- The engine is a six-lane delivery calendar (Discover, Specify, Design, Build, Test, Release) from Kickoff to a Conventional ship date. Four states, **Conventional → Engineer → Parallel → Arrive**, animate lane position and width, the Arrives marker, and a "Time returned to you" band via `--start`, `--span`, and `--arrive` custom properties.
- Panels beside the engine: "The serial calendar", "Front-load the thinking", "Run everything at once", "Arrive before you were due". The status element moves from "Serial calendar" to "Arrived early".
- Desktop scroll selects the state at fixed thresholds; clicking a control holds a manual choice. On mobile the section runs in normal flow with direct controls. Under reduced motion the section is un-pinned and the four panels stack statically with the engine in its final state.
- Copy is qualitative only. Test 8 asserts that no duration or percentage appears in the engine text; Test 11 asserts reduced-motion parity.
- Verification: `npm test` 11/11, `git diff --check` clean, desktop, mobile, and reduced-motion screenshots reviewed.

## Design revision — 2026-09-24: Intent and context engineered before the build

- Replaced the hero's **Map** state with **Engineer**: the sequence now reads **Describe → Engineer → Build → Run it**.
- The Engineer state shows an **Intent** stream (what must be true when it ships) and a **Context** stream (how the business already works) converging into one **Engineered build brief**; the Build state dispatches its five agent workstreams from that brief.
- Rewrote the hero lede and tag so intent and context engineering is stated before the parallel build; statuses now read Listening → Intent and context engineered → Agents building in parallel → System live.
- Synced `docs/source-of-truth.md`, `BRIEF.md`, `llms.txt`, and the plan document; added a browser test for the Engineer state.

## Design revision — 2026-09-23: Thought-to-software agent build

- Restored the source-of-truth promise **From thought to working software** and the “zero to scale, at the speed of thought” premise.
- Replaced the Showdesk-specific opening workflow with a universal request, review, exception, approval, and outcome sequence.
- Added a semantic, animated parallel build: Workflow, Experience, Engineering, Quality, and Launch agents work from one shared brief and converge into one human-directed delivery.
- Moved Showdesk to the Run state, where it works as proof rather than prerequisite context.
- Communicates speed through parallel choreography without inventing a delivery-time guarantee, commits, test counts, or progress metrics.

## Deployment

Live at [abra-ca-dabra.app](https://abra-ca-dabra.app/). The Vercel project `abracadabra` (personal account `makemoney2023`) is linked to this repository with this folder as its root directory, so every push to `main` redeploys the site with no build step. `www.abra-ca-dabra.app` redirects to the apex with a 308. Domains were attached to the project on 2026-09-23; before that the apex resolved to Vercel but returned `DEPLOYMENT_NOT_FOUND`.

## Design revision — 2026-09-23: Operation Compiler and AEO

- Reframed the first viewport around **Your operation, turned into software.**
- Expanded the hero into an Operation Compiler that transforms a real Showdesk statement into operational tokens, a connected workflow, and the live interface.
- Added a dedicated Answer Engine Optimization chapter that turns a buyer question into a direct answer, machine-legible evidence path, and dated Google Search Console proof.
- Added scroll-driven desktop states, explicit mobile controls, reduced-motion information parity, and a continuous page-progress signal.
- Kept claim boundaries visible: no placement guarantee, no universal retrieval claim, and measured scan findings remain separate from generated recommendations.
- Updated browser tests to cover both four-state sequences, CTAs, proof, responsive containment, and reduced-motion behavior.

## Earlier design revision — 2026-09-23

- Reframed the homepage as an intent-to-system observatory using graphite, warm ivory, a functional red/orange signal, etched grids, and restrained phosphor status.
- Replaced the static hero specimen with an accessible operator-sentence → workflow blueprint → live Showdesk sequence.
- Reduced the hero and close to one primary action (**Describe how you work**) and one secondary action (**Watch the work**); the Readiness Check is now tertiary.
- Added labeled 44px chapter targets and a compact mobile current-chapter readout.
- Replaced the mobile horizontal work rail with complete vertical cards and removed narrow-screen overflow at the required 320–1920px test widths.
- Added a mobile film-details toggle and a text sequence fallback; the minimized state leaves more than 85% of the viewport available to the product footage.
- Added browser behavior tests for navigation, state controls, responsive containment, film details, and reduced-motion loading.

## Search, answer engines, and AI surfaces

- Every page has a colon-style `<title>`, a description under 160 characters, a canonical URL on `https://abra-ca-dabra.app/`, Open Graph and Twitter cards, and a JSON-LD graph. The catalog carries `Organization`, `WebSite`, `WebPage`, an `ItemList` of the named specimens, and a `FAQPage`; the walkthrough carries `WebPage` plus an `ItemList` of its eight legs; the films page carries `CollectionPage` plus one `VideoObject` per cut.
- The walkthrough is rendered by script, so it also ships a visually hidden `h1` and a `<noscript>` article with the full copy of all eight legs for crawlers that do not execute JavaScript.
- FAQ answers lead with the answer. Figures on the receipt act carry their source and pull date in the markup, not only in the design.
- `robots.txt` allows the AI answer-engine crawlers by name and points at `sitemap.xml`, which lists the three pages with image and video entries. `llms.txt` is the quotable summary for language models, including the non-diagnostic rule for the wellness tools and the instruction to cite the pirx.ca figures with their date.
- Only the 44-second promo states a `duration`; the other cuts were not measured, so they do not claim one.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | The catalog. Distinct scenes on the Scrollcraft engine (`scrollcraft.js`, `scrollcraft.css`). |
| `walkthrough.html` | The flight. Eight legs of real product footage chained as one scroll-scrubbed take on the scroll-world engine (`scroll-world.js`, copied from `.cursor/skills/community/scroll-world/references/scrub-engine.js`). |
| `films.html` | The archive. Source cuts as plain players, `preload="none"`. |
| `robots.txt`, `sitemap.xml`, `llms.txt` | Crawler files. Deploy them at the site root next to `index.html`. |

Walkthrough legs live in `assets/world/` (desktop `.mp4`, mobile `-m.mp4`, WebP posters). Encoded per the scroll-world skill: `-g 8 -keyint_min 8 -sc_threshold 0 +faststart`, crf 20; mobile 720w at `-g 4`, crf 23. Review and improvement plan: [`docs/scroll-world-review.md`](../../../docs/scroll-world-review.md).
