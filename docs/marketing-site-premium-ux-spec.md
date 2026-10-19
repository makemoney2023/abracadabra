# Abracadabra marketing site — premium UX specification and implementation plan

**Status:** Implemented on branch `cursor/premium-ux-implement-55e8` (2026-10-19). Phases 1–7 landed together because they share the design system. PiRX figures follow `scripts/site-data.mjs` (398K search impressions and 46.5K AI-feature impressions, Jul 18 to Oct 17, 2026), which is the published record. The earlier 375K / 43.5K pair in this spec was stale.
**Prepared:** 2026-10-19
**Surfaces:** `abra-ca-dabra.app` and `scrollcraft/builds/abracadabra-ai/`
**Source of truth:** [`docs/source-of-truth.md`](source-of-truth.md)
**Related plans:** [`docs/marketing-site-technological-magic-plan.md`](marketing-site-technological-magic-plan.md), [`docs/anything-digital-lead-in-plan.md`](anything-digital-lead-in-plan.md), [`docs/scroll-world-review.md`](scroll-world-review.md)

---

## 1. Purpose and scope

This document turns the 2026-10-19 UI/UX audit of the marketing site into a build-ready specification. It covers every defect found and every premium recommendation made (R1–R15 from the audit, R16–R27 from a second review of the site and of this plan), in enough detail that each item can be picked up as an isolated task with its own acceptance criteria and test.

**In scope:** every page under `scrollcraft/builds/abracadabra-ai/` that ships to `abra-ca-dabra.app`: the homepage (`index.html`), `films.html`, `404.html`, the generated services / portfolio / products / course pages (`scripts/site-pages.mjs`), the shared chrome (`scripts/site-chrome.mjs`), the blog (`scripts/build-blog.mjs`, `scripts/blog.mjs`, `blog/blog.css`), and the stylesheets `assets/site.css`, `assets/restored-motion.css`.

**Out of scope:** copy rewrites beyond what a layout change requires, new sections or pages other than the `/start/` intake page (R19) and the proof band (R20), the dashboard / app surfaces, analytics, and anything under `scrollcraft/` that is not part of the `abracadabra-ai` build.

### 1.1 Audit method (what the findings are based on)

- 12 pages × 13 viewports = 353 Playwright captures (`playwright-core`, headless Chrome at `/usr/bin/google-chrome`).
- Viewports: 320, 360, 375, 390, 414, 768, 834, 1024, 1280, 1366, 1440, 1536, 1920 wide, plus 844×390 landscape.
- Each capture recorded: horizontal overflow (`document.documentElement.scrollWidth` vs `innerWidth`), console errors, offending overflow elements, and tap-target sizes of interactive elements.
- Both `prefers-reduced-motion: no-preference` and `reduce` were run on the homepage.

Zero console errors on any page at any viewport. Landscape phone (844×390) renders correctly. The findings are therefore about layout, consistency and polish, not about broken code.

### 1.2 Definitions

| Term | Meaning in this document |
|---|---|
| Required widths | 320, 390, 768, 1024, 1280, 1440, 1920. Every acceptance criterion that says "at all required widths" means these seven. |
| Overflow-free | `document.documentElement.scrollWidth <= window.innerWidth` after fonts and layout settle. |
| Tap-target floor | 24×24 CSS px minimum (WCAG 2.2 SC 2.5.8). Primary navigation and CTAs target 44×44 (Apple HIG) / 48×48 (Material). |
| Cache-bust | The `?v=YYYYMMDDx` query on `assets/site.css` and `assets/restored-motion.css` links in `index.html` (currently `?v=20261018c`) and the equivalent emitted by `scripts/site-pages.mjs`. Every PR that touches CSS bumps it. |

---

## 2. Design principles for the premium pass

These are the decisions the rest of the spec follows. They are stated once here so individual items do not re-argue them.

1. **One system, not one page.** Buttons, cards, borders, radii, shadows and section spacing are defined once in `assets/site.css :root` and consumed everywhere, including the blog and the 404 page. Duplicated rules are removed, not reconciled.
2. **Fill the viewport at desktop.** Above 1280px the site currently leaves roughly half the width empty. The page column widens and hero/band layouts gain a right column so the composition reads as designed for the screen rather than scaled up from a phone.
3. **Every interactive element has a size, a hover state, and a focus state.** No text link doubles as a primary call to action. No link is under the tap-target floor.
4. **Mobile is a first-class layout, not a collapsed desktop.** The menu is a full-height sheet, horizontal scrollers announce themselves, and sticky elements respect the fixed header.
5. **Reduced motion is a layout, not an exception.** Every rule inside `@media (prefers-reduced-motion: reduce)` is tested at the same widths as the motion version.
6. **Change behaviour behind tests.** Each item below names the Playwright assertion that proves it. A PR for an item is not done until that assertion exists and passes.

---

## 3. Current state reference

Facts the spec relies on, with file anchors so an implementer can go straight to the line. Line numbers are as of commit `75159cf1` on `main`.

### 3.1 Tokens (`assets/site.css`)

```css
:root {
  --canvas:#070706; --surface:#11110F;
  --ink:#F5F0E8; --ink-soft:#AAA49A;
  --accent:#FF4B24; --cyan:#8DEBF2; --green:#C6FFB3;
  --line: rgba(245,240,232,0.14);
  --font: "IBM Plex Sans", ...; --label / --display: "Inter Tight", ...;
  --page: 72rem;
}
```

- A second border token `--ui-border-color: rgba(245,240,232,0.08)` is declared at `assets/site.css:609` and again at `blog/blog.css:1388`. It disagrees with `--line` (0.14 vs 0.08 alpha).
- `.btn { border-radius: var(--ui-r-control) }` at `assets/site.css:642` and `blog/blog.css:1421`; `.site-nav__cta` (`site.css:191-195`) has square corners.
- Headline scale: `h1 { font-size: clamp(2.4rem, 5vw, 4.4rem) }`, `h2 { clamp(1.8rem, 3vw, 2.8rem) }`.

### 3.2 Breakpoints

| Behaviour | Breakpoint | Anchor |
|---|---|---|
| Nav collapses to `<details class="site-nav__menu">` | `max-width: 1099px` | `site.css:197-236` |
| Hero two-column, `.fn-grid` three-column | `min-width: 1024px` | `site.css:238-300`, `site.css:449` |
| `.restored-pin` unpins | `max-width: 1100px` | `restored-motion.css:889-898` |
| `#name` pin height `190vh` (170vh on smaller) | — | `restored-motion.css:888-892` |
| `README.md:142` says nav collapses "under 768px" | wrong; actual is 1099px | README |

### 3.3 Sticky header

`.site-nav { position:sticky; top:0; z-index:5; background:rgba(7,7,6,0.94); border-bottom:1px solid var(--line); padding:0.55rem 1.25rem }`. There is no `scroll-padding-top` on `html` and no `scroll-margin-top` on any section, so in-page anchors and pinned stages land under the header.

### 3.4 Fonts and media

- Google Fonts `<link>` for IBM Plex Sans + Inter Tight in `index.html:31-33` and `scripts/site-pages.mjs:266-268`.
- `films.html:185-187` loads **Outfit** instead of Inter Tight. The archive page therefore uses a different display face from the rest of the site.
- All `<video>` elements in `index.html:679-705` and `films.html:248-328` already use `preload="none"` plus a `poster`. Video preload is **not** a performance issue and is not in the plan.

### 3.5 Known duplication

| Rule | Locations |
|---|---|
| `.site-nav__mark` declares `font-family` twice | `site.css:94-103` |
| `.hero__wm` declared twice | `site.css:284` and `~303` |
| `.sales-secondary` declared twice | `blog.css:766` and `blog.css:1159` (hover/focus at `1167-1191`) |
| `--ui-border-color` declared twice | `site.css:609`, `blog.css:1388` |
| FAQ section styled in two places | `site.css` and `blog.css` |
| `.marquee__list[aria-hidden="true"] { display:none }` inline in `index.html:38` | should live in `site.css` |

---

## 4. Defect register

Each defect: what was observed, root cause, the change, acceptance criteria, and the test that proves it. Defect IDs are referenced from the phase plan in section 8.

### D1 — Reduced-motion marquee overflows the page on the homepage (all viewports)

**Observed.** With `prefers-reduced-motion: reduce`, `document.documentElement.scrollWidth` exceeds the viewport by 2585px at 320 and 1345px at 1920. The whole page gains a horizontal scrollbar.

**Root cause.** `assets/site.css:597-601`:

```css
@media (prefers-reduced-motion: reduce) {
  .marquee__track { animation:none; flex-wrap:wrap; width:auto }
}
```

The track wraps, but `.marquee__list` (`site.css:391-408`) is still a non-wrapping flex row sized for the infinite scroll, and the duplicate `aria-hidden="true"` list is only hidden by an inline rule in `index.html:38`. The visible list is wider than the viewport.

**Change.**
1. Move the `.marquee__list[aria-hidden="true"] { display:none }` rule from `index.html:38` into `site.css` so it applies to the reduced-motion block and any page that renders a marquee.
2. In the reduced-motion block, convert the marquee to a static wrapped grid:

```css
@media (prefers-reduced-motion: reduce) {
  .marquee { overflow:hidden }
  .marquee__track { animation:none; width:auto; display:block }
  .marquee__list { display:flex; flex-wrap:wrap; gap:0.5rem 1.25rem; justify-content:center; width:auto; padding-inline:1.25rem }
  .marquee__list[aria-hidden="true"] { display:none }
}
```

3. Items keep their existing typography; wrapped rows are centred so the band still reads as a band.

**Acceptance.** Homepage is overflow-free at all required widths with reduced motion on. The marquee is visually present (not hidden) and shows each item exactly once.

**Test.** Add to `tests/marketing-site.test.mjs`: `'homepage stays inside the viewport with prefers-reduced-motion: reduce at every required width'` — uses `page.emulateMedia({ reducedMotion: 'reduce' })`, asserts `scrollWidth <= innerWidth` at each width, and asserts exactly one visible `.marquee__list`.

### D2 — 1px horizontal overflow at exactly 1024px from the hero wordmark

**Observed.** At 1024 wide only, `p.hero__wm` / `span.wm-dot` extends 1px past the viewport.

**Root cause.** The two-column hero turns on at `min-width:1024px` (`site.css:238-300`). `.hero__copy { width:min(40rem,100%) }` plus column gap plus the wordmark's letter-spacing lands exactly on the viewport edge at the breakpoint; the second `.hero__wm` block at `~303` also sets a `letter-spacing` that is not accounted for in the width.

**Change.**
1. Merge the two `.hero__wm` declarations into one (see T2 in section 6).
2. Apply `overflow-wrap:anywhere; max-width:100%; letter-spacing` trimmed so the last glyph's trailing spacing does not count (`margin-inline-end: calc(-1 * <letter-spacing>)` on `.wm-dot`, or set the letter-spacing on the glyphs and `0` on the final span).
3. Add `.hero { overflow-x: clip }` as a belt-and-braces guard. `clip` (not `hidden`) so sticky children are unaffected.

**Acceptance.** Homepage overflow-free at 1024 with motion on and off; the wordmark is fully visible, not clipped.

**Test.** The existing `'required responsive widths do not create horizontal page overflow'` (`marketing-site.test.mjs:209`) already iterates widths; add 1024 to its width list if absent and add an assertion that `p.hero__wm`'s `getBoundingClientRect().right <= innerWidth`.

### D3 — `films.html` overflows by 20px at 320px

**Observed.** At 320 wide the archive grid overflows by 20px.

**Root cause.** `films.html:216`: `.grid { grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); gap:1.6rem }`. `20rem` = 320px, so the minimum column is the full viewport and body padding pushes it over.

**Change.** `grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr))`. Same pattern should be audited across `site.css` and `blog.css` for any other `minmax(<fixed>, 1fr)` without a `min(...)` guard (`.site-nav__mega` at `site.css:140-152` uses `13.5rem` and is safe at 320 but gets the same treatment for consistency).

**Acceptance.** `films.html` overflow-free at all required widths.

**Test.** Extend `tests/films-archive.test.mjs` with a width loop asserting no overflow at the required widths.

### D4 — Mobile menu panel's right border is clipped at 390px; the panel floats rather than reading as a sheet

**Observed.** At 390 the open `<details class="site-nav__menu">` panel sits flush to the right edge with its right border cut off, and it floats over the page as a card.

**Root cause.** `site.css:197-236`: `width:min(20rem, calc(100vw - 1.5rem)); right:0; border:1px solid var(--line)`. The `right:0` is relative to the nav's padding box and the border is outside the computed width.

**Change.** Replace the floating card with a full-height sheet (specified fully in section 7.3). Interim minimal fix if the sheet is deferred: `right:0.75rem; width:min(20rem, calc(100vw - 1.5rem)); box-sizing:border-box`.

**Acceptance.** At 320, 390, 768 the open menu's `getBoundingClientRect()` is fully inside the viewport, including borders; the panel height covers the viewport below the header.

**Test.** Extend `'site nav uses a compact menu below 1100px and a full bar from 1280px'` (`marketing-site.test.mjs:333`) to open the menu and assert the panel rect is within `[0, innerWidth]` and bottom `>= innerHeight - 1`.

### D5 — Services horizontal scroller on mobile cuts cards with no scroll affordance

**Observed.** In `#services`, `.fn-scroller` (`site.css:410`) shows a card partially cut at the right edge with no scrollbar, no fade, and no swipe hint at 320–768.

**Root cause.** `overflow-x:auto` with the default hidden scrollbar on touch devices, and the cards (`.fn-card`) are not sized to peek.

**Change.** Specified in section 7.5. Summary: `scroll-snap-type:x mandatory` on the scroller, `scroll-snap-align:start` on cards, card width `min(78vw, 22rem)` so the next card peeks ~15%, a right-edge gradient mask that disappears when scrolled to the end, and a dot indicator synced via `IntersectionObserver` (no new dependency; a ~40-line module in `assets/` loaded with `defer`).

**Acceptance.** At 320 and 390 the first card is fully visible, at least 40px of the next card is visible, a fade is present on the right edge until the last card is in view, and dots update on scroll.

**Test.** New test `'services scroller peeks the next card and shows an end fade on phones'` — asserts card 1 rect inside viewport, card 2 `left < innerWidth`, fade element visible, then `scrollIntoView` on the last card and assert the fade is hidden.

### D6 — Pinned services tab-strip panel heading scrolls under the sticky nav on mobile (motion on)

**Observed.** With motion on, when the pinned panel in `#services` engages, its heading is hidden behind `.site-nav`.

**Root cause.** No `scroll-padding-top` on `html`; the pin's `top` offset does not include the nav height.

**Change.**
1. Expose the header height as `--nav-h` (set in `site.css` to `3.5rem` and confirmed/overridden at runtime by a one-liner in the existing nav script using `ResizeObserver`).
2. `html { scroll-padding-top: var(--nav-h) }`.
3. All sticky/pinned stages start at `top: var(--nav-h)` instead of `top:0` (the `#name` stage already uses `clamp(4.5rem,18vh,10rem)` and is fine; the services pin and any `restored-motion.css` sticky with `top:0` change).
4. Sections with ids used as anchors get `scroll-margin-top: var(--nav-h)`.

**Acceptance.** When the services pin engages on a 390×844 viewport, the panel heading's `getBoundingClientRect().top >= nav.bottom`. In-page anchor links (`#services`, `#start`, etc.) land with the heading fully visible.

**Test.** New test `'pinned stages and in-page anchors clear the sticky header'` — navigates to `/#services`, asserts the `#services h2` top is `>=` the nav's bottom; scrolls through the services pin and asserts the active panel heading top `>=` nav bottom.

### D7 — Course hero background screenshot text bleeds through the breadcrumb and h1

**Observed.** On `/course/llm-leverage/` the hero's background image is a screenshot whose UI text ("Home Modules Resources Glossary Workshops") is legible through the breadcrumb and title at all widths.

**Root cause.** `.page-hero--photo` (`blog.css:783`) applies the image with insufficient scrim; `.page-hero__media::after` (`blog.css:1041`) exists but its gradient is too light for a text-heavy image.

**Change.**
1. Strengthen the scrim on `.page-hero__media::after` to `linear-gradient(180deg, rgba(7,7,6,0.78) 0%, rgba(7,7,6,0.62) 45%, rgba(7,7,6,0.92) 100%)` plus `backdrop-filter: blur(6px)` behind the copy column only (`.page-hero__copy::before`), so the image stays recognisable at the edges but text never sits on text.
2. Replace the screenshot with a cropped, blurred variant (`course-hero-bg.webp`, blurred at export) so the scrim does less work. The replacement is a build asset, not a runtime filter.
3. Breadcrumb and h1 get `text-shadow: 0 1px 2px rgba(0,0,0,0.4)` as a final guard.

**Acceptance.** Sampled luminance contrast between hero text and the pixels directly behind it is ≥ 7:1 at 390 and 1280 (measured with a small Playwright helper that samples the canvas behind the `h1` bounding box). No legible UI text from the image intersects the `h1` or breadcrumb rects (visual check in the PR with before/after captures).

**Test.** `'course hero copy sits on a scrim, not on screenshot text'` — asserts the `::after` computed `background-image` contains the darker stop and that the `h1` colour against the sampled background clears 7:1.

### D8 — `404.html` has no site chrome

**Observed.** The 404 page is a standalone document with inline styles, a different background (`#0B0A08`), different text colours (`#f4f2ef`, `#9a9ba1`), a different accent (`#E23B2F`), and no header or footer. It reads as a different product.

**Root cause.** `404.html` predates `scripts/site-chrome.mjs` and is hand-authored.

**Change.**
1. Generate `404.html` from `scripts/site-pages.mjs` using `siteHeader()` and `siteFooter()`, the site stylesheets, and the standard `<head>` block (fonts, cache-busted CSS, theme-color `#070706`).
2. Keep `<meta name="robots" content="noindex">`.
3. Body: eyebrow label "404", h1 "That page vanished.", one-sentence lede, a primary `.btn--primary` "Back to home" and a secondary `.btn--secondary` "See the work", plus a short list of the four top-level routes.
4. Confirm `_redirects` / Workers config still serves the generated file as the 404 response (see `tests/cloudflare-deploy.test.mjs`).

**Acceptance.** `404.html` contains `.site-nav` and `.site-footer`, uses `var(--canvas)` etc., contains no inline `<style>` block beyond what every generated page has, keeps `noindex`, and is overflow-free at all required widths.

**Test.** Extend `tests/site-pages.test.mjs` with `'404 page is generated with site chrome and stays noindex'`; extend the inner-pages width loop (`marketing-site.test.mjs:281`) to include `/404.html`.

### D9 — Interactive elements under the tap-target floor

**Observed (per page, count of targets under 36px).** Homepage 13 (nav mark 116×32; mega-menu links 27px tall; inline card links 22px). Blog posts 19–42 (breadcrumb 19px; footnote references 8×18). About 8–9. Pirx 8.

**Root cause.** Link padding is set by typography only; `.site-nav__links a { min-height:44px }` (`site.css:182-189`) exists but the mega-menu links (`site.css:161-165`, `padding:0.35rem 0`) and card/text links have no minimum.

**Change.**
1. Global rule: `a, button, summary, [role="button"] { min-height: 24px; min-width: 24px }` is too blunt for inline prose links, so instead:
   - `.site-nav__mark { min-height:44px; display:inline-flex; align-items:center }`.
   - `.site-nav__mega a { min-height:40px; padding:0.5rem 0.25rem; display:flex; align-items:center }`.
   - `.breadcrumb a, .card-meta a, .card-dek a { padding-block:0.35rem; margin-block:-0.35rem }` so the layout does not shift but the hit area grows to ≥ 28px.
   - Footnote references (`sup a`): `display:inline-block; min-width:1.5rem; min-height:1.5rem; text-align:center; padding:0 0.2rem` (24×24 floor).
   - Inline card links in `#proof` / `#models-band` become `.btn--tertiary` (section 6.3), which carries a 40px min-height.
2. Hit-area growth uses padding with negative margin where a visual size change would disturb the type, so the measured rect grows without the visible footprint changing.

**Acceptance.** Across the 12 audited pages at 390 wide, zero interactive elements have a bounding rect under 24×24, and all `.site-nav` links and `.btn` elements are ≥ 40px tall.

**Test.** New shared helper `tests/helpers/tap-targets.mjs` returning elements under a threshold; new test `'no interactive element is below the 24px tap-target floor on phones'` iterating the audited page list at 390.

---

## 5. Premium recommendations — specification

Each recommendation has the same structure as the defects. Recommendation IDs are referenced from the phase plan.

### R1 — Use the width above 1280px

**Problem.** At 1280–1920 the page column stays at `--page: 72rem` (1152px) and the hero copy caps at `40rem`, leaving the right half of the hero and most bands visually empty.

**Spec.**
- `--page: 72rem` becomes `--page: clamp(72rem, 86vw, 84rem)`. At 1440 this yields ~1238px; at 1920 the 84rem cap (1344px) holds the measure.
- Hero: keep `.hero__copy { width:min(40rem,100%) }` but make the grid `grid-template-columns: minmax(0, 40rem) minmax(0, 1fr)` with `align-items:center`, and give `.hero__stage` (`site.css`, `height:clamp(220px,42vh,520px)`) a `min-height` tied to the copy column so the visual fills the right column at ≥1280.
- Bands (`#models-band`, `#proof`, `#start`): at `min-width:1280px` switch to a two-column layout (copy left at `minmax(0, 36rem)`, supporting visual or stat cluster right). Where no visual exists, right column holds the CTA group aligned to the top so the band never reads as a left-hugging paragraph.
- Body copy measure stays ≤ 68ch (`max-width: 68ch` on `.section p`, `.lede`).

**Acceptance.** At 1440 and 1920, `.hero`'s content box spans ≥ 80% of the viewport width and the right column contains a rendered element ≥ 30% of viewport width. `.hero__copy` width ≤ 40rem. No paragraph exceeds 68ch.

**Test.** `'desktop layouts use the width above 1280'` — asserts `.page`/`.hero` inner width ratios and `.hero__stage` rect width at 1440 and 1920.

### R2 — One button system

**Problem.** CTAs are a mix of `.btn` (6px radius), `.site-nav__cta` (square), `.sales-secondary` (two definitions), and bare underlined text links acting as the primary action in `#models-band`, `#proof`, `#start`, the course page, and the 404 page.

**Spec (section 6.3 has the CSS).** Three tiers:

| Tier | Class | Use | Visual |
|---|---|---|---|
| Primary | `.btn.btn--primary` | One per section/band, the main action | `--accent` fill, `#170804` ink, radius `--ui-r-control` (6px), 44px min-height, 150ms hover lift (`translateY(-1px)` + brightness 1.05) |
| Secondary | `.btn.btn--secondary` | Alternative action next to a primary | 1px `--line-strong` border, transparent fill, `--ink`, same size; hover fills `--surface-raised` |
| Tertiary | `.btn.btn--tertiary` | Low-emphasis link-styled action, replaces bare links | No border, `--ink`, underline that animates in on hover (`background-size` trick), 40px min-height, arrow glyph `→` with 4px hover shift |

Rules:
- `.site-nav__cta` adopts `.btn .btn--primary` sizing and radius (it is a primary CTA).
- `.sales-secondary` becomes an alias of `.btn--secondary` in `blog.css` and the duplicate definition is removed.
- A section may have at most one `.btn--primary`. `#models-band`, `#proof`, `#start`, course hero, 404 get a primary + tertiary pair; the existing bare links move to `.btn--tertiary`.
- `.hero__actions .btn` (`site.css:359`) and `.start .btn` (`site.css:559`) overrides are deleted in favour of the tiers.

**Acceptance.** No `a` that is a direct child of a `.section__actions` / band actions container lacks a `.btn` class. All `.btn` are ≥ 44px tall (tertiary ≥ 40px). `.site-nav__cta` computed `border-radius` equals `.btn--primary`'s.

**Test.** `'every call to action uses the button system'` — queries `[data-actions] > a` across pages and asserts class presence and heights; asserts radius parity for the nav CTA.

### R3 — Card anatomy

**Problem.** Cards differ in padding, media treatment and height; grids leave ragged last rows (7 services in a 3-col grid → 3/3/1; portfolio uneven; products 2 cards in a 3-col grid). Several service cards have no image, so rows are uneven.

**Spec.**
- One `.card` primitive (section 6.4): `--card-pad: 1.25rem`, radius `--ui-r-card` (8px), 1px `--line` border, `--surface` fill, media slot `aspect-ratio:16/9` (`.fn-card img` at `site.css:428` already does this) with a branded placeholder (`--surface-raised` fill, small wordmark glyph, subtle gradient) rendered by `scripts/site-pages.mjs` when a service/product has no image.
- Grid counts:
  - Services (7): render as a 2+3+2 layout at ≥1024 using `grid-template-columns: repeat(6, 1fr)` with span rules (`:nth-child(-n+2), :nth-last-child(-n+2) { grid-column: span 3 }`, middle three `span 2`). At 768 use 2 columns; the seventh spans both.
  - Products (2): `grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr))` capped at `max-width: 48rem` so two cards centre instead of sitting in a 3-col grid.
  - Portfolio: cards sorted so the last row is full, or the trailing card spans the remaining columns (`:last-child:nth-child(3n-1) { grid-column: span 2 }`).
- Card title, meta and body use the same type ramp on every surface (services, portfolio, products, blog cards).

**Acceptance.** No grid on services, portfolio or products has a last row with fewer items than columns unless the trailing item spans the remainder. Every card media slot has a 16/9 rendered box (image or placeholder). Card padding computed value identical across the three surfaces.

**Test.** `'card grids have no ragged last rows and every card has a media slot'` — computes columns from `getComputedStyle(grid).gridTemplateColumns` and item positions, asserts the last row is full or spans; asserts each `.card__media` has non-zero height.

### R4 — Hero ghost headline and `#name` band height

**Problem.** The ghost line "I will create as I speak." in the hero/`#name` band sits at ~4–6% ink on `#070706` and is practically invisible; meanwhile `#name` pins for `190vh` (`restored-motion.css:888-892`), so users scroll a long way through a band whose main visual they cannot see.

**Spec.**
- Ghost headline colour becomes `rgba(245,240,232,0.14)` (≈14% ink) at rest, animating to `0.22` as the stage reveals (motion on). With motion off it renders at `0.18` statically.
- `#name` pin height drops from `190vh` to `140vh` (and `170vh` → `130vh` on the smaller breakpoint). The reveal keyframes in `restored-motion.css` are rescaled so the same sequence completes in the shorter distance.
- `#name .origin .sc-body { max-width:34rem }` (`restored-motion.css:872+`) stays.

**Acceptance.** Computed colour alpha of the ghost line ≥ 0.14 at rest. `#name.name-pin` height ≤ 140vh. The scroll reveal still completes before the stage unpins (assert the final keyframe class is present at the end of the pin).

**Test.** Extend the existing `#name` assertions in `tests/site-pages.test.mjs` / `marketing-site.test.mjs` with alpha and height checks.

### R5 — Fix D1 and D7 first

Not a separate spec; this is an ordering rule. D1 (reduced-motion overflow) and D7 (course hero bleed) are the two defects visible to any visitor on their first screen and are Phase 1 items.

### R6 — Navigation: threshold, mega menu, mobile sheet

**Problem.** The nav collapses at 1099px, so tablets in landscape and small laptops get a hamburger. The mega menu has 7 groups in a `repeat(auto-fit, minmax(13.5rem, 1fr))` grid that produces a 5+2 layout with an empty row, no hover state, and a "Design" group that lists portfolio items.

**Spec (section 7).**
- Collapse threshold moves to `max-width: 899px`. To fit the full bar at 900–1099 the bar is shortened: nav labels use `--label` at 0.9rem, letter-spacing trimmed, and one top-level link is folded into the Services menu (decided in 7.1).
- Mega menu: 4 columns at ≥1280, 3 at 900–1279. Groups are reorganised to 4 (7.2). Each link has a 1-line description in `--ink-soft` and a 16px icon slot. Hover: underline slides in over 150ms; the whole row gets `--surface-raised` on hover.
- Mobile: full-height sheet (7.3) with 56px rows, section headers, and the CTA pinned at the bottom.

**Acceptance.** At 1024 the full bar renders (no `<details>` summary visible). The mega menu grid reports 4 columns at 1280 and 3 at 1024, and every group has ≥ 3 links (no empty row). On phones, the open menu covers the viewport below the header and each link row is ≥ 56px tall.

**Test.** Update `'site nav uses a compact menu below 1100px and a full bar from 1280px'` → `'site nav uses a compact sheet below 900px and a full bar from 1024px'`; extend the Services-menu-on-phone test (`marketing-site.test.mjs:414`) to assert row heights and sheet coverage.

### R7 — Border, radius and elevation tokens

Specified in section 6.1 and 6.2; summary: one border token pair (`--line`, `--line-strong`), one radius pair (`--ui-r-card` 8px, `--ui-r-control` 6px), one shadow (`--shadow-raised`), one raised surface (`--surface-raised`). Delete every duplicate listed in 3.5.

**Acceptance.** `rg '--ui-border-color' scrollcraft/builds/abracadabra-ai` returns zero matches. Each selector in 3.5 is declared exactly once. `.tablist button` (`site.css:459-470`) uses `var(--label)`.

**Test.** `tests/site-tokens.test.mjs` (new, pure Node, no browser): reads the CSS files and asserts the token/duplicate rules with regex counts.

### R8 — Section rhythm

**Problem.** Every section uses the same ~4.5rem vertical padding, so the page has no hierarchy of pauses; the cyan "Every AI model. One bill." band is cramped against its neighbours.

**Spec.**
- Spacing scale tokens: `--space-section-s: 4rem; --space-section-m: 6rem; --space-section-l: 9rem` (phones: 3 / 4.5 / 6rem).
- Default `.section { padding-block: var(--space-section-m) }`. Hero and `#start` use `l`. Compact utility bands (marquee, models band) use `s`. Add `.section--tight` / `.section--loose` modifiers rather than per-section overrides.
- `#models-band` gets `margin-block: var(--space-section-s)` so the cyan band breathes.

**Acceptance.** Computed `padding-top` for sections falls in the set {s, m, l} only. The models band has ≥ 4rem clear space above and below at 1280.

**Test.** `'sections use the spacing scale'` — iterates `.section` and asserts padding values are one of the three tokens' computed pixel values at 390 and 1280.

### R9 — Inner-page header blocks and footer wordmark

**Problem.** About is a ~560px plain text column; Services categories with 1–3 cards sit left in a 3-col grid; Products shows 2 cards and then a giant footer wordmark that dominates the page.

**Spec.**
- Every generated inner page gets a header block: eyebrow label (`--label`), h1, 1–2 sentence lede (≤ 68ch), optional media (16/9 or a device-framed screenshot) on the right at ≥1024. `scripts/site-pages.mjs` gains a `pageHeader({label, title, lede, media})` helper used by services, portfolio, products, course, and the blog index.
- Services category pages with < 3 cards use the Products grid rule (centred, `max-width` capped).
- `siteFooter()` accepts `{ wordmark: 'full' | 'compact' }`. Pages whose main content is shorter than `120vh` at 1280 (measured at build time is not possible; instead the generator passes `compact` for products, 404 and any category page with < 3 items) render the compact footer: wordmark at 40% size, no extra band padding.

**Acceptance.** Every inner page has `.page-header` with `h1` and `.page-header__lede`. Products and 404 render `.site-footer--compact`. About's content column is ≥ 40rem at 1280 and the header media is present.

**Test.** Extend `tests/site-pages.test.mjs` (`'generated pages ...'` at line 116) to assert the header block markup and the footer variant per page.

### R10 — Mobile services scroller

Spec and tests are in D5 and section 7.5. The alternative (stack vertically on phones) is rejected because seven stacked cards push `#models-band` ~3000px down on a 390 viewport; the snap scroller with peek keeps the section's height close to today's.

### R11 — Hover and focus micro-interactions

**Spec.**
- Global transition token `--t-fast: 150ms cubic-bezier(.2,.7,.2,1)`; `--t-med: 220ms`.
- `.btn`, `.card`, nav links, `.tablist button` get `transition: transform var(--t-fast), background-color var(--t-fast), border-color var(--t-fast), color var(--t-fast)`.
- Cards: `translateY(-2px)` + `--line-strong` border + `--shadow-raised` on hover.
- Focus: replace the narrow rule at `site.css:123-126` (`.btn:focus-visible, .tablist button:focus-visible`) with `:where(a, button, summary, [tabindex]):focus-visible { outline:2px solid var(--accent); outline-offset:3px; border-radius: inherit }`.
- Reduced motion: transitions on `transform` set to `0ms`; colour transitions remain.

**Acceptance.** Every focusable element shows the accent outline on keyboard focus (Tab through the homepage and assert computed `outline-color` on each focused element). Hover on a card changes `transform` within 220ms.

**Test.** `'keyboard focus is visible on every focusable element'` — tabs through the first 40 focusables on the homepage asserting `outline-style !== 'none'`.

### R12 — Blog post ergonomics on phones

**Problem.** Posts run 13.8–16.6k px tall at 390. Footnote references are 8×18. Link density is high.

**Spec.**
- Sticky reading-progress bar (2px, `--accent`) under the header on `article` pages, driven by scroll in a ~20-line module.
- Table of contents: on ≥1280 a sticky right-rail TOC built at build time from `h2`s by `scripts/blog.mjs`; on phones a `<details>` "On this page" block after the lede.
- Footnote references get the 24×24 floor (D9); footnote back-links too.
- `scripts/build-blog.mjs` emits a warning when a post has > 1 link per 60 words, so authors can trim density; the build does not fail.

**Acceptance.** Articles have `.reading-progress` and `.toc`. At 1280 the TOC is `position: sticky`. At 390 the TOC is a closed `<details>`. All footnote targets ≥ 24×24.

**Test.** Extend `tests/blog-content.test.mjs` for TOC generation (pure Node) and add a browser check for the progress bar and footnote sizes on one post.

### R13 — Showcase screenshot on phones

**Problem.** The product showcase screenshot at 390 is a tiny full-width 16/9 image; UI inside it is unreadable.

**Spec.**
- At `max-width: 767px` the showcase media switches to a portrait, device-framed crop (`aspect-ratio: 9/16`, `max-height: 70vh`) using a `<picture>` with a mobile source generated by the existing thumbnail pipeline (`tests/video-thumbnails.test.mjs` already covers thumbnail generation; extend the generator to emit a `-mobile.webp` crop).
- The frame is CSS only (rounded rect, 1px `--line-strong`, inner shadow); no device artwork is downloaded.

**Acceptance.** At 390 the showcase image rect height ≥ 420px and width ≤ 90vw; at 1280 the 16/9 version renders.

**Test.** `'showcase uses a taller framed crop on phones'`.

### R14 — Performance: fonts and hero priority

**Problem.** Fonts load from Google Fonts (extra origin, FOUT risk); `films.html` loads a third family (Outfit). Hero LCP image has no `fetchpriority`.

**Spec.**
- Self-host IBM Plex Sans (400/500/600) and Inter Tight (500/600/700) as WOFF2 in `assets/fonts/` with `@font-face { font-display: swap; unicode-range: latin }`. Add `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the two weights used above the fold. Remove the Google Fonts `<link>`s from `index.html:31-33`, `scripts/site-pages.mjs:266-268`, and `films.html:185-187`.
- `films.html` switches from Outfit to Inter Tight for display type so the archive matches the site.
- Hero LCP `<img>` (or poster) gets `fetchpriority="high"` and `decoding="async"`; below-fold images keep `loading="lazy"`.
- Videos keep `preload="none"` + `poster` (already correct; no change).
- Licence files for both fonts (OFL) are committed alongside the WOFF2.

**Acceptance.** No request to `fonts.googleapis.com` / `fonts.gstatic.com` in a Playwright request log. `document.fonts.check('600 1rem "Inter Tight"')` is true after load on `films.html`. The hero LCP element has `fetchpriority="high"`.

**Test.** `'fonts are self-hosted and the hero image is prioritised'` — collects requests, asserts no Google Fonts origin, asserts the attribute.

### R15 — README breakpoint note

Fix `README.md:142` to describe the real behaviour after R6 lands: compact sheet below 900px, full bar from 900px, mega menu 3 columns to 1279px and 4 from 1280px. Done in the same PR as R6.

## 5A. Second premium pass (R16–R27)

A second review of the live site and of this plan, done the same day, looked at what R1–R15 leave untouched. R1–R15 fix layout, consistency and performance. The items below cover the details that make a studio site feel expensive: browser chrome, identity, transitions, proof, the contact moment, and finishing touches. Each one is independent of the first pass unless a dependency is stated.

### R16 — Brand the browser chrome

**Problem.** The blog sets `color-scheme: dark`, `scrollbar-color` and a branded `::selection` (`blog/blog.css:1079-1092`). The homepage, generated pages and `films.html` do not. Selecting text on the homepage shows the OS blue highlight, and form controls and scrollbars default to light-scheme styling on some platforms. `theme-color` is `#070706` in `index.html:11` but `#0B0A08` in `films.html:9` and `404.html:8`, so the mobile browser bar changes shade between pages.

**Spec.**
- Move the blog's rules into `assets/site.css` under `:root` / `html` so every page gets them: `color-scheme: dark`, `scrollbar-color: color-mix(in srgb, var(--ink) 24%, transparent) transparent`, `scrollbar-gutter: stable`, `accent-color: var(--accent)`, `caret-color: var(--accent)`.
- `::selection { background: var(--accent); color: var(--ink-on-accent); }`, defined once in `site.css`. Remove the duplicate from `blog/blog.css`.
- `<meta name="theme-color" content="#070706">` on every page. `films.html`, `404.html` and the emitter in `scripts/site-pages.mjs` change to match.

**Acceptance.** On every audited page, `getComputedStyle(document.documentElement).colorScheme === 'dark'`, the `::selection` background resolves to `rgb(255, 75, 36)`, and the `theme-color` content is `#070706`.

**Test.** `'every page shares brand browser chrome'` — loads each page and checks `colorScheme`, the `theme-color` meta, and (via `CSSStyleSheet` rules) that `::selection` is defined once.

### R17 — Brand icon set and web manifest

**Problem.** The favicon is a data-URI serif "A" filled `#E23B2F`. That font is not used anywhere on the site, and that red is not `--accent`. `films.html` ships a different SVG. There is no `apple-touch-icon` and no `manifest.webmanifest`, so a home-screen bookmark on iOS shows a screenshot thumbnail and Android shows a generic letter.

**Spec.**
- `assets/icons/favicon.svg`: the wordmark's mark (or a geometric "A" in Inter Tight 700) on `#070706` with a `#FF4B24` accent. Include a `prefers-color-scheme` `<style>` block inside the SVG so it stays legible on light browser tabs.
- `assets/icons/favicon-32.png`, `apple-touch-icon.png` (180×180, no transparency), `icon-192.png`, `icon-512.png`, and `icon-maskable-512.png` (safe zone 80%).
- `manifest.webmanifest` with `name`, `short_name: "Abracadabra"`, `background_color: "#070706"`, `theme_color: "#070706"`, `display: "browser"`, and the icons. No service worker; this is identity only.
- One shared `<head>` snippet: `<link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml">`, the PNG fallback, `apple-touch-icon`, and `manifest`. Emit it from `scripts/site-chrome.mjs` and paste it identically into `index.html`, `films.html` and `404.html`.

**Acceptance.** Every page links the same four icon/manifest URLs, and each returns 200 from the build output. The manifest parses and lists 192 and 512 icons. No data-URI favicon remains.

**Test.** `'every page links the shared icon set and manifest'` — parses each page's `<head>`, compares the link set, and checks that the files exist on disk.

### R18 — Cross-document view transitions

**Problem.** Moving between the homepage, a services page and a blog post is a hard white-free cut. That is acceptable, but it reads as "a set of pages", not "one product". Chrome and Safari 18.2+ support cross-document view transitions with no JavaScript.

**Spec.**
- In `assets/site.css` and `blog/blog.css`: `@view-transition { navigation: auto; }` inside `@media (prefers-reduced-motion: no-preference)`.
- `view-transition-name: site-header` on the header and `site-wordmark` on the wordmark, so they stay still while the content cross-fades.
- Default root animation: 180ms opacity cross-fade with an 8px upward settle on the new page, using the existing `--ease-out` token. No slide or zoom.
- Card-to-detail morph (portfolio card image → portfolio page hero) is optional. Only add it if the names are unique per page; duplicate names abort the transition.
- Browsers without support get today's behaviour; nothing is polyfilled.

**Acceptance.** In Chrome, navigating home → `/services/…` triggers a `pagereveal` event with a non-null `viewTransition`. With `prefers-reduced-motion: reduce`, `viewTransition` is null. No console errors about duplicate `view-transition-name`.

**Test.** `'same-origin navigation uses a view transition and respects reduced motion'` — listens for `pagereveal` across one navigation in each motion mode.

### R19 — Structured project intake

**Problem.** Every primary CTA ends at `mailto:houdini@abra-ca-dabra.app` (`index.html:801`). On a phone without a configured mail app the button does nothing visible. On desktop it opens a blank email, which asks the prospect to write a brief from scratch. A premium studio leads the client through the first step.

**Spec.**
- A `#start` section (and a `/start/` page emitted by `scripts/site-pages.mjs`) with a short form: name, email, company (optional), what you need (chips: Film, Website, Product, Course, Not sure), budget band (chips), timeline (chips), and a free-text "tell us more".
- Submit sends a `POST` to a `/api/intake` route on the existing `abracadabra-marketing` Worker. The Worker validates the payload, rejects honeypot submissions, rate-limits by IP, and forwards to the studio inbox using the email provider already in use by the project. Secrets live in Worker secrets and are listed in `.env.example`.
- Without JavaScript, the form posts normally and the Worker redirects to `/start/thanks/`. With JavaScript, the form swaps to an inline confirmation: "Got it. We reply within one working day." followed by a summary of what they sent.
- A visible secondary link keeps the email address for people who prefer it.
- Field labels are visible (no placeholder-only labels). Errors are inline and announced with `aria-live="polite"`.

**Acceptance.** Valid submissions return 200 and render the confirmation. Missing email returns 400 with a field error. A filled honeypot returns 200 but sends nothing. The form works with JavaScript disabled.

**Test.** `'intake form validates, submits and confirms'` — browser test against a mocked `/api/intake`. Worker unit tests cover the valid, invalid, honeypot and rate-limited cases with the email provider mocked.

### R20 — Proof the studio can stand behind

**Problem.** The only third-party names on the homepage are the tool and model marquee (`index.html:617-624`). Logos of the tools used can read like a client list, which a careful visitor sees through. There are no testimonials, outcomes or numbers anywhere.

**Approved clients.** The owner approved four clients for the band: **StrongFoam**, **Milrcorr**, **SuperPatch** and **PiRX**. All four already have portfolio pages, and their outcome lines come from facts already published in `scripts/site-data.mjs`:

| Client | Card links to | Outcome line (from existing site copy) |
|---|---|---|
| StrongFoam | `/portfolio/strongfoam-website/` (also mentions `/portfolio/strongfoam-crm/`) | Website with offer, estimate and booking, plus one CRM for customers, jobs and numbers |
| Milrcorr | `/portfolio/milrcorr/` | Public site for commercial fit-out work where a visitor sees the work and requests an estimate |
| SuperPatch | `/portfolio/superpatch-products/` | Product pages that carry the offer, the comparison and the buyer questions |
| PiRX | `/portfolio/pirx/` | 375K search impressions and 43.5K AI-feature impressions in 90 days, from near zero |

**Spec.**
- Relabel the marquee as "Built with" so it is clearly about tools.
- Add a proof band after the showcase with four client cards in the order above. Each card shows the company name, a one-line outcome and a link to the portfolio page. The grid is 4 columns at ≥ 1100 px, 2 × 2 from 640 px, and 1 column below that. Four cards replaces the earlier cap of three because the owner approved four clients.
- Below the cards, a metric row in `tabular-nums` (R23) shows PiRX's two figures: "375K search impressions" and "43.5K AI-feature impressions", with the caption "pirx.ca, first 90 days". These are the only hard numbers available. No other metric is shown until the owner supplies one.
- Quotes and named people are optional fields per entry (`quote`, `person`, `role`). They render only when present. None ship now, because no quotes or attributions were supplied. Do not write placeholder or paraphrased quotes.
- Content comes from one data file (`content/proof.json`). Its entries reference the portfolio slugs in `scripts/site-data.mjs` (`strongfoam-website`, `milrcorr`, `superpatch-products`, `pirx`). Company name, link and PiRX metrics are read from that source, so the facts are stated in one place. The band still renders nothing if the file is empty.
- Logos appear only if the owner provides them with permission. Until then, the company name is set in the display face.

**Acceptance.** With an empty `proof.json`, the band is absent from the DOM. With the four approved entries, the band shows StrongFoam, Milrcorr, SuperPatch and PiRX, in that order. Each card links to an existing portfolio page that returns 200. The PiRX figures match `site-data.mjs` exactly. No card shows a quote or person unless that field is set. The marquee heading reads "Built with".

**Test.** `'proof band renders only real entries and the marquee is labelled as tools'`.

### R21 — Responsive image formats for services cards

**Problem.** The services cards load `.jpg` originals (`index.html:639-651`) even though 640/960/1280 AVIF and WebP variants already exist in `blog/media/services/*/`. Phones download desktop-sized JPEGs.

**Spec.**
- Wrap each card image in `<picture>` with AVIF then WebP `<source>`s, `srcset` at 640w/960w/1280w, and `sizes` matching the scroller card width from D5/R10 (for example `(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 85vw`). The JPEG stays as the `<img>` fallback, with explicit `width`/`height`.
- Apply the same pattern anywhere else a pre-generated variant set exists. List those places in the PR.

**Acceptance.** At 390px in Chrome, every services card requests an `.avif` no larger than the 960w variant. No layout shift from the cards (CLS contribution 0).

**Test.** `'services cards serve modern formats sized to the viewport'` — records image requests at 390 and 1280.

### R22 — Film grain and a consistent grade

**Problem.** The canvas is flat `#070706`. Large dark areas with soft gradients show banding on 8-bit panels, and photography, renders and video posters come from different sources with different white points.

**Spec.**
- A fixed, `pointer-events: none` grain layer on `body::after`: a 128×128 tiled noise PNG (≤ 6 KB) or an inline SVG `feTurbulence`, at 3–4% opacity, with `mix-blend-mode: overlay`. It is static by default. A slow 8-step `steps()` shift is allowed only under `prefers-reduced-motion: no-preference`.
- Hidden in `@media print` and `forced-colors: active`.
- Imagery grading rule, documented in the README design section: neutral-to-warm white point, crushed blacks at the canvas value, no pure white highlights above `--ink`. Apply it to new assets. Re-grade existing assets only where they visibly clash; list them in the PR.

**Acceptance.** The grain layer exists on every page, is non-interactive (`elementFromPoint` never returns it), and is absent with forced colours. Lighthouse performance score does not drop more than 1 point.

**Test.** `'grain overlay is decorative and non-interactive'`.

### R23 — Typographic finishing

**Problem.** Numbers in prices, steps and dates use proportional figures, so columns of digits wobble. Straight quotes appear in copy. Eyebrows use letter-spaced uppercase without the font features that make it look set rather than typed.

**Spec.**
- `.num, time, [data-num], .price` get `font-variant-numeric: tabular-nums lining-nums`.
- Body copy gets `hanging-punctuation: first last` (Safari only; harmless elsewhere) and `text-wrap: pretty`. Headings already use `balance`; verify.
- Eyebrows: `font-feature-settings: "case" 1` on Inter Tight so punctuation aligns to caps. Tracking is a single token, `--track-eyebrow: 0.12em`.
- A build-time check in `scripts/site-pages.mjs` and `scripts/build-blog.mjs` converts straight quotes and apostrophes in text nodes to curly ones (not in code, attributes or JSON-LD).
- Use a real ellipsis (`…`) and en/em dashes where copy uses `...` or `--`.

**Acceptance.** No straight `'` or `"` remains in rendered text nodes outside `<code>`/`<pre>`. Elements marked as numbers compute `tabular-nums`.

**Test.** `'rendered copy uses typographic quotes and numbers are tabular'`.

### R24 — Scroll-driven reveals without JavaScript

**Problem.** Section reveals and the blog progress bar (R12) rely on script. CSS scroll-driven animations (`animation-timeline: view()` / `scroll()`) run off the main thread in Chrome and Safari 26, and are smoother.

**Spec.**
- A `.reveal` utility: `animation: reveal linear both; animation-timeline: view(); animation-range: entry 0% entry 40%;` with an 8–12px translate and opacity from 0 to 1. Wrap it in `@supports (animation-timeline: view())` and `@media (prefers-reduced-motion: no-preference)`. Outside those, content is simply visible.
- The R12 reading-progress bar uses `animation-timeline: scroll(root)` where supported, and the small script remains only as the fallback.
- Do not apply `.reveal` to the hero, the `#name` pin, or anything above the fold. Keep at most one reveal per section so the page does not "pop" constantly.
- Existing script-driven motion in `restored-motion.css` is not migrated in this item.

**Acceptance.** With motion reduced, every `.reveal` element has computed `opacity: 1` without scrolling. In Chrome with motion on, a `.reveal` element below the fold starts with opacity below 1.

**Test.** `'reveals are CSS-driven and fully visible with reduced motion'`.

### R25 — Social cards that look designed

**Problem.** The home Open Graph image is `assets/schema-home.webp` at 1600×1000. Several platforms (LinkedIn, iMessage, Slack in some cases) do not render WebP previews, and 16:10 gets cropped. Generated pages fall back to the same image, so every shared link looks identical.

**Spec.**
- `assets/og/home.jpg` at 1200×630, under 300 KB, plus `og:image:width`, `og:image:height` and `og:image:alt`. Keep the WebP for JSON-LD.
- A template-generated card per services, portfolio and product page: canvas background, grain, page title in Inter Tight, the wordmark, and the page's hero image cropped to the right third. Generate them at build time with the existing headless Chrome (render an HTML template and screenshot it). Commit the outputs so the deploy does not need Chrome.
- `twitter:card` is `summary_large_image` everywhere.

**Acceptance.** Every page has an `og:image` that resolves to a 1200×630 JPEG in the build output, with width, height and alt meta present. Generated pages have distinct images.

**Test.** `'every page has a 1200x630 jpeg social card'` — reads image dimensions from the file headers.

### R26 — The footer as a closing moment

**Problem.** The footer is a link list. It is the last thing a convinced visitor sees, and it does not ask them to do anything, say where the studio is, or show it is a real business.

**Spec.**
- A closing band above the footer links: one line of display type ("Have something to make?"), the primary CTA to `#start` (R19), and the email as a secondary link.
- Footer meta row: studio location and local time (rendered server-side as the timezone name, with an optional client-side clock updated once a minute), social links with accessible names, and a legal line (© year, company name, privacy).
- On the homepage the band replaces the existing final CTA rather than stacking a second one.
- Compact variant for blog and inner pages per R9: same meta row, smaller band.

**Acceptance.** Every page ends with exactly one primary CTA pointing to `#start` or `/start/`. Social links have accessible names. The copyright year matches the build year.

**Test.** `'footer closes with one primary call to action and studio details'`.

### R27 — One verb per page

**Problem.** CTAs use several verbs ("Start a project", "Get in touch", "Book a call", "Email us") and several targets (mailto, `#contact`, anchors). Mixed verbs make the site feel assembled from parts.

**Spec.**
- Primary action everywhere: **"Start a project"** → `#start` on the homepage, `/start/` elsewhere. It always uses the `.btn--primary` tier from R2.
- Secondary actions use the tertiary/ghost tier and specific verbs tied to the page ("See the work", "Read the case study", "Watch the film").
- At most one primary button per viewport-height section. Header CTA counts as one.
- Write the copy rules into the README design section so new pages follow them.

**Acceptance.** Across all audited pages, every `.btn--primary` has the text "Start a project" and an `href` ending in `#start` or `/start/`. No `mailto:` link uses the primary tier.

**Test.** `'primary calls to action share one verb and one destination'`.

---

## 6. Design system changes (`assets/site.css`)

### 6.1 Tokens added / consolidated

```css
:root {
  /* borders */
  --line: rgba(245,240,232,0.12);        /* was 0.14; --ui-border-color (0.08) is deleted */
  --line-strong: rgba(245,240,232,0.24);

  /* surfaces & elevation */
  --surface-raised: #17160F;
  --shadow-raised: 0 12px 32px rgba(0,0,0,0.35), 0 1px 0 rgba(245,240,232,0.06) inset;

  /* radii */
  --ui-r-card: 8px;
  --ui-r-control: 6px;

  /* layout */
  --page: clamp(72rem, 86vw, 84rem);
  --nav-h: 3.5rem;

  /* rhythm */
  --space-section-s: 4rem;
  --space-section-m: 6rem;
  --space-section-l: 9rem;

  /* motion */
  --t-fast: 150ms cubic-bezier(.2,.7,.2,1);
  --t-med: 220ms cubic-bezier(.2,.7,.2,1);
}
@media (max-width: 767px) {
  :root { --space-section-s: 3rem; --space-section-m: 4.5rem; --space-section-l: 6rem; }
}
```

`blog/blog.css` stops declaring any of these and relies on `site.css` (confirm load order: `site.css` is linked before `blog.css` on blog pages; `scripts/build-blog.mjs` controls this).

### 6.2 Deletions

- `--ui-border-color` at `site.css:609` and `blog.css:1388` → replace usages with `var(--line)`.
- Second `font-family` in `.site-nav__mark` (`site.css:94-103`).
- Second `.hero__wm` block (`site.css:~303`) → merged into the first.
- Second `.sales-secondary` (`blog.css:1159-1191`) → replaced by `.btn--secondary` alias.
- Inline `<style>` in `index.html:38` → moved to `site.css`.
- `.hero__actions .btn` (`site.css:359`) and `.start .btn` (`site.css:559`) overrides.
- Focus rule at `site.css:123-126` → replaced by the global `:focus-visible` rule.
- FAQ: keep the `site.css` definition, delete the `blog.css` copy.

### 6.3 Button system

```css
.btn { display:inline-flex; align-items:center; gap:0.5rem; min-height:44px; padding:0 1.25rem;
       font:500 0.95rem/1 var(--label); letter-spacing:0.01em; border-radius:var(--ui-r-control);
       border:1px solid transparent; text-decoration:none; cursor:pointer;
       transition: transform var(--t-fast), background-color var(--t-fast), border-color var(--t-fast), color var(--t-fast); }
.btn--primary   { background:var(--accent); color:#170804; }
.btn--primary:hover { transform:translateY(-1px); filter:brightness(1.05); }
.btn--secondary { background:transparent; color:var(--ink); border-color:var(--line-strong); }
.btn--secondary:hover { background:var(--surface-raised); }
.btn--tertiary  { min-height:40px; padding:0 0.25rem; color:var(--ink); background:
                  linear-gradient(currentColor,currentColor) no-repeat 0 100% / 0 1px;
                  transition: background-size var(--t-fast); }
.btn--tertiary:hover { background-size:100% 1px; }
.btn--tertiary .btn__arrow { transition: transform var(--t-fast); }
.btn--tertiary:hover .btn__arrow { transform:translateX(4px); }
.site-nav__cta { /* composes .btn .btn--primary; remove bespoke radius/padding */ }
@media (prefers-reduced-motion: reduce) {
  .btn, .btn--tertiary .btn__arrow { transition-duration:0ms; }
  .btn--primary:hover { transform:none; }
}
```

### 6.4 Card primitive

```css
.card { --card-pad:1.25rem; display:flex; flex-direction:column; background:var(--surface);
        border:1px solid var(--line); border-radius:var(--ui-r-card); overflow:hidden;
        transition: transform var(--t-med), border-color var(--t-fast), box-shadow var(--t-med); }
.card:hover { transform:translateY(-2px); border-color:var(--line-strong); box-shadow:var(--shadow-raised); }
.card__media { aspect-ratio:16/9; background:var(--surface-raised); position:relative; }
.card__media img { width:100%; height:100%; object-fit:cover; display:block; }
.card__media--placeholder::before { /* small wordmark glyph + radial gradient, pure CSS */ }
.card__body { padding:var(--card-pad); display:flex; flex-direction:column; gap:0.5rem; flex:1; }
.card__title { font:600 1.1rem/1.25 var(--display); }
.card__meta  { font:500 0.8rem/1 var(--label); color:var(--ink-soft); letter-spacing:0.04em; text-transform:uppercase; }
.card__dek   { color:var(--ink-soft); font-size:0.95rem; }
.card__actions { margin-top:auto; padding-top:0.5rem; }
```

`.fn-card`, portfolio cards, product cards and blog cards (`.card-meta` at `blog.css:477`, `.card-dek` at `blog.css:516/1258`) migrate to these class names. The generator emits the new markup; old selectors are deleted once no template uses them.

### 6.5 Type ramp

Unchanged sizes (`h1 clamp(2.4rem,5vw,4.4rem)`, `h2 clamp(1.8rem,3vw,2.8rem)`), with two additions: `.eyebrow { font:500 0.8rem/1 var(--label); letter-spacing:0.08em; text-transform:uppercase; color:var(--ink-soft) }` and `.lede { font-size:clamp(1.05rem,1.4vw,1.25rem); max-width:68ch; color:var(--ink-soft) }`. `.tablist button` switches from `--font` to `--label`.

---

## 7. Navigation redesign (`scripts/site-chrome.mjs`, `assets/site.css`)

### 7.1 Top bar

- Threshold: full bar at `min-width: 900px`; compact sheet below.
- Bar height fixed at `var(--nav-h)` (3.5rem; 3.25rem under 900px) so `scroll-padding-top` is reliable.
- Items at full bar: Mark, Services (mega), Work, Products, Blog, Films, CTA. "Course" moves into the Services mega menu under "Learn" so the bar fits at 900px with `--label` 0.9rem and `gap:1.5rem`.
- `.site-nav__cta` composes `.btn .btn--primary` (height 40px inside the 56px bar).

### 7.2 Mega menu

- Grid: `grid-template-columns: repeat(4, minmax(0,1fr))` at ≥1280; `repeat(3, ...)` at 900–1279. Panel width = page column, not `left:1.5rem; right:1.5rem`.
- Groups reorganised from 7 to 4: **Build** (software, automation, integrations), **Create** (brand, video, design — design links point to service pages, not portfolio items), **Grow** (marketing, content, AEO), **Learn** (course, blog, films). Each group: label (eyebrow), 3–4 links, each link `title` + one-line `description`.
- Link row: `display:grid; grid-template-columns:16px 1fr; gap:0.75rem; padding:0.5rem 0.5rem; min-height:40px; border-radius:var(--ui-r-control)`; hover `background:var(--surface-raised)`; title underline slides in via the tertiary-button trick.
- Panel: `background:var(--surface); border:1px solid var(--line); box-shadow:var(--shadow-raised); border-radius:0 0 var(--ui-r-card) var(--ui-r-card)`; opens with a 150ms fade + 4px rise (none under reduced motion).
- Escape closes; focus returns to the summary. Already a `<details>`, so keyboard works; add the Escape handler in the existing nav script.

### 7.3 Mobile sheet (< 900px)

- `<details class="site-nav__menu">` panel becomes `position:fixed; inset: var(--nav-h) 0 0 0; width:auto; border:0; border-top:1px solid var(--line); background:var(--canvas); overflow-y:auto; overscroll-behavior:contain; padding:1rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom))`.
- Rows: top-level links 56px tall, `font:500 1.15rem var(--display)`, bottom border `--line`. Services expands inline (nested `<details>`) listing the four groups with 48px rows.
- CTA pinned at the bottom of the sheet as a full-width `.btn--primary`.
- Body scroll locked while open (`html.menu-open { overflow:hidden }` toggled by the nav script).
- Toggle (`site.css:107-118`) is 44×44 with an animated two-line glyph (no animation under reduced motion).

### 7.4 Header offset

- `html { scroll-padding-top: var(--nav-h) }`; `[id] { scroll-margin-top: var(--nav-h) }` scoped to `section[id], h2[id], h3[id]`.
- Pinned stages use `top: var(--nav-h)`; `.name-stage` keeps `clamp(4.5rem,18vh,10rem)` because it already clears the header.

### 7.5 Services scroller (phones and tablets, < 1024px)

```css
.fn-scroller { position:relative; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none;
               padding-inline:1.25rem; scroll-padding-inline:1.25rem; display:flex; gap:1rem; }
.fn-scroller::-webkit-scrollbar { display:none; }
.fn-scroller .card { flex:0 0 min(78vw, 22rem); scroll-snap-align:start; }
.fn-scroller__fade { position:absolute; inset:0 0 0 auto; width:4rem; pointer-events:none;
                     background:linear-gradient(90deg, transparent, var(--canvas)); opacity:1; transition:opacity var(--t-fast); }
.fn-scroller[data-at-end="true"] .fn-scroller__fade { opacity:0; }
.fn-scroller__dots { display:flex; justify-content:center; gap:0.5rem; margin-top:0.75rem; }
.fn-scroller__dots button { width:24px; height:24px; /* 6px dot drawn via ::before, 24px hit area */ }
```

`assets/scroller.mjs` (new, `defer`): `IntersectionObserver` on cards with `threshold:0.6` sets the active dot; a scroll listener (passive) sets `data-at-end` when `scrollLeft + clientWidth >= scrollWidth - 2`. Dots are buttons that `scrollIntoView({inline:'start', behavior: motionOk ? 'smooth' : 'auto'})`.

---

## 8. Phased implementation plan

Each phase is one PR off `main`, authored and committed as `makemoney2023`, merged locally (no GitHub merge button), per `.cursor/rules/ownership.mdc`. Phases are ordered so each one leaves the site shippable.

### Phase 1 — Rendering defects (ship first)

| Item | Files | Tests added/changed |
|---|---|---|
| D1 reduced-motion marquee | `assets/site.css`, `index.html` (remove inline style) | `homepage stays inside the viewport with prefers-reduced-motion: reduce ...` |
| D2 1024 wordmark overflow | `assets/site.css` (merge `.hero__wm`, clip) | extend `required responsive widths ...` |
| D3 films 320 overflow | `films.html` | extend `films-archive.test.mjs` |
| D7 course hero scrim | `blog/blog.css`, course hero asset, `scripts/site-pages.mjs` | `course hero copy sits on a scrim ...` |
| D6 header offset | `assets/site.css` (`--nav-h`, `scroll-padding-top`), `assets/restored-motion.css` (pin `top`) | `pinned stages and in-page anchors clear the sticky header` |
| D4 interim menu fix | `assets/site.css:197-236` | extend nav test with panel rect assertion |
| Cache-bust bump | `index.html`, `scripts/site-pages.mjs` | — |

**Gate.** `CHROME_PATH=/usr/bin/google-chrome npm test` green; captures at the seven required widths for home (motion on/off), films, course attached to the PR; `git diff --check` clean.

### Phase 2 — Button system, 404, tap targets

| Item | Files | Tests |
|---|---|---|
| R2 button tiers | `assets/site.css` (6.3), `blog/blog.css` (alias, delete dup), `index.html`, `scripts/site-pages.mjs`, `scripts/site-chrome.mjs` (CTA) | `every call to action uses the button system` |
| D8 404 with chrome | `scripts/site-pages.mjs` (generate 404), delete hand-authored `404.html` from source, `_redirects`/Workers check | `404 page is generated with site chrome and stays noindex`; width loop includes 404 |
| D9 tap targets | `assets/site.css`, `blog/blog.css`, `scripts/blog.mjs` (footnote markup) | `no interactive element is below the 24px tap-target floor on phones` + `tests/helpers/tap-targets.mjs` |
| R11 focus rule | `assets/site.css` | `keyboard focus is visible on every focusable element` |

**Gate.** As Phase 1, plus before/after captures of `#models-band`, `#proof`, `#start`, course hero, 404 at 390 and 1280.

### Phase 3 — Tokens, cards, rhythm

| Item | Files | Tests |
|---|---|---|
| R7 token consolidation | `assets/site.css`, `blog/blog.css` (6.1, 6.2) | `tests/site-tokens.test.mjs` |
| R3 card primitive + grids | `assets/site.css` (6.4), `scripts/site-pages.mjs` (markup, placeholder), `scripts/blog.mjs` (blog cards) | `card grids have no ragged last rows ...` |
| R8 section rhythm | `assets/site.css` | `sections use the spacing scale` |
| R4 ghost headline + `#name` height | `assets/restored-motion.css`, `assets/site.css` | extend `#name` assertions |

**Gate.** Homepage section-order test (`tests/site-pages.test.mjs:25`) still green; generated-page JSON-LD/placeholder tests (`:116`) still green; visual diff of all cards at 390/768/1280.

### Phase 4 — Navigation and desktop width

| Item | Files | Tests |
|---|---|---|
| R6 nav threshold, mega menu, mobile sheet (7.1–7.3) | `scripts/site-chrome.mjs`, `assets/site.css`, nav script | renamed nav test; extended Services-on-phone test |
| D5 / R10 services scroller (7.5) | `assets/site.css`, `assets/scroller.mjs` (new), `index.html` | `services scroller peeks the next card ...` |
| R1 width above 1280 | `assets/site.css` (`--page`, hero grid, band columns), `index.html` (band markup) | `desktop layouts use the width above 1280` |
| R15 README fix | `README.md:142` | — |

**Gate.** Nav verified at 320, 390, 768, 834, 900, 1024, 1280, 1920 with the menu open and closed; keyboard walkthrough (Tab/Escape) recorded; `hero copy left column actions row from 1024` test (`marketing-site.test.mjs:474`) updated for the new grid.

### Phase 5 — Inner pages, blog, showcase, fonts

| Item | Files | Tests |
|---|---|---|
| R9 page headers + compact footer | `scripts/site-pages.mjs` (`pageHeader`), `scripts/site-chrome.mjs` (`siteFooter({wordmark})`), `blog/blog.css` | extend `site-pages.test.mjs` |
| R12 blog TOC, progress, footnotes | `scripts/blog.mjs`, `scripts/build-blog.mjs`, `blog/blog.css`, small progress module | extend `blog-content.test.mjs`; browser check on one post |
| R13 showcase mobile crop | thumbnail generator, `index.html` `<picture>` | `showcase uses a taller framed crop on phones` |
| R14 self-hosted fonts, films font, `fetchpriority` | `assets/fonts/` (WOFF2 + OFL), `index.html`, `scripts/site-pages.mjs`, `films.html`, `scripts/build-blog.mjs` | `fonts are self-hosted and the hero image is prioritised` |

**Gate.** Lighthouse (or Playwright `performance.getEntriesByType('largest-contentful-paint')`) shows LCP element is the hero image with `fetchpriority="high"`; no third-party font requests; full `npm test` green.

### Phase 6 — Browser chrome, icons, images, typography, social cards

No dependency on Phases 1–5 except R21's `sizes` values, which follow the D5/R10 card widths. If Phase 6 ships before Phase 4, use the current card widths and update `sizes` in the Phase 4 PR.

| Item | Files | Tests |
|---|---|---|
| R16 browser chrome | `assets/site.css`, `blog/blog.css` (rules moved out), `index.html`, `films.html`, `404.html`, `scripts/site-chrome.mjs` (`theme-color`) | `every page shares brand browser chrome` |
| R17 icon set + manifest | `assets/icons/` (SVG, 32px PNG, 180px apple-touch, 192/512 maskable), `manifest.webmanifest`, head emitters in `scripts/site-chrome.mjs`, `index.html`, `films.html` | `every page links the shared icon set and manifest` |
| R21 `<picture>` for services cards | `index.html` services cards, `scripts/site-pages.mjs` card emitter | `services cards serve modern formats sized to the viewport` |
| R23 typographic finishing | `assets/site.css` (`--track-eyebrow`, numerals, `text-wrap`), a `smartQuotes()` build helper in `scripts/site-pages.mjs` and `scripts/build-blog.mjs` | `rendered copy uses typographic quotes and numbers are tabular` |
| R25 social cards | `scripts/build-og.mjs` (headless Chrome, run manually, outputs committed), `assets/og/*.jpg`, `og:image` emitters | `every page has a 1200x630 jpeg social card` |

**Gate.** Full `npm test` green; the address bar on Android Chrome and iOS Safari shows `#070706` on home, an inner page, and a blog post (screenshots in the PR); Chrome's Lighthouse "Installable"/manifest panel shows no errors; the social cards preview correctly in a card validator (opengraph.xyz or similar), with a screenshot in the PR; no rendered `"` or `'` remains in the body copy of the audited pages.

### Phase 7 — Motion, texture, closing, conversion

| Item | Files | Tests |
|---|---|---|
| R22 grain + grading rule | `assets/site.css` (`body::after`), `assets/grain.png` (≤ 8 KB tile); grading rule in README | `grain overlay is decorative and non-interactive` |
| R24 CSS scroll-driven reveals | `assets/site.css` (`.reveal`, `@supports (animation-timeline: view())`), R12 progress bar moved to `scroll(root)` | `reveals are CSS-driven and fully visible with reduced motion` |
| R18 view transitions | `assets/site.css` (`@view-transition`, `view-transition-name` on header and wordmark) | `same-origin navigation uses a view transition and respects reduced motion` |
| R19 structured intake | `#start` markup in `index.html`, generated `/start/` and `/start/thanks/` in `scripts/site-pages.mjs`, `assets/intake.js`, Worker route `POST /api/intake`, `.env.example` | `intake form validates, submits and confirms`; Worker unit tests for validation, honeypot, rate limit, and the provider-error path |
| R26 footer closing band | `scripts/site-chrome.mjs` (`siteFooter`), `index.html`, `films.html`, `assets/site.css` | `footer closes with one primary call to action and studio details` |
| R27 one primary verb | every CTA emitter: `index.html`, `scripts/site-pages.mjs`, `scripts/site-chrome.mjs`, `films.html`, `404.html` | `primary calls to action share one verb and one destination` |
| R20 proof band (StrongFoam, Milrcorr, SuperPatch, PiRX) | `content/proof.json`, renderer in `scripts/site-pages.mjs` and `index.html`; marquee label | `proof band renders only real entries and the marquee is labelled as tools` |

R20 ships with the four owner-approved clients (StrongFoam, Milrcorr, SuperPatch, PiRX) as company-plus-outcome cards. Quotes, named people and logos are added later, and only when the owner supplies them.

**Gate.** Full `npm test` green; with `prefers-reduced-motion: reduce`, no view transition, reveal animation, or grain drift runs (Playwright run with the emulated media attached); a real intake submission on the preview deployment reaches the owner's inbox, and a submission with the honeypot filled is rejected; the form works with JavaScript disabled (redirect to `/start/thanks/`); INP on the homepage stays under 200 ms and CLS under 0.05 (Playwright `PerformanceObserver`), proving the grain and reveals do not cost interaction or layout stability.

### 8.1 Dependency order

```
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► Phase 7
  D1 D2 D3     R2 D8       R7 R3        R6 D5       R9 R12      R22 R24
  D7 D6 D4*    D9 R11      R8 R4        R1 R15      R13 R14     R18 R19
                                                                R26 R27
                                                                R20
Phase 6 (independent; can ship any time)
  R16 R17 R21 R23 R25
```

`D4*` is the interim fix; the real sheet lands with R6. R3 depends on R7 (tokens) and R2 (card actions use `.btn--tertiary`). R1 depends on R8 so band padding and width change together. R9 depends on R3 (header media uses the card media slot).

Phase 6 touches only the document head, image markup, and type rules, so it can ship in parallel with Phases 1–5. R21's `sizes` follows the D5/R10 card widths (see the note under Phase 6). R25's cards reuse the R22 grain once it exists; until then the card template has no grain.

Within Phase 7, R19 comes first because R26 and R27 point at its `#start` target. R26 and R27 also need R2's button tiers (Phase 2). R24 needs R12 (Phase 5) so the blog progress bar can move to `scroll(root)`. R18 needs R6 (Phase 4) so the header it names is the final one. R20 has no code dependency and can land anywhere in Phase 7.

### 8.2 Deployment

- Each merged phase deploys with `wrangler deploy` from `scrollcraft/builds/abracadabra-ai/` to the `abracadabra-marketing` Worker, after `npm test` passes locally.
- Every CSS-touching PR bumps the cache-bust query (`?v=20261019a`, `b`, …) in `index.html`, `films.html`, and the emitter in `scripts/site-pages.mjs`; `tests/cloudflare-deploy.test.mjs` already checks the deploy artefacts and should assert the three bust values match.
- Rollback is `wrangler rollback` to the previous deployment; no data migrations are involved.

### 8.3 Risks and mitigations

| Risk | Mitigation |
|---|---|
| Nav threshold change exposes the full bar on 900–1099px tablets where it did not fit before | Phase 4 ships the shortened bar (7.1) in the same PR; test at 900 and 1024 explicitly. |
| Token alpha change (`--line` 0.14 → 0.12) subtly alters every border | Visual diff pass at 390/1280 on every audited page in Phase 3; the value is a single token so a one-line revert is possible. |
| `#name` pin shortened breaks the reveal choreography in `restored-motion.css` | Keyframe percentages are rescaled, not removed; the existing `#name` test is extended to assert the final state class at pin end. |
| Generating `404.html` changes how Cloudflare resolves the not-found response | `tests/cloudflare-deploy.test.mjs` asserts the file exists in the build output and `_redirects` still maps 404; verify on the preview deployment before merging. |
| Self-hosted fonts increase repo size (~200 KB) | Only the six weights actually used are committed; subset to Latin. |
| Scroller script adds JS to a mostly static page | ~40 lines, `defer`, no dependencies, progressively enhances (the scroller works without it). |
| Intake endpoint attracts spam or leaks a provider key | Honeypot field, per-IP rate limit in the Worker, server-side validation; the email provider key lives only in Worker secrets (`wrangler secret put`) and is listed by name in `.env.example`, never in source. |
| Two elements share a `view-transition-name` on one page, which aborts the transition | Names are set only on the single header and footer wordmark; the R18 test asserts each name occurs once per page. |
| Full-viewport grain overlay costs paint time on low-end phones | Static tiled PNG (no animated noise), `pointer-events: none`, removed under `prefers-reduced-transparency`/reduced motion where it drifts; the Phase 7 INP/CLS gate measures it. |
| OG card generation needs Chrome, which CI may lack | `scripts/build-og.mjs` runs manually and its JPG outputs are committed; the test checks the committed files, not the generator. |
| R20 proof overstates what clients said | Cards state only outcomes already published on the portfolio pages. The single metric row uses PiRX's own reported numbers. Quotes and names stay off until the owner supplies them. |

### 8.4 Documentation updates (same PR as the code)

| Phase | Docs |
|---|---|
| 1 | `README.md` testing section: note the reduced-motion test and `CHROME_PATH`. |
| 2 | `README.md`: 404 is generated; button tiers table in the "Design system" section (add the section if absent). |
| 3 | `README.md`: token list; this document's **Status** line updated. |
| 4 | `README.md:142` breakpoint note (R15); nav structure described. |
| 5 | `README.md`: fonts are self-hosted, how to add a weight; blog TOC behaviour. |
| 6 | `README.md`: icon set and manifest locations; how to regenerate social cards (`node scripts/build-og.mjs`); the curly-quote build step. |
| 7 | `README.md` design section: the one-verb CTA rule (R27), the imagery grading rule (R22), and the reveal utility; intake endpoint, its env vars, and the `wrangler secret put` step in the deploy section; `.env.example` updated. |

Each PR also appends an entry to this document's change log (section 10) and, when the deliverable changes site behaviour, to `docs/source-of-truth.md`.

---

## 9. Verification checklist (per PR)

- [ ] `cd scrollcraft/builds/abracadabra-ai && CHROME_PATH=/usr/bin/google-chrome npm test` — zero failures.
- [ ] New test(s) named in the phase table exist and fail on `main` before the change (TDD gate).
- [ ] Captures at 320, 390, 768, 1024, 1280, 1440, 1920 for every page touched, motion on and (for the homepage) off, attached to the PR.
- [ ] Zero console errors in the Playwright run.
- [ ] `git diff --check` clean.
- [ ] Cache-bust bumped if CSS changed.
- [ ] README / this doc updated per 8.4.
- [ ] If head tags changed: `theme-color`, icons, manifest, and the 1200×630 JPG `og:image` are present on every page touched.
- [ ] If a Worker secret or env var was added: `.env.example` and the README deploy section list it by name.
- [ ] Commit authored and committed as `makemoney2023`; branch `cursor/<name>-55e8`; PR opened as draft.

---

## 10. Change log

- **2026-10-19** — Implemented Phases 1–7 on `cursor/premium-ux-implement-55e8`. PiRX proof figures follow the live site data: 398K search impressions and 46.5K AI-feature impressions.
- **2026-10-19** — Specification created from the 2026-10-19 audit (12 pages × 13 viewports, 353 captures; 9 defects, 15 recommendations). No implementation yet.
- **2026-10-19** — R20 unblocked: the owner approved StrongFoam, Milrcorr, SuperPatch and PiRX for the proof band. The band now has four company-plus-outcome cards linked to their portfolio pages and a PiRX metric row, with quotes and names optional.
- **2026-10-19** — Second premium pass: added R16–R27 (section 5A) and Phases 6–7, with the dependency, risk, documentation, and checklist updates. R20 is blocked on owner-supplied proof content. No implementation yet.
