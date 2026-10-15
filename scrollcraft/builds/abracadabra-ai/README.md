# Abracadabra AI catalog

One-page Scrollcraft gallery of shipped work. Brief is in `BRIEF.md`. Footage and sales packs live in `/outputs`.

```bash
# from this folder
npx --yes serve -l 4500

# behavior and responsive regression tests
npm test
```

Then open http://localhost:4500. Scroll is the timeline. The hero is the orbital film plus the promise and the two actions in a left column. From 1024px the actions sit side by side; below that they stack full width, still left-aligned. The compiler section sits directly under it and demonstrates the core mechanism in four explicit states: **Describe → Engineer → Build → Run it**. Its Engineer state converges an Intent stream and a Context stream into one engineered build plan before anything is built; its Build state dispatches five coordinated AI-agent workstreams from that plan and converges their outputs into a working system. The Aramaic origin of the name follows the compiler. The time travel chapter that follows moves a delivery calendar through **Conventional → Engineer → Parallel → Arrive** to show the serial calendar folding in on itself, without stating a duration, and names the result: **It feels like magic.** The range chapter between that calendar and the model strip moves through **Marketing → Applications → Machine learning → The record → The sale** and hands off with "The models are next." The model strip names the gateway providers and the Workers AI families. The dedicated AEO chapter follows **Question → Answer → Verify → Measure**. Services, portfolio, products, and the LLM Leverage course are linked from the site header. On desktop these sequences resolve as their chapters scroll; on mobile they use direct controls in normal document flow; reduced motion presents every state as a static sequence. The fixed signal rail reports page progress, the utterance strip inks one syllable per specimen on larger screens, and the Showdesk promo remains the only video scrub on the page.

Copy comes from [`docs/source-of-truth.md`](../../../docs/source-of-truth.md). If the page and that file disagree, fix the file first, then the page.

## Approved voice — 2026-10-15

- Public pages speak in second person and we. Sentences are short and benefit-led. "the company," "the team," and the visible product word "brief" stay off the page. The project action is **Start a project**. The homepage anchor stays `#brief`.
- The visible homepage headline is "Custom software, built for how you work." The lede is "We design, build and run AI-powered tools that fit your business, not the other way around." Service headlines are the approved lines: AI assistants that actually get things done; Instant answers from your own documents; Every AI model. One bill; AI that answers your phone; Put repetitive web work on autopilot; Let AI run code, safely; Apps built around your workflow; On-brand images, video and voice, on demand; Get found in AI search; Research you can trust, with every source cited. Section headers are What you get, Use cases, How it works, How it compares, Proof, and FAQ.
- **What changed** — voice on every public marketing surface, including films, the walkthrough, the blog chrome, about, meta, JSON-LD, and `llms.txt`.
- **Why** — Christopher rejected the third-person product voice.
- **Code touchpoints** — `index.html`, `films.html`, `walkthrough.html`, `llms.txt`, `scripts/service-sales.mjs`, `scripts/site-data.mjs`, `scripts/site-pages.mjs`, `scripts/blog.mjs`, `scripts/service-visuals.mjs`, `docs/source-of-truth.md`, `tests/marketing-site.test.mjs`, `tests/site-pages.test.mjs`.
- **Data-flow impact** — regenerated service, hub, portfolio, product, course, blog, about, privacy, and homepage chrome and offerings HTML, plus the service block of `llms.txt`.
- **API / schema impact** — WebPage headline matches the visible homepage h1. Service names match the approved headlines.
- **Verification** — `CHROME_PATH=/usr/bin/google-chrome npm test` in this folder.

## Product voice — 2026-10-15

- Public pages now speak in a product-led register. The product or the system is the subject. Sentences are complete. The "You do X. We do Y." cadence, process-talk, and the visible product word "brief" are gone. The project action is **Start a project**. The homepage anchor stays `#brief`.
- The visible homepage headline is "Abracadabra builds software around the way a company already works." The document title is "Abra-ca-dabra: Software around the way a company works." Service sections are "What the system delivers," "Where it earns its place," "From the operation to a live system," "A product, a hire, or a system built for the job," and "Named work." Process steps are Plan, Build, Review, and Launch and run.
- **What changed** — voice on every public marketing surface, including films, the walkthrough, the blog chrome, the privacy draft, the 404 page, and `llms.txt`.
- **Why** — the previous plain lines were still short fragments and a transactional cadence.
- **Code touchpoints** — `index.html`, `films.html`, `404.html`, `walkthrough.html`, `llms.txt`, `scripts/service-sales.mjs`, `scripts/site-data.mjs`, `scripts/site-pages.mjs`, `scripts/site-chrome.mjs`, `scripts/blog.mjs`, `docs/source-of-truth.md`, `tests/marketing-site.test.mjs`, `tests/site-pages.test.mjs`.
- **Data-flow impact** — regenerated service, hub, portfolio, product, course, blog, about, privacy, and homepage chrome and offerings HTML, plus the service block of `llms.txt`.
- **API / schema impact** — WebPage headline matches the visible homepage h1. Walkthrough item names match the visible titles.
- **Verification** — `CHROME_PATH=/usr/bin/google-chrome npm test` in this folder.

## Plain copy — 2026-10-15

- Headlines name a result an owner can picture. Subheads say what the thing is in one or two sentences. Stack names sit on a single “Under the hood” line on service pages. Homepage cards no longer say “Built on.”
- The visible homepage headline is “Software for the way your company already works.” The schema slogan stays “From thought to working software.” Blog index, post intros and check prompts, films, privacy draft wording, the 404 page, walkthrough buttons, product and portfolio hubs, meta descriptions, and `llms.txt` use the same plain voice.
- **What changed** — owner-facing copy on every public page.
- **Why** — the previous lines named a mechanism (“the next step you approved,” “Built on Agents SDK”) instead of the result.
- **Code touchpoints** — `index.html`, `films.html`, `404.html`, `walkthrough.html`, `llms.txt`, `scripts/service-sales.mjs`, `scripts/site-data.mjs`, `scripts/site-pages.mjs`, `scripts/blog.mjs`, `content/blog/`, `docs/source-of-truth.md`.
- **Data-flow impact** — regenerated service, portfolio, product, course, blog, about, privacy, and homepage offerings HTML, plus the blog block of `llms.txt`.
- **API / schema impact** — WebPage headline matches the visible homepage h1. Organization slogan is unchanged.
- **Verification** — `CHROME_PATH=/usr/bin/google-chrome npm test` in this folder.

## Finish system — 2026-10-15

- Inner pages and the homepage now share one control radius, one card radius, and one accent button: dark ink `#170804` on `#ff4b24`. The graph-paper field is gone from catalog pages. Section headings sit closer to their own block than to the block above. Cards clip their photographs. The dashed “PLACEHOLDER” shout is a quiet note with the existing factual sentence and a link to the brief. The about page states what is not published, and the footer on catalog pages names the studio.
- The homepage keeps the film, the left-column hero, and the absolute footer. Its primary actions and the nav brief button use the same accent pair. Service cards on the homepage are left-aligned and framed.
- **What changed** — spacing, type, buttons, cards, notes, nav, and footer read as one product.
- **Why** — the live site at `5baac92` looked unfinished next to a finished dark product.
- **Code touchpoints** — `blog/blog.css`, `index.html`, `films.html`, `scripts/site-chrome.mjs`, `scripts/site-pages.mjs`, `scripts/blog.mjs`.
- **Data-flow impact** — regenerated service, portfolio, product, course, blog, about, and privacy HTML, plus the homepage chrome.
- **API / schema impact** — none.
- **Verification** — `CHROME_PATH=/usr/bin/google-chrome npm test` in this folder: 41 passed.

## Service photographs and shared heroes — 2026-10-15

- Each service page uses the supplied photograph: the hero sits behind the left column, the first body photograph sits beside “Three places it shows up,” and the second sits beside “Work we can name.” The same hero is the card image on `/services/` and on the homepage services grid.
- Derivatives are AVIF and WebP at 640, 960, and 1280, with a JPEG fallback, width and height, and lazy loading on the body and card images. Each service page points `og:image` at a 1200×630 JPEG. Portfolio, products, the course, the blog, a blog post, and the about page open on the same left column. Section headings on those pages are left-aligned with that column.
- **What changed** — real service photographs replaced the empty image slots, and the inner-page heroes share one left-column pattern.
- **Why** — Christopher supplied the service stills and asked the catalog pages to use the same hero column.
- **Code touchpoints** — `content/service-images/`, `scripts/service-visuals.mjs`, `scripts/site-pages.mjs`, `scripts/blog.mjs`, `blog/blog.css`, `blog/media/services/`, `index.html`, `tests/site-pages.test.mjs`, `tests/marketing-site.test.mjs`.
- **Data-flow impact** — generated service, hub, portfolio, product, course, blog, and about HTML, plus the homepage offerings block.
- **API / schema impact** — each service page’s primary image is its `og.jpg`.
- **Verification** — `npm test` in this folder.

## Mobile nav and hero column — 2026-10-15

- From 1024px the homepage hero copy and the two actions sit in a left column over the film, with the actions side by side. Below 1024px the actions stack full width under the text, still left-aligned. Service, portfolio, product, course, and blog opening copy uses the same column. Later section headings stay centered.
- Under 768px the header is a Menu control and the link list opens under the bar. From 768px the six links stay in one row, including Course and Blog.
- On screens up to 1100px the footer stays in normal flow at the end of the brief, so it no longer paints over the hero. The compiler stays in `#compiler`, under the hero.
- **What changed** — the hero column, the compact menu, and the phone footer.
- **Why** — Christopher asked for a left column on desktop and stacked full-width actions on smaller screens, and the phone preview showed the footer and the nav overflowing the hero.
- **Code touchpoints** — `index.html`, `blog/blog.css`, `scripts/site-chrome.mjs`, `scripts/site-pages.mjs`, `tests/marketing-site.test.mjs`, `tests/site-pages.test.mjs`.
- **Data-flow impact** — generated page headers.
- **API / schema impact** — none.
- **Verification** — `npm test` in this folder.

## PiRX screenshots — 2026-10-15

- Self-hosted pirx.ca screenshots now sit on the portfolio card, the case study, the custom-apps proof, and the AI visibility proof. Alt text describes the screen. PiRX's own on-site claims are not copied into Abracadabra copy.
- **What changed** — the home hero is the portfolio card and the case-study hero. The race predictor is the custom-apps proof. Accuracy, the marathon predictor, and the blog index are the AI visibility proof. The full home page and a blog post sit in the case-study body.
- **Why** — Christopher supplied web-optimized screenshots as proof of the live product.
- **Code touchpoints** — `scripts/pirx-shots.mjs`, `scripts/service-sales.mjs`, `scripts/site-data.mjs`, `scripts/site-pages.mjs`, `blog/blog.css`, `assets/pirx/`.
- **Data-flow impact** — generated service and portfolio HTML.
- **API / schema impact** — the pirx.ca page's primary image is the home-hero screenshot.
- **Verification** — `npm test` in this folder.

## PiRX proof — 2026-10-15

- The public pirx.ca Search Console claim is now the Christopher-approved window Jul 14 to Oct 13, 2026: 375K search impressions, 1.85K clicks, average position 7.6, and 43.5K Generative AI feature impressions as a separate report. The lead line is "From near-zero to 375K search impressions and 43.5K AI-feature impressions in 90 days."
- The AI visibility proof card and the pirx.ca portfolio note carry that copy plus an illustrative two-curve chart in the brand tokens. The chart is labelled "Source: Google Search Console, Jul 14 to Oct 13, 2026" and is not a daily export. Top AI-feature pages stay on the portfolio note.
- The homepage measure panel, the matching FAQ, and `llms.txt` use the same window. Research and custom apps still do not repeat the figures. The page does not mention CTR and does not claim a traffic or revenue result.
- **What changed** — the 2026-09-23 pull is no longer the public figure.
- **Why** — Christopher cleared the three-month Search Console window.
- **Code touchpoints** — `scripts/pirx-chart.mjs`, `scripts/service-sales.mjs`, `scripts/site-data.mjs`, `scripts/site-pages.mjs`, `blog/blog.css`, `index.html`, `llms.txt`.
- **Data-flow impact** — generated service and portfolio HTML.
- **API / schema impact** — FAQ JSON-LD text on the homepage and the AI visibility page.
- **Verification** — `npm test` in this folder.

## Layout — 2026-10-15

- The homepage hero is only the full-bleed orbital video, the headline, the subhead, and the two actions. The "Thought → working software" compiler moved into `#compiler`, the next section. Tokens are unchanged. A later note the same day moved that opening copy into a left column.
- Homepage shells that were two columns at 1024 now stack at 1100px and below. Service, portfolio, product, course, and blog pages keep body copy in a 46rem measure. Card grids stay two columns until 700px. Opening titles were centered in this pass and moved to the left column in the note above.
- **What changed** — text no longer sits in a leftover side column, and the required widths do not grow the page sideways.
- **Why** — Christopher reported the layout broken across viewports.
- **Code touchpoints** — `index.html`, `blog/blog.css`, `tests/marketing-site.test.mjs`.
- **Data-flow impact** — none.
- **API / schema impact** — none.
- **Verification** — `npm test` in this folder.

## Service sales pages — 2026-10-15

- Each `/services/<slug>/` page is a sales page: outcome headline, "Show us how it works" (`/#brief`) and "AI Readiness Check", a proof strip, the problem, outcome cards, three generic business uses, the shared four-step process (brief, build, people approve, launch and run), a comparison of off-the-shelf / hire in-house / Abracadabra with an honest row for when off the shelf wins, a named proof card, the Cloudflare line, "Contact for pricing" with no numbers, five to seven questions, and a closing CTA. Copy lives in `scripts/service-sales.mjs`. Visible length is about 900–1300 words.
- Safe code execution stays at `/services/safe-code-execution/` and is written as a capability of AI assistants. The assistants page and the safe-code page link to each other. The hub ItemList still lists all ten.
- Portfolio notes added for SuperPatch products, the StrongFoam website, the StrongFoam CRM/ERP, and Renew Implants (site, social, blogs). The pirx.ca note covers the app, the blogs, and the Jul 14 to Oct 13, 2026 Search Console window. No testimonials.
- JSON-LD on each service page is Service, FAQPage, and BreadcrumbList. The hub adds an ItemList. There is no Offer and no AggregateRating. The Google Search Console verification meta is an HTML comment, `PLACEHOLDER — needs Christopher`, and is not a token.
- Hero and two body image slots stay at `/blog/media/services/<slug>/01|02|03` until photographs are attached.

## Site pages — 2026-10-15

- The public label is Services. The header and footer link `/services/`. `#services` follows the work rail. Old `/offerings/` and `/offerings/<slug>/` URLs 301 to the new paths. Each service page has a plain "What it is", three generic business examples, the steps, the deliverables, who it is for, and real questions. Examples name a job (after-hours questions, a document lookup, a weekly report), not an industry. Named portfolio items stay as they are. A hero slot and two in-body slots point at `/blog/media/services/<slug>/01|02|03` for photographs Christopher will supply. Price, timeline, and a client example stay in the visible `PLACEHOLDER — needs Christopher` block.
- `#models` sits between the menu and the answer chapter: two CSS marquees, original brand colours, white marks on `#070706`. The seventeen former wordmarks are now files in `assets/logos/`. Baseten, Cerebras (letter), Cohere, Fal AI, Ideogram, xAI, Zhipu GLM, Stability, and BAAI are from `@lobehub/icons-static-svg` 1.95.1, with monochrome marks painted white. Cartesia and Groq are the official favicons. Parallel is the official mark, painted white. Google Gemma is the DeepMind dark-surface mark. Black Forest Labs FLUX is the official icon with the white plate removed and the mark painted white. Leonardo is the official electric-purple docs icon, a PNG because no SVG was available. gpt-oss and Whisper reuse the OpenAI mark already on the strip, with the name beside it. Earlier marks from Simple Icons are unchanged.
- `scripts/site-pages.mjs` writes `/services/`, `/portfolio/`, `/products/`, and `/course/llm-leverage/`, plus sitemap, `llms.txt`, and `_redirects` entries outside the blog markers. JSON-LD states only facts already on the site. Price, client approval, and unpublished module names stay in a visible `PLACEHOLDER — needs Christopher` block and stay out of the graph. There is no Offer and no AggregateRating.
- Panel copy on the homepage is shorter, body text uses the ink colour, and labels that were under 0.75rem are now at least that size.

## Blog voice — 2026-10-14

- All 24 notes were rewritten in a plain first-person plural voice for an owner: a direct answer, a worked example, the steps we would take, common mistakes, and a "What we'd do" section. Headings that the image slots sit under stayed put. Citations, FAQs, dates, and the Readiness Check placements are unchanged. No new statistics were added.
- `content/blog/image-briefs.json` names each note's three slots (hero, body, closing) and the heading that slot belongs to. The hero photograph and the two in-body photographs are the pictures Christopher supplied for that note. Each in-body picture is 1280×720, served as WebP with a JPEG fallback, and the alt text is the line in `content/blog/body-alt.json`. The in-body figures have no caption. Alt text describes the picture that is actually published.

## Blog layout and images — 2026-10-14

- The index opens with a featured note (the readiness assessment), a filter for each pillar, then a three-column card grid. Every card shows the hero photograph, the excerpt, the publish date, and the reading time. Each post page has a split hero, a bold opening sentence, styled comparison tables, a cited percentage callout when the note has one, an FAQ accordion, sources, an author box, related cards, and the sticky Readiness Check.
- Colours and type stay the studio tokens: canvas `#070706`, surface `#11110F`, ink `#F5F0E8`, accent `#FF4B24`, optic `#8DEBF2`, Tektur and IBM Plex Sans.
- Each note's hero and card image is a 1280×720 photograph: WebP first, JPEG if the browser needs it. The 1200×630 card at `blog/og/<slug>.png` is that photograph with the title plate over it. The index and author cards stay on the plain title plate.

## Blog — 2026-10-14

- `npm test` runs `node scripts/build-blog.mjs` before the Playwright suite. `npm run deploy` stays `wrangler deploy`. Generated HTML, RSS, sitemap entries, OG images, and redirects are committed so a folder deploy still works.
- Posts live in `content/blog/*.md`. A note with `datePublished` after the build date is written with `noindex` and left out of the index, sitemap, RSS, and the live list in `llms.txt`. `BLOG_PREVIEW=1 node scripts/build-blog.mjs` includes those scheduled notes and marks every generated page `noindex`. Leave the variable unset for `npm test` and for the files committed here.
- Each post has three images and a 1200×630 title card at `blog/og/<slug>.png`. The blog index and the author page use `blog/og/index.png` and `blog/og/author.png`.
- `content/` and `scripts/` are in `.assetsignore`. `robots.txt` disallows CCBot and Bytespider and allows the other named answer-engine crawlers.
- All 24 calendar notes are dated 2026-10-14, so a build on or after that day lists them on `/blog`, in the sitemap, in RSS, and in the live block of `llms.txt`, with `index,follow`. A later `datePublished` would still stay out of those surfaces until that day. Census BTOS, the Census CES function shares, BDC profitability shares, the pirx.ca impression count, the Chamber “four or more platforms” line, and two Microsoft paraphrases that were not on the fetched Work Trend Index page are omitted.

## Work rail — 2026-10-07: Getting started

- The homepage horizontal pan (`#iii`, “Working systems, already in the world”) now includes one Super Funnel player: Getting started, 66 seconds, `assets/films/superfunnel-getting-started.mp4`, poster `assets/superfunnel-getting-started.webp`.
- The card links to `films.html`. The other seven tours stay on that page. `walkthrough.html` is unchanged.

## Films archive — 2026-10-07: Super Funnel tours

- Eight finished Super Funnel associate walkthroughs are plain `<video controls>` players on `films.html`, with WebP title-card posters and measured durations in JSON-LD and `sitemap.xml`.
- They are not scroll-scrub legs. `walkthrough.html` stays one flight through Showdesk, Schema, LLM Leverage, and Canadian Discount Appliances.
- Assets: `assets/films/superfunnel-*.mp4` (faststart remux of `outputs/videos/superfunnel/`) and `assets/superfunnel-*.webp`.

## Design revision — 2026-09-28: Range background motifs

- A decorative `<canvas class="range-bg" aria-hidden="true">` sits inside the bordered `#range` menu instrument, clipped to that surface and layered behind its controls and copy. The canvas draws one restrained motif per service: signal waves for marketing, an assembling screen grid for applications, a small network for machine learning, ledger rows filling for the record, and orders flowing into a checkout for the sale.
- On desktop the chapter's scroll scrub picks the motif. A tab choice on any screen also picks it. States crossfade over 600 ms.
- The canvas pauses when offscreen or when the tab is hidden, caps pixel ratio at 1.5, and draws about 30 frames a second. Mobile draws at half density. Reduced motion draws one still frame.
- The canvas carries `data-bg-state` and `data-bg-running` so tests can read it. It adds no copy and no claims.

## Design revision — 2026-09-26: Range as a menu of services

- `#range` headline is **The only limit is what you can think of.** The eyebrow reads "The menu."
- The five plates are services only: marketing, applications, machine learning, the record (CRM/ERP), and the sale (stores and lead generation). No product names, films link, or project links appear in the chapter.
- The handoff into `#aeo` stays: "Getting found works the same way. The next room is the receipt."

## Design revision — 2026-09-26: Showdesk in plain language

- Public copy no longer says "ringside phone." Showdesk is a live event that runs from entry through review, placements, and reports.
- The films page calls that cut the entry loop. The walkthrough scene label is Entry. File names and the scene id stay as they are.

## Design revision — 2026-09-25: Range copy in the operator's voice

- `#range` headline is **Software for the way your company actually works.** The left column says the screen follows the order of work the team already trusts.
- Showdesk runs a live event from entry through review, placements, and reports. Canadian Discount Appliances answers fit, price, and the next step before anyone gets in a car. PIRX stays only on the machine-learning plate. The handoff is still "The next room is the receipt."

## Design revision — 2026-09-25: Range chapter before the answer receipt

- Added a pinned chapter, `#range`, between `#time` and `#aeo`. Span `2.6`, drift `#0C0B10`. It is not a specimen, so the utterance strip stays five syllables.
- Five job-ticket states: **Marketing → Applications → Machine learning → The record → The sale**. The active ticket comes forward; the plate body cross-fades.
- PIRX is named only on the machine-learning plate, and only qualitatively. The pirx.ca Search Console figures stay in `#aeo`. The record plate names no product. Commerce names Canadian Discount Appliances and ends on the handoff into the receipt.
- Chapter index inserts III — Range and shifts Answer through Build. Mobile puts the instrument above the copy. Reduced motion unpins the section, hides the controls and ticket stack, and stacks all five plate bodies.
- FAQ and JSON-LD add "Do you only build software?" The first sentence is "No."
- A direct visit to a chapter hash lands on that chapter immediately. In-page links keep the smooth glide.

## Design revision — 2026-09-24: Magic, and the name under the hero

- The delivery chapter headline is now **It feels like magic.** The arrival line uses the same phrase. The calendar, the four states, and the "no sleight of hand" explanation stay.
- `#name` is back directly under the hero: Aramaic *avra kadavra*, "I will create as I speak," tied to the brief and to production software.

## Design revision — 2026-09-24: Orbital horizon hero

- Added OpenHero's `orbital-horizon` film as the full-stage background behind the existing **From thought to working software** hero and operation compiler.
- Preserved the complete Describe → Engineer → Build → Run it interaction, with a layered scrim keeping the headline, actions, and compiler legible over the moving image.
- The decorative video is muted, loops inline, and pauses on the opening frame when reduced motion is requested. Desktop and normal-flow mobile layouts both cover the full hero stage.
- Verification: `npm test` 13/13, desktop/mobile/reduced-motion visual review, and production media smoke check.

## Design revision — 2026-09-24: Time travel chapter

- Added a pinned chapter, `#time` (**It feels like magic.**), after the hero and the Aramaic origin section. It carries `data-sc-span="2.35"` and drifts the canvas to `#0A0912`.
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

Live at [abra-ca-dabra.app](https://abra-ca-dabra.app/) on Cloudflare Worker `abracadabra-marketing`. `www.abra-ca-dabra.app` redirects to the apex with a 308 from a Cloudflare Redirect Rule. `check.abra-ca-dabra.app` stays the Readiness Check on Vercel. The Vercel project `abracadabra` (personal account `makemoney2023`) is still linked to this folder, and a push to `main` still redeploys that project. The public apex is the Worker.

### Cloudflare Workers (static assets)

The same folder deploys to Cloudflare as Worker `abracadabra-marketing`. There is no build step. `wrangler.jsonc` points `assets.directory` at this folder. `html_handling` is `none` so `/walkthrough.html` and `/films.html` stay the canonical URLs already published in the sitemap. `/` rewrites to `/index.html` (`_redirects`, status 200). A missing path serves `404.html`. `.assetsignore` keeps tests, npm metadata, the brief, and env files off the public asset set.

```bash
# from this folder, with CLOUDFLARE_API_TOKEN in the environment
npm run deploy
```

`npm run preview` is `wrangler dev`. The token is not stored in this folder. Deploying publishes `https://abracadabra-marketing.abracadabra-ai.workers.dev` and attaches the apex `abra-ca-dabra.app`. That workers.dev preview sends `X-Robots-Tag: noindex`. `www` is not a Worker hostname. A Workers `_redirects` file cannot do a host redirect, so `www.abra-ca-dabra.app` is a Cloudflare Redirect Rule (308 to the apex, query preserved). The account workers.dev subdomain is `abracadabra-ai`.

## Cloudflare revision — 2026-10-06 (apex)

- **What changed** — The apex `abra-ca-dabra.app` is a custom domain on Worker `abracadabra-marketing`. `www` 308s to the apex. `check.abra-ca-dabra.app` stays on Vercel.
- **Why** — Nameservers for the zone are on this Cloudflare account.
- **Code touchpoints** — `wrangler.jsonc`.
- **Data-flow impact** — The public apex is served by the Worker. `www` is a zone Redirect Rule, not a Worker route.
- **API / schema impact** — none.
- **Verification** — `node --test tests/cloudflare-deploy.test.mjs` passed. Live, through Cloudflare anycast `104.21.74.23`: `https://abra-ca-dabra.app/` HTTP/2 200, `server: cloudflare`, no `x-vercel-id`, title "Abra-ca-dabra: From thought to working software". `https://www.abra-ca-dabra.app/films.html?from=www` HTTP/2 308 to `https://abra-ca-dabra.app/films.html?from=www`. `https://check.abra-ca-dabra.app/check` HTTP/2 200 with `x-vercel-id` present (still Vercel). Marketing preview `https://abracadabra-marketing.abracadabra-ai.workers.dev/` HTTP/2 200 with `x-robots-tag: noindex`.

## Cloudflare revision — 2026-10-06

- **What changed** — The catalog can deploy to Cloudflare Workers static assets beside the existing Vercel project.
- **Why** — The marketing site should live on Cloudflare the same way Handoff will.
- **Code touchpoints** — `wrangler.jsonc`, `.assetsignore`, `_redirects`, `_headers`, `404.html`, `package.json`, `tests/cloudflare-deploy.test.mjs`.
- **Data-flow impact** — none. Pages are still the static files in this folder.
- **API / schema impact** — none.
- **Verification** — `node --test tests/cloudflare-deploy.test.mjs`.

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
- The 44-second promo and the eight Super Funnel tours state a `duration` because those lengths were measured. The other cuts were not measured, so they do not claim one.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | The catalog. Distinct scenes on the Scrollcraft engine (`scrollcraft.js`, `scrollcraft.css`). |
| `walkthrough.html` | The flight. Eight legs of real product footage chained as one scroll-scrubbed take on the scroll-world engine (`scroll-world.js`, copied from `.cursor/skills/community/scroll-world/references/scrub-engine.js`). |
| `films.html` | The archive. Source cuts as plain players, `preload="none"`. |
| `robots.txt`, `sitemap.xml`, `llms.txt` | Crawler files. Deploy them at the site root next to `index.html`. |

Walkthrough legs live in `assets/world/` (desktop `.mp4`, mobile `-m.mp4`, WebP posters). Encoded per the scroll-world skill: `-g 8 -keyint_min 8 -sc_threshold 0 +faststart`, crf 20; mobile 720w at `-g 4`, crf 23. Review and improvement plan: [`docs/scroll-world-review.md`](../../../docs/scroll-world-review.md).
