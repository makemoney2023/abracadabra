# Abra-ca-dabra — Source of Truth

**Domain:** [abra-ca-dabra.app](https://abra-ca-dabra.app)
**Studio:** Abracadabra AI
**Updated:** 2026-10-16
**Status:** Working source for site copy, sales language, and what we are willing to say in public.

This file is the argument and the evidence. The GitHub catalog at [makemoney2023/abracadabra](https://github.com/makemoney2023/abracadabra) is the showroom (films, scroll catalog, one-pagers). This document is the front door: who we are, what the work is worth, and what proves it.

The local folder `Desktop/abracadbra` is not yet a clone of that repo. When the site is built, clone the repo first so this file and the catalog share one history.

---

## The name

Abracadabra, traced back far enough, is Aramaic, roughly *avra kadavra*. It is not a spell. A description of the work becomes production software.

---

## How to use this file

- Site headlines, section copy, and CTAs come from **Brand** and **Homepage copy**.
- Case-study selection comes from **Business value** and **Portfolio**.
- **Portfolio and Business value are proof of range, not a price list.** They show what got built for people who happened to ask first. They are not the edge of what we'll take on — if a workflow isn't listed here, that's not a "no," it's the next entry.
- A number in **Confirm before publishing** stays out of public pages until someone marks it safe.
- Client and employer names stay in the portfolio tables. Public pages use the outcome until naming is cleared.
- If a later page disagrees with this file, change this file in the same session.

---

## Brand

**One line.** From thought to working software.

**Promise.** We go deep on the intent behind the request, the context underneath it, and the words your people already use, then we ship the system, the film, and the script your team runs. We shrink the gap between what's in your head and what's actually running in production. From zero to scale, at the speed of thought.

**The offer underneath.** Custom software, built for how you work. The operation stays intact. The software is cut to fit it. AI takes a task. You keep the relationship. You leave with something you can demo.

**What makes this different.** Most shops turn down the request that doesn't fit a template. We take it, because the actual skill isn't "write code" — it's reading intent and context correctly, then turning that read into the right prompts, the right architecture, and a system that actually ships. Big, ambiguous, half-documented problems are the ones this studio is built for. If a product already exists that solves it off the shelf, we say so and send you there instead.

**Atmosphere.** Where thought becomes a working system. The grasp of the technology should feel like magic. The page should still read like an operator: a live product, a film, a next step.

**Primary action.** Start a project.

**Secondary action.** See the work.

**Voice.**

- Professional, plain, a little wonder in the headlines, facts in the body.
- Benefits before feature names. Name a stack only after the business result.
- Specific where we have shipped proof. Quiet where a metric is still internal.
- Wellness tools are non-diagnostic. Say that whenever an assessment is described.
- The name explains the magic: Aramaic *avra kadavra*, "I will create as I speak." The delivery chapter may say the result feels like magic, and must say there is a system behind it. Do not claim the model is magic with no system behind it.

**The page sounds like this.** "Custom software, built for how you work." / "We design, build and run AI-powered tools that fit your business, not the other way around." Second person and we. Short, confident, benefit-led sentences. Do not write "the company" or "the team." Do not use the visible product word "brief."

**We do not sound like this.** Streamline, leverage, innovative, transformational, or a claim that the model is magic with no system behind it.

---

## Who it is for

Your business, when the way you work does not fit a product you can buy.

Three arrivals, one page:

1. You already have customers and a way of working that no off-the-shelf product was drawn for.
2. You are replacing a pile of tools that each hold a piece of the customer.
3. You need the product and the way you sell, in the same delivery.

A fourth arrival: the job is too specific for a catalog, and we take it.

**A good project** sounds like a Tuesday: the workflow, the words, and the outcome on the other side. If a product already on the market does that job, the reply says so.

---

## Homepage copy

Paste-ready. The live page order, as of 2026-10-16, is: hero, AI model logos, business-function cards, showcase tabs, the model band, Search & AI visibility (the PiRX proof), notes, Cloudflare, the FAQ accordion, then the close.

Functions come from one list, `businessFunctions` in `scripts/site-data.mjs`:

| Function | Owns |
|---|---|
| Search & AI visibility | Get found in AI search. PiRX: 398K search impressions and 46.5K AI-feature impressions in 90 days (Jul 18 to Oct 17, 2026). |
| Marketing | On-brand images, video and voice, on demand. Research you can trust, with every source cited. |
| Sales | AI assistants that actually get things done. |
| Customer service | AI that answers your phone. |
| Operations | Put repetitive web work on autopilot. Instant answers from your own documents. Apps built around your workflow. |
| Design | Live portfolio work: StrongFoam, Milrcorr, pirx.ca. No separate service URL. |
| Platform | Every AI model. One bill. Let AI run code, safely. |

**Nav.** The top bar is Services, Portfolio, Products, Course, Blog, and Start a project. Services opens one menu. Each function name links to its hub section, with that function's services listed under the name. Design links to the portfolio. The phone menu uses the same grouping. The footer still lists each function.

**Showcase.** Operate plays the StrongFoam website loop and links to `/portfolio/strongfoam-website/`. Build plays the Milrcorr loop and links to `/portfolio/milrcorr/`. The same films are the heroes on those two portfolio pages. Files live at `assets/video/strongfoam-loop` and `assets/video/milrcorr-loop` (mp4, webm, and a jpg poster). These are the v2 silent renders. The poster shows first. The film stays muted, plays inline, and loops only while it is in view. Reduced motion keeps the poster.

**Cloudflare.** After the model band, the proof, and the notes, and before the FAQ. Official light wordmark on the dark canvas, with clear space around the mark. Headline: Apps that scale, proudly built with Cloudflare. Supporting line: They grow with your business, from the first user to millions, without a rebuild, and stay fast, secure, and available wherever your customers are. No other stack name appears as a visible label.

### 1. Hero

**Eyebrow:** Custom software

**Headline:** Let us bring your ideas to life.

**Subhead:** Custom software and AI tools, built for how you work. We design, build and run them, so they fit your business, not the other way around.

**Primary action:** Start a project. The anchor is `/#start`.

**Secondary action:** See the work. It points at the function cards.

**Claim boundary:** “At the speed of thought” is the brand premise in the schema slogan and the name chapter. It describes the compressed gap and parallel delivery model. Do not attach an elapsed-time guarantee, fabricated completion percentage, commit count, or test count without measured project evidence. It is not the visible homepage headline.

**Primary CTA:** Start a project
**Secondary CTA:** See the work

**Headline alternatives**

| Option | Line | Why it exists |
|---|---|---|
| A | From thought to working software. | Brand slogan. Stays in JSON-LD `slogan`. Not the visible homepage headline. |
| B | Custom software, built for how you work. | The visible homepage h1 until Oct 2026. Now opens the lede. |
| E (page headline) | Let us bring your ideas to life. | The visible homepage h1. Approved by Christopher, Oct 2026. |
| C | From a blank page to a system your team can demo. | Strong on the leave-behind. Weaker on fit. |
| D | We shrink the gap between what you meant and what's running. | Leads with the mechanism, not the product. |

### 2. Proof bar

Four live lines. No client logos until permission exists.

- Milrcorr — commercial fit-outs, with an estimate you can request — [milrcorr.com](https://milrcorr.com)
- StrongFoam — the public site, with an estimate you can start — [strongfoam.com](https://strongfoam.com/)
- Schema — where AI search cannot find you — [schema-two.vercel.app](https://schema-two.vercel.app/)
- LLM Leverage — a team trained on any model — [learn.abra-ca-dabra.app](https://learn.abra-ca-dabra.app)

### 3. The zero-to-scale case

**Header:** "From zero to scale" isn't a slogan. Here's the receipt.

**Body:** From near-zero to 398K search impressions and 46.5K AI-feature impressions in 90 days. Google Search Console, Jul 18 to Oct 17, 2026: 398K search impressions, 1.94K clicks, average position 7.6. The Generative AI features report is separate and is not added to the search total: 46.5K impressions. Both curves start near zero in mid-July, step up around Aug 31, and reach daily peaks of about 12-18K (search) and about 1.2-1.8K (AI features) by mid-September.

**Small print (internal, not for the page):** Christopher approved this window on 2026-10-15. Do not mention CTR. Do not claim a traffic or revenue result. Do not add the two impression totals. The charts on the site are blurred Search Console crops framed as product shots, not a daily export. The 2026-09-23 pull (201K / 21.8K / 1.1K) is superseded and must not stay on a public page.

### 3A. Answer Engine Optimization

**Eyebrow:** Answer Engine Optimization

**Headline:** Be the answer AI can verify.

**Body:** We turn buyer questions into direct answers, clear entities, structured data, and evidence that answer engines can understand. Then we measure what changed. AEO, GEO, and SEO run as one discipline.

**Four moves:**

1. **Map the questions.** Start with what buyers actually ask when they compare, evaluate, and decide.
2. **Build the answer.** Publish a direct response with the supporting detail and proof beside it.
3. **Make it legible to machines.** Connect the page, entity, schema, and source signals without inventing a score or claim.
4. **Measure the surface.** Track indexed demand, clicks, and observed AI-search visibility; revise where the evidence is weak.

**Proof:** From near-zero to 398K search impressions and 46.5K AI-feature impressions in 90 days. Source: Google Search Console, Jul 18 to Oct 17, 2026. Search: 398K impressions, 1.94K clicks, average position 7.6. Generative AI features (separate report): 46.5K impressions. Top pages: good-10k-time-by-age 11,068; good-half-marathon-time-by-age 8,192; good-5k-time-by-age 6,728.

**Primary CTA:** Run the Readiness Check
**Secondary CTA:** Open Schema

**Claim boundary:** We do not promise placement or imply that every answer engine uses the same retrieval method. The Readiness Check reports measured scan output separately from generated recommendations. Public proof names the exact surface and source that were measured.

### 4. The situation

**Header:** The business already has a way of working.

Most software arrives with its own. People learn the tool, route around it, and keep the real process in their heads, their inboxes, and a spreadsheet nobody owns. The cost is the distance between the sale you know how to make and the screen you were given — and that distance doesn't close on its own, no matter how complicated the workaround gets.

We close it. The steps stay yours. The software is built to carry them, at whatever scale or complexity they actually run at.

### 5. Benefits

**Header:** What changes when the software fits.

1. **Your experts stop being the bottleneck.** Customers and new hires get a grounded answer from your science, your product, and your plan, on text or voice, any hour.
2. **Your best rep can be everywhere you sell.** The talk track, the booking, the pipeline, and a coach on the real book of business. A new person in a new city sells to the standard.
3. **Interest arrives with a reason attached.** A personal result, the customer's language, a practitioner's name, a next step, a cart.
4. **You see the move in time to make it.** what a body can do; what a rate will do; which visit is ready to buy; whether AI search can find you.
5. **A new market is a production run.** Channel, language, and creative from a system that already knows the claims you allow.
6. **The first yes happens on the screen.** Fit, price, booking, and trust before anyone gets in a car.
7. **The capability stays when the invoice would have grown.** Answers, agreements, content, and the customer record live on your side of the wall.
8. **Complexity doesn't get quietly declined.** Everything above is proof we can build, not the edge of what we'll take on. We write down how the work already happens before anyone writes code. That is the product. It is what lets us say yes to the request other shops pass on.

**CTA:** Describe how you work

### 6. How it works

**Header:** Three moves, from the way you work to a system that runs.

1. **You walk us through the operation.** The steps, the exceptions, the sentence a good rep already says — however complicated it actually is.
2. **We build the software around those steps.** We read the intent, hold the context, and write the prompts and the architecture that carry it — AI where it removes a task, a person where the relationship matters.
3. **You leave with the live system, the film, and the script.** Your team can demo it without us in the room.

**CTA:** Describe how you work

### 7. Selected work

**Header:** Work you can open.

- **Better answers from any model.** LLM Leverage is a self-paced course, plus a workshop path you can run.
- **See the work, then request an estimate.** Milrcorr is the public site for StrongFoam's sister commercial fit-out work. A visitor can see office, retail, and hospitality fit-outs across Southwestern Ontario, and request an estimate. [milrcorr.com](https://milrcorr.com)
- **Start an estimate on the page.** The StrongFoam website walks through the offer, an estimate a visitor can start, and a booking. [strongfoam.com](https://strongfoam.com/)
- **One associate app, from the home dashboard.** Super Funnel Getting started: setup, pipeline, and nav, in 66 seconds. The rest of the tour is on `/films.html`.

**Range line:** The same studio has shipped clinical-style assessments, direct-sales floors, coaching agents, signed agreements, fraud review on live orders, an AI-visibility program that took a brand-new domain to real search traffic, and sites for practices that live on the next appointment. We name that work when the client says we can. **This page is a sample of what shipped, not a ceiling on what we'll take on.**

### 8. Who it is for

Use the three arrivals — plus the fourth — in **Who it is for** above.

### 9. Fit

**Header:** Start a project

Tell us the steps, the exceptions, and the result. We reply with the system, or with a product you can buy that already fits.

### 10. Close

The close is the same block as Fit. The visible heading is **Start a project.** The label above it is **The project**.

**Body:** Tell us the steps, the exceptions, and the result. We reply with the system, or with a product you can buy that already fits.

**CTA:** Start a project
**Secondary:** See the work

### Meta

- **Title:** Custom software, built for how you work.
- **Description:** We design, build and run AI-powered tools that fit your business, not the other way around.
- **Canonical:** `https://abra-ca-dabra.app/`
- **Companion pages:** `/walkthrough.html` ("The walkthrough: one flight through Schema and LLM Leverage"), `/films.html` ("The films on file: Schema, LLM Leverage, and Super Funnel"), `/blog` (notes with named sources; a post is public only on or after `datePublished`, unless a preview build sets `BLOG_PREVIEW=1`), `/about/christopher-buzny`, `/privacy` (draft, not in force). `/portfolio/showdesk`, `/portfolio/canadian-discount-appliances`, and `/products/showdesk` 301 to `/portfolio/`.
- **Crawler files:** `/robots.txt` allows named answer-engine crawlers and disallows CCBot and Bytespider, `/sitemap.xml` (image and video extensions, plus the blog index and author page), `/llms.txt` (a quotable summary with the dated pirx.ca figures, the non-diagnostic rule, and only the posts that are already public).

Title uses a colon, not a dash, so it survives snippet rendering intact. Description is held under 160 characters. (Updated 2026-09-23 for the site build; the earlier 47-word description was too long to show whole.)

---

## Business value

Each row is a semantic system turned into something a buyer can take to a budget meeting. Proof lives on the desktop unless noted as already public in the GitHub catalog. **This table is not the limit of what we build — it's what happened to get built for people who asked first.**

| Pressure on the business | What they get | Desktop proof |
|---|---|---|
| Your process is real, but nobody built software for exactly this | A system shaped by your actual intent and context, not a generic template — regardless of how complex the workflow or how unusual the edge cases | Every row below, plus everything not yet on this page |
| Experts are the queue | A correct answer from owned science, product, and compensation knowledge, on text and voice, without growing the support team in proportion to the network | `SuperPatch AI`, `Videostoryboard`, `VideoTranscriptions`, `all studies` |
| New reps sound unlike the standard | The best talk track in every conversation: frameworks from real training, words for each buyer, a voice path that books a time, a field app, and a coach on the live pipeline | `SalesEnablement`, `Practioiner Wordtracks`, `superpatch-d2c`, `jai`, `superfunnelsystem` |
| Leads arrive with no story | An assessment a person finishes, a result they can read, their language, a clinic's name, email, and a path to purchase | `Medical Questionairre`, `superpatch-consumer-survey`, `superpatch-health-practitioner-survey` |
| Nobody knows if AI answer engines can even find the brand | A scanner that scores AI visibility and generates the fix — plus a live proof case: a brand-new domain (pirx.ca) went from near-zero to 398K search impressions and 46.5K AI-feature impressions in 90 days (Jul 18 to Oct 17, 2026) | `Schema`, `Projects/PIRX` (pirx.ca) |
| Decisions wait on last month | What training can support, whether a habit is changing how someone feels, the rate move before the weekend, which anonymous visit is ready to buy | `Projects/PIRX`, `spwearable`, `HotelRates`, `Website Visitor` |
| A new channel or country needs a department | On-brand creative, training films, product kits, and assessments for the markets and buyers you already have | `associate-content-studio`, `Superpatch_Context/content-studio`, `Translations`, `RobSperry Video Translations`, `Projects/SocialFunny`, `90 Day Social`, `Projects/Military`, `ICP` |
| The sale required a visit | Fit, estimate, booking, trust, and the written record before the drive or the specialist's hour | Showdesk (repo), Canadian Discount Appliances (repo), `Projects/wilkandwilk`, `Projects/strongfoam`, `Projects/queenlynch/queenlynch-site`, `Projects/hunt`, `ClaudeSkills/apps/sieger-show-secretary` |
| The vendor bill grows with you | Identity, signatures, content, and answers you own. A second product can share the platform without a second company | `Website Visitor`, `SPSign`, content studio, `Projects/PIRX` + `spwearable` |
| Only one person knows how it works | Video, studies, sell sheets, and manuals become a product a customer can finish and a team can teach | studies corpus, `ChannelChart`, `LLMCourse`, `Patch Sell Sheets`, leadership and communication manuals |
| Fraud review eats a morning every day | Low-risk orders clear themselves. High-risk orders reach a person with the history already assembled | `Orders` |
| The brand's claims drift the moment someone new writes | Generation fenced by approved science, voice, and product rules | content studio, `SP Brand Guidelines`, `seo-geo-aeo`, website rewrites |

**Second-product pattern.** PIRX (performance) and spwearable (wellness logging) share one backend, with the brand kept separate. That is the concrete meaning of zero to scale: the next surface reuses the record, the language, and the way the work is built — the same way pirx.ca's content engine turned into a real, growing AI-search asset without a second team.

---

## Portfolio

Attribution tags:

| Tag | Meaning |
|---|---|
| `Proving ground` | Built inside SuperPatch. Public naming needs a decision. |
| `Venture` | Separate product or external client. |
| `Studio` | Abracadabra / catalog / course / method. |
| `Ops` | Makes delivery faster. Usually not a public case study. |
| `Exclude` | Not original, or held out of this file. |

### Public specimens already in the GitHub catalog

These four can be named and linked today. They're the ones already cleared to name — not the whole shop; the rest of this table is the range. Films and sales packs live in the repo under `outputs/` and `scrollcraft/builds/abracadabra-ai/`.

| Work | Buyer outcome | Live |
|---|---|---|
| Milrcorr | The public site for StrongFoam's sister commercial fit-out work. A visitor can see the work and request an estimate. | https://milrcorr.com |
| StrongFoam | The public site, with an estimate a visitor can start and a booking. Do not say "insulation contractor." | https://strongfoam.com/ |
| Schema | See where answer engines cannot find you, then generate the fix. Internal inbox for prospecting | https://schema-two.vercel.app/ |
| LLM Leverage | Teach a team one method for better answers from any model, with workshops and a certificate path | https://learn.abra-ca-dabra.app |

Repo brief for that catalog: quiet conjure, museum of working software, physical proof. The marketing site leads with the benefit argument in this file. The catalog stays the room where the films play. The homepage proof band names StrongFoam, Milrcorr, SuperPatch, and pirx.ca from the portfolio pages already published here. It does not add quotes. **Start a project** is the only primary action. On the homepage it opens the form at `#start`. Everywhere else it opens `/start/`, which posts to `POST /api/intake`.

### Named on the service pages — 2026-10-15

Christopher cleared these names for the public service pages and `/portfolio/`. No testimonials. No metrics except the pirx.ca Search Console window Jul 18 to Oct 17, 2026, already in this file.

| Name | What may be said | Service pages |
|---|---|---|
| SuperPatch products | Public product pages a buyer can read. Do not name SuperPatch AI, distributors, or any internal system. | AI assistants, custom apps |
| Milrcorr | The public site for StrongFoam's sister commercial fit-out work. Office, retail, and hospitality fit-outs across Southwestern Ontario, and an estimate a visitor can request. https://milrcorr.com | Custom apps, web automation |
| StrongFoam website | The public site takes an estimate and a booking. Live at https://strongfoam.com/. Do not say "insulation contractor." | Custom apps, web automation |
| StrongFoam CRM/ERP | The operating record beside the website. No figures. | Custom apps |
| Renew Implants | The website, the social posts, and the blogs. No patient, clinic, or metric language. | Custom apps; social on AI media; blogs on AI visibility |
| pirx.ca | The app and the blogs. Search Console figures stay on the portfolio note and the AI visibility page only. | Custom apps, AI visibility, search-grounded research |

Answers from your documents and voice have no named case. Any model, one bill points at the homepage model gateway and states no client spend. Safe code execution is a capability of the assistants; its URL stays, and both pages link to each other. It is not a client case.

Christopher approved a fresh Google Search Console window on 2026-10-15: Jul 18 to Oct 17, 2026. Publish 398K search impressions, 1.94K clicks, average position 7.6, and 46.5K Generative AI feature impressions as a separate report. Lead with "From near-zero to 398K search impressions and 46.5K AI-feature impressions in 90 days." Always show the date range. The 2026-09-23 digits are retired.

### Answers and knowledge

| Work | Path | Outcome | Tag |
|---|---|---|---|
| SuperPatch AI | `Desktop/SuperPatch AI` | Multi-domain assistant (science, product, plan) with memory, retrieval, and voice. Always-on expert for distributors, customers, and staff | Proving ground |
| Earlier platform lineage | `Desktop/Development/SuperPatchAi-Base` | Predecessor of the same support-and-recommendation system | Proving ground |
| Video to knowledge | `Desktop/Videostoryboard`, `Desktop/VideoTranscriptions` | Films and audio become searchable, citeable context for the assistant | Ops |
| Studies corpus | `Desktop/all studies`, `Desktop/Projects/Studies`, `Desktop/Superpatch_Context` | Trial summaries and source material so health-adjacent answers stay tied to documents | Ops |
| Avatar / voice agent visuals | `Desktop/avatar` | Face and call-agent presentation layer for a branded assistant. Research and assets, not a finished public product | Ops |

### Revenue: the field, the call, the signature

| Work | Path | Outcome | Tag |
|---|---|---|---|
| Sales enablement and call center | `Desktop/SalesEnablement` | Training films become frameworks, practitioner language, voice pathways, a booked calendar, and a desk that shows the call | Proving ground |
| Practitioner word tracks and sell sheets | `Desktop/Practioiner Wordtracks`, `Desktop/Patch Sell Sheets` | The sentence for each buyer and each product, reused by people, voice agents, and the field app | Ops |
| S.T.A.R. | `Desktop/superpatch-d2c` | Sample, track, align, recruit. Guided multi-product conversations, contacts, team view, digital cards, several languages. Live signal: `star-seven-sigma.vercel.app` | Proving ground |
| J.Ai | `Desktop/jai` | Sales coach on the rep's real pipeline, scripts, objections, and team | Proving ground |
| Super Funnel System | `Desktop/superfunnelsystem` | One associate application: field sales, content studio, and landing pages with referral identity. Eight walkthrough films (2026-09-29 renders) are on the public films page as plain players as of 2026-10-07, and stored in `outputs/videos/superfunnel/` | Proving ground |
| SPSign | `Desktop/SPSign` | In-house agreements for a global associate base, with a signer ceremony and a privacy-request path. Replaces a per-seat signature vendor at network scale | Proving ground |
| IDecide notes | `Desktop/SuperPatch/IDecide.md` | Buying notes on presentation software: close rate observed, fear of another login and a silo. Evidence for "one record, not another tool" | Ops |

### Products people finish

| Work | Path | Outcome | Tag |
|---|---|---|---|
| Health Insight Index | `Desktop/Medical Questionairre` | 14-domain wellness intake, plain-language bands, recommendations, practitioner dashboard, branded email and PDF. Non-diagnostic | Proving ground |
| Consumer Signal Score | `Desktop/superpatch-consumer-survey` | Public assessment, personal report, many locales including right-to-left, email, affiliate lookup, path to cart | Proving ground |
| Practitioner Signal Score | `Desktop/superpatch-health-practitioner-survey` | Same scoring, clinic branding, patient links, flyer and QR, no cart — the patient returns to the provider | Proving ground |
| spwearable | `Desktop/spwearable` | Catalog, wear log, daily feel, wellness trend, tenant-aware chat, billing. Live: `spwearable.vercel.app` | Proving ground |
| PIRX | `Desktop/Projects/PIRX` | What training structurally supports right now. Wearable ingestion, projections, chat, mobile — and the content engine behind pirx.ca, which went from a blank domain to 398K search impressions and 46.5K AI-feature impressions in 90 days (Jul 18 to Oct 17, 2026). Domain signal: `pirx.ca` | Venture |
| Launch survey | `Desktop/launchsurvey` | Structured beta feedback for a training platform | Ops |
| TotalGut7 | `Desktop/TotalGut7Website` | Supplement brand site variants (clinical, editorial, consumer) from captured source copy. Confirm naming rights before public use | Venture |

### Seeing the move in time

| Work | Path | Outcome | Tag |
|---|---|---|---|
| Website Visitor | `Desktop/Website Visitor` | First-party visitor identity, intent, and a dashboard aimed at commerce tools. Alternative to a rented identity stack. Consent considered in the design | Proving ground |
| Hotel pricing intelligence | `Desktop/HotelRates` | Columbus hoteliers stop hand-checking competitor rates. History, alerts, and a recommendation | Venture |
| Schema | `Desktop/Schema` | AI-visibility scanner plus an outbound ops inbox. Already public | Studio |
| SEO / GEO / AEO method | `Desktop/seo-geo-aeo` | The playbook behind visibility work, distilled from PIRX and proven on pirx.ca — a method, not a second product | Ops |
| Channel matrices | `Desktop/ChannelChart` | Practitioner, benefit, and standard-of-care comparisons that shorten a B2B education cycle | Proving ground |
| Hunt | `Desktop/Projects/hunt` | Map-based stand and movement guidance from terrain, food, water, and conditions | Venture |
| Intercom strategy | `Desktop/Intercom` | Support-AI decision memos. Vendor ROI figures in those docs are the vendor's, not our measured result | Ops |

### Orders, risk, and the rules of the house

| Work | Path | Outcome | Tag |
|---|---|---|---|
| Fraud review | `Desktop/Orders` | ByDesign order risk scoring so low-risk orders clear and analysts spend time on high-risk ones. README states the manual baseline: about 3 hours a day from a team of 4–5 | Proving ground |
| Security policy pack | `Desktop/Projects/Budget` | Access control, consumer MFA, critical-system MFA, data retention, information security, vulnerability management. Governance a buyer's security review can read | Proving ground |
| Customer identification notes | `Desktop/Orders` (`ENHANCED_CUSTOMER_IDENTIFICATION_SYSTEM.md`) | Tiered matching so an order connects to a real customer history before a risk decision | Ops |

### Creative, language, and channel

| Work | Path | Outcome | Tag |
|---|---|---|---|
| Associate content studio | `Desktop/associate-content-studio`, `Desktop/Superpatch_Context/content-studio` | On-brand text, image, and campaign output with usage limits and approved skills. Expanded studio includes email, social, blog, ads, print, SMS, scripts, and video | Proving ground |
| Social character pipeline | `Desktop/Development/SuperPatchAI_SocialMedia` | Consistent on-camera characters for fitness content, joined to a video pipeline | Proving ground |
| Persona and portrait systems | `Desktop/ICP` | Buyer archetypes, competitive persona work, and image sets so creative aims at a person before the ad is made | Proving ground |
| Social at volume | `Desktop/Projects/SocialFunny`, `Desktop/90 Day Social ` | Caption, DM, and post systems in a brand voice, including persona-specific batches | Proving ground |
| 90-day and campaign decks | `Desktop/cstore hypedeck`, `Desktop/Ironman`, `Desktop/JayGlazer_infomercial`, `Desktop/MarkKerr`, `Desktop/Projects/Military` | Retail, sport, celebrity, military, and first-responder channel assets, plus the studies those claims lean on | Proving ground |
| Translations | `Desktop/Translations`, `Desktop/RobSperry Video Translations` | Product kits, comp-plan docs, and campaign copy across markets (including Mexico, Hungary, and European languages). Training films transcribed and subtitled in seven languages | Proving ground |
| Memo and routine output | `Desktop/Super_Memo_Output` | Short, on-claim routines and explanations associates can send, paired to specific products | Ops |
| Amazon and web rewrites | `Desktop/Amazon Rewrite`, `Desktop/WebsiteRewrites`, `Desktop/WebsiteRewrites 2`, `Desktop/loveable SP website`, `Desktop/Projects/SuperpatchWebsite` | Listing and homepage language brought to a grade a buyer can read | Proving ground |
| PR media hub | `Desktop/PR Article Synapsis` | Article synopsis and tagging so earned media can be found and reused | Ops |
| Brand, science pictures, product color | `Desktop/SP Brand Guidelines`, `Desktop/SuperpatchLabs_Visualizations`, `Desktop/Chiro-Images`, `Desktop/Projects/NewProductColours` | The visual system, the science diagrams, and product color exploration | Ops |
| Income-stack film | `Desktop/ClaudeSkills/apps/superpatch-income-stack` | A long scroll story of the income opportunity, exportable as a film | Proving ground |
| Product photography generator | `Desktop/Superpatch_Context/superpatch-image-generator-web` | Patch imagery (placement, peel, activity) without a new shoot for every frame | Proving ground |
| Landing pages | `Desktop/Projects/LandingPages` | Campaign pages for individual products, with comparison, FAQ, and offer | Proving ground |
| Podcasts and documentary quotes | `Desktop/Projects/SuperPatch Podcasts`, `Desktop/mark kerr documentary quote extraction` | Long-form voice turned into usable lines | Ops |

### Places, practices, and the physical sale

| Work | Path | Outcome | Tag |
|---|---|---|---|
| Wilk & Wilk | `Desktop/Projects/wilkandwilk` | Orthodontic practice site: photographic scroll, real recovered copy, a path to the consult | Venture |
| Strong Foam | `Desktop/Projects/strongfoam` | Insulation contractor: scroll experience, estimate wizard, booking, lead protection | Venture |
| Queen Lynch Pharmacy | `Desktop/Projects/queenlynch/queenlynch-site` | Brampton pharmacy site, minor-ailment visits, structured data for search and answer engines | Venture |
| Smile Care Dental | `Desktop/smilecaredental`, `Desktop/Projects/smilecaredental` | Salvage pack for a Cambridge practice rebuild. Content captured. Site not shipped in this folder | Venture |
| Appliance listing distribution | `Desktop/Projects/Appliance` | One inventory record pushed toward Facebook Marketplace, Kijiji, and Craigslist | Venture |
| Blacksage Kennels | `Desktop/ClaudeSkills/apps/blacksage-kennels` | Inquiry-led kennel site with a scroll-driven scene | Venture |
| Sieger Show Secretary | `Desktop/ClaudeSkills/apps/sieger-show-secretary` | Ringside critique: speech to text, the record, a PDF | Venture |
| Telltail | `Desktop/ClaudeSkills/apps/telltail` | Vision in a chat thread for a pet question. Explore build | Venture |

### Teaching and the way we build

| Work | Path | Outcome | Tag |
|---|---|---|---|
| LLM Leverage Course | `Desktop/LLMCourse` | The context loop as a product teams can take. Already public | Studio |
| ClaudeSkills | `Desktop/ClaudeSkills` | Reusable delivery skills. Cite as method. Do not cite as a client deliverable | Ops |
| Business coaching and manuals | `Desktop/BusinessCoaching`, `Desktop/Leadership Training Manuals `, `Desktop/Communication and Influence Manual` | Leadership and influence material. Use selectively; mixed personal and company IP | Ops |
| Prior Velocity copy kit | `Desktop/business value/` | Earlier packaging under the Velocity name (pillars, executive summary, copy kit, case index). This file supersedes it for Abracadabra. Keep it as background, not as a second public brand voice | Studio |

---

## Confirm before publishing

These are sourced on disk. They are not approved public claims.

| Claim | Where it comes from |
|---|---|
| About 95.4% fewer search operations (130 → 6); about 60–80% faster responses; large routing codebase and 1,000+ tests; context compression in the 80% range | `SuperPatch AI` case study |
| About $4k–$22k a year versus rented identity APIs; 95%+ fingerprint uniqueness; intent classification under 500ms | `Website Visitor` case study |
| About 3 hours a day from a team of 4–5 on manual fraud review | `Orders/README.md` |
| Agreements for on the order of 80,000 associates | `SPSign/README.md` |
| 10+ hours a week of manual hotel rate checks | `HotelRates` case study |
| 60 training videos → 44 frameworks → voice pathways of 36–38 nodes | `SalesEnablement` README. Process proof. Safer than the percentage claims |
| Presentation close rate of 38%, and vendor pricing notes | `SuperPatch/IDecide.md`. Observed note, not our product's result |
| Supplement review counts and pilot percentages | `TotalGut7Website`. Third-party brand claims. Do not adopt as ours |
| Any clinical study result in `Projects/Military` or `all studies` | Source science. Paraphrase only with the brand's approved claim language |

**Safe to say without those numbers.** Live URLs. "Several languages" or "twenty locales" where the app README states the locale list. "Non-diagnostic wellness assessment." "Film, one-pager, and demo script from the same footage." "A second product on a shared platform."

**Already cleared, unlike the table above.** The pirx.ca Search Console window Jul 18 to Oct 17, 2026 is approved for public use: 398K search impressions, 1.94K clicks, average position 7.6, and 46.5K Generative AI feature impressions (a separate report). Top AI-feature pages: good-10k-time-by-age 11,068; good-half-marathon-time-by-age 8,192; good-5k-time-by-age 6,728. Do not mention CTR. Do not claim traffic or revenue. Do not add the two impression totals. The earlier 2026-09-23 pull is not the public claim. Self-hosted page screenshots may be shown; do not copy PiRX's own on-site claims (370K+, 4.9/5, 97.4%, Olympians) into Abracadabra text.

---

## What stays off the public site

- Unconfirmed metrics in the table above.
- SuperPatch internal system names, until naming is cleared. Use the outcome sentences. Exception, 2026-10-07: the eight Super Funnel associate walkthroughs are on `/films.html` under that name. They are not a leg of the four-system walkthrough flight, and they are not on the homepage. Exception, 2026-10-15: "SuperPatch products" may be named as public product pages. Internal system names stay off.
- Vendor ROI calculators inside `Intercom` as if they were our measured savings.
- Medical outcomes. Assessments educate and route. They do not diagnose.
- `ai-toolkit`, `Agent-Skills-for-Context-Engineering`, and the tutorial clones under `Desktop/Development/` (`langgraph-cua-py`, `pydantic-ai`, `trustcall`, `langmem`, `elevenlabs-cookbook` / `langsmith-cookbook`, `elevenlabs-examples`, `ai-chatbot`, `gen-ui-computer-use`, `executive-ai-assistant`, `msgraph-sample-pythondjangoapp`, upstream `translation-agent`).
- Personal admin: expenses, receipts, photo editing, compressed archives.
- `Projects/BlackOps`. Held out of this source of truth. Not a public capability.
- Calendar promises ("live this quarter") until they are an actual offer.
- Secrets, `.env` contents, and customer data. Never copy them into marketing files.

---

## Relationship to other brand files

| File | Role now |
|---|---|
| This file | Source of truth for Abracadabra / abra-ca-dabra.app |
| `Desktop/business value/01-messaging-pillars.md` through `06-case-study-index.md` | Earlier Chris Buzny / Velocity / Director-of-AI packaging. Mine it for proof. Do not publish a second homepage from it without deciding whether Velocity remains a name |
| `github.com/makemoney2023/abracadabra` README, `docs/video-pipeline-targets.md`, `docs/scroll-world-review.md`, `scrollcraft/builds/abracadabra-ai/BRIEF.md`, `outputs/sales-enablement/agency/one-pager.md` | The showroom. Facts, films, and the project action. This file adds the benefit argument those pages do not yet make |

**One-sentence variants**

1. **Site:** Custom software, built for how you work. We design, build and run AI-powered tools that fit your business, not the other way around.
2. **Catalog label:** Working systems, open on the page. The word finishes as the page moves past them.
3. **Conversation:** One operation is enough. The reply is the matching system, or the system built to fit.
4. **Etymology:** Abracadabra, translated, means "I create as I speak." A description of the work becomes production software.

---

## Public copy (2026-09-26)

Showdesk, on the public site and in the lines this file gives that site, is a live event from entry through review, placements, and reports. The phrase "ringside phone" is not used. Walkthrough scene ids and media filenames are unchanged. Sales packs under `outputs/sales-enablement/showdesk/` still speak to show operators.

## Readiness Check (2026-09-23)

The check is specified in `docs/readiness-check/`. Its shell and the assessment PDF use the studio homepage colour and type roles (`scrollcraft/builds/abracadabra-ai/index.html`: canvas, Inter Tight headings/labels, IBM Plex Sans body, accent `#FF4B24`). The app that serves it is `readiness-check/` in this repo: the Schema scanner plus the check, copied here so it can deploy. GitHub would not accept a push to `makemoney2023/schema`. The public host is a Cloudflare Worker. The Vercel project `readiness-check` still lists that hostname. The folder stays separate from the studio site at `scrollcraft/builds/abracadabra-ai/`. The studio homepage links it from the hero, the situation section, the close, and the FAQ "How do I know if my business is ready to put AI to work?". The public host is `https://check.abra-ca-dabra.app/check`. Guide URLs are listed on the check app's own sitemap and `llms.txt`, because a sitemap may only name URLs on its own host. The check is a score of the current state of the business. It is not a diagnosis, and it does not publish a number the scan did not measure. When the website scan finishes, the same generator writes the full schema package and Handoff files it as finished work on the Space for that domain, with a task on the Work board. Starting a check still needs the Supabase admin env on that project. Booking still needs a Cal.com event.

## Client sites (2026-10-16)

Milrcorr (https://milrcorr.com) is the public site for StrongFoam's sister commercial fit-out work. It sits beside StrongFoam (https://strongfoam.com/) on the homepage proof bar, the selected-work rail, and `/portfolio/`. Showdesk and Canadian Discount Appliances are off the public site. Their old URLs 301 to `/portfolio/`. The products hub lists Schema and Super Funnel. The homepage has no film scrub. The walkthrough is Schema and LLM Leverage (three legs, `dateModified` 2026-09-23). The films page is Schema, two LLM Leverage captures, and eight Super Funnel tours (`dateModified` 2026-10-07). The paragraphs below dated 2026-09-23 and 2026-09-26 describe the earlier public set.

## Site build (2026-09-23, after the positioning rewrite)

The Scrollcraft build at `scrollcraft/builds/abracadabra-ai/` now carries this file's copy end to end. What landed, so nobody re-derives it:

- **Homepage** (`index.html`): hero, the Aramaic origin of the name directly under the hero ("I will create as I speak."), the time travel chapter ("It feels like magic." — a pinned delivery calendar that moves through Conventional → Engineer → Parallel → Arrive to show the serial calendar folding in on itself once the thinking is front-loaded and the workstreams run at once; no duration or percentage is stated, the geometry carries the claim, and the copy says there is no sleight of hand), the range chapter (`#range`, "The only limit is what you can think of." — a menu of services with no named work: marketing, applications, machine learning, the customer record (CRM/ERP), and the sale (stores and lead generation); nothing on the menu is fixed, and the chapter hands off into the model strip (`#models`); since 2026-09-28 a faint decorative canvas behind the menu draws one motif per service and adds no copy; the pirx.ca Search Console figures stay in `#aeo`), catalog, receipt (the pirx.ca figures with source and pull date printed under them), the situation and benefits pin, the Showdesk film scrub, the how-it-works pin, an FAQ in the operator's words, and the brief close. Every FAQ answer opens with the answer, then the qualifier, so an answer engine can lift the first sentence whole. The FAQ "Do you only build software?" answers "No." and names the public examples.
- **Search and answer engines**: colon-style title, description under 160 characters, canonical, Open Graph and Twitter cards, and a JSON-LD graph (`Organization`, `WebSite`, `WebPage`, `ItemList` of the named specimens, `FAQPage`). The walkthrough page is rendered by script, so it also ships a hidden `h1`, a `noscript` article with all eight legs, and an `ItemList`. The films page carries a `CollectionPage` and one `VideoObject` per cut. The 44-second Showdesk promo and the eight Super Funnel tours state a duration because those lengths were measured. The other captures do not.
- **Crawler files**: on 2026-09-23 `robots.txt` named GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, Bingbot, and CCBot as allowed; `sitemap.xml` lists the three pages with image and video entries; `llms.txt` is the quotable summary, including the rule that the wellness tools are non-diagnostic and the instruction to cite the pirx.ca figures with their date. As of 2026-10-14, CCBot and Bytespider are disallowed, and the other named answer-engine crawlers stay allowed. See Blog and crawlers below.
- **Held out on purpose**: no counters on the receipt figures, no invented durations, no metrics beyond the pirx.ca set cleared in Confirm before publishing, no product names from What stays off the public site.

## Blog and crawlers (2026-10-14)

The studio site gained a static blog generated from `scrollcraft/builds/abracadabra-ai/content/blog/`. The public index is `https://abra-ca-dabra.app/blog`. The author page is `https://abra-ca-dabra.app/about/christopher-buzny`. `/privacy` is a draft for Christopher to review and stays `noindex` until he approves it. Posts dated after the build day are generated for review and omitted from the index, sitemap, RSS, and the live `llms.txt` list. As of 2026-10-14 all 24 calendar notes are public and indexable. The index and each note use the studio colours and type. The index leads with the readiness-assessment note as a featured hero, a filter for each pillar, and a card grid. Each card shows the hero photograph, the excerpt, the date, and the reading time. The notes are written in a plain first-person plural voice and include a worked example, the steps we would take, common mistakes, and what we would do. Each note's hero and card image is the photograph Christopher supplied for that note, served as WebP with a JPEG fallback. The two in-body pictures are the 1280×720 photographs supplied for those slots, also served as WebP with a JPEG fallback, with alt text from `content/blog/body-alt.json` and no diagram caption. `content/blog/image-briefs.json` lists the three slots, the heading each one sits under, and the scene. Alt text describes the picture that is actually published. Figures that were not re-fetched are left out: Census BTOS and CES function shares, BDC profitability shares, the pirx.ca impression count, the Chamber line about four or more platforms, and Microsoft claims about process redesign and employer training that were not on the fetched Work Trend Index page. The Gartner data-readiness sample size is also omitted because the page and its structured data disagree. `robots.txt` disallows CCBot and Bytespider. GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended, Amazonbot, and Bingbot stay allowed. The Readiness Check sitemap is declared from `readiness-check/src/app/robots.ts`.

## Positioning rewrite (2026-09-23)

This pass answered four notes from the founder:

- **Range.** Portfolio and Business value read as proof, not a menu. Added explicit "not a price list / not a ceiling" language to How to use this file, Brand, Who it is for, Benefits, Selected work, Business value, and the Public specimens intro, so nobody mistakes the tables for the boundary of what gets built.
- **Proof for "zero to scale."** Added the pirx.ca AEO/GEO/SEO case straight from Google Search Console: 201K total impressions, 1.1K clicks, and 21.8K impressions from Google's Generative AI / AI Overviews surface alone, climbing from near-zero in June to a daily peak over 1,600 by September, with one post carrying 5,490 of those impressions on its own. Landed it as its own homepage section (3), inside Benefits (#4), in the Business value table, in the PIRX portfolio row, and cleared it explicitly in Confirm before publishing rather than leaving it unapproved.
- **The name.** Added the Aramaic root of "Abracadabra" — *avra kadavra*, "I create as I speak" — as its own section up top, and tied it back to intent, context, and prompt engineering rather than unexplained magic, consistent with the existing voice rule against claiming the model is magic with no system behind it.
- **The actual differentiator.** Added explicit language throughout that the core skill is reading intent and context correctly, then translating that read into prompts, architecture, and running software — which is why big, ambiguous, or half-documented problems are the ones this studio takes on rather than declines.

## Rescan notes (2026-09-23)

A second pass of `Desktop`, `Desktop/Projects`, `Desktop/Development`, and `ClaudeSkills/apps` added work the first catalog underweighted:

- **Orders** — fraud review on live commerce orders. Clearest missed dollar outcome.
- **SPSign** — owned agreements at network scale.
- **Projects/Budget** — security and privacy policies as a deliverable, not only as code.
- **Super Funnel System** — the field app, content studio, and landing pages converging into one associate product.
- **Translations and Super_Memo_Output** — market and associate language as a production line, not a side folder.
- **SocialFunny, 90 Day Social, Military, ICP, social character pipeline** — channel creative with a buyer attached.
- **IDecide notes** — direct evidence of the "another login, another silo" pain the homepage names.
- **Smile Care** — captured for a rebuild, not shipped.
- **BlackOps** — seen, held out.

Empty or not a product: `NikiProffit`, `Desktop/3D`, `skateTrack` (a vocal-separation script), `video Downloader` (downloaded reference clips).
