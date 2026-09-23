# Abracadabra AI catalog

One-page Scrollcraft gallery of shipped work. Brief is in `BRIEF.md`. Footage and sales packs live in `/outputs`.

```bash
# from this folder
npx --yes serve -l 4500

# behavior and responsive regression tests
npm test
```

Then open http://localhost:4500. Scroll is the timeline. The hero demonstrates the core mechanism in four explicit states: **Describe → Parse → Connect → Run it**. The dedicated AEO chapter follows the same interaction model: **Question → Answer → Verify → Measure**. On desktop both sequences resolve as their chapters scroll; on mobile they use direct controls in normal document flow; reduced motion presents every state as a static sequence. The fixed signal rail reports page progress, the utterance strip inks one syllable per specimen on larger screens, and the Showdesk promo remains the only video scrub on the page.

Copy comes from [`docs/source-of-truth.md`](../../../docs/source-of-truth.md). If the page and that file disagree, fix the file first, then the page.

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
