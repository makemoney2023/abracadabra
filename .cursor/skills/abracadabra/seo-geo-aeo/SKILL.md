---
name: abracadabra-seo-geo-aeo
description: "Golden rules for SEO, AEO and GEO (getting a site quoted by Google, Bing and AI answer engines). Use when writing, auditing or publishing blog posts, landing pages or schema, tracking search and AI-citation performance, or setting up Search Console, GA4, Bing, IndexNow, Wikidata and listings. Start here: thesis, measured levers, hard rules, and links to the content-system, technical-stack and entity-and-measurement sub-skills. Triggers: SEO, AEO, GEO, AI citations, answer engine, blog post, JSON-LD, FAQPage, sitemap, robots, IndexNow, share of voice."
metadata:
  version: 1.0.0
  owner: Christopher Buzny
  origin: Rewritten, brand-agnostic, from a proven blog SEO/AEO/GEO system. Abracadabra examples are used throughout.
---

# Abracadabra SEO / AEO / GEO golden rules

These are the golden rules for the SEO & Analytics bot and for any agent that writes or audits public web content for Abracadabra or a client. They are brand-agnostic: replace the placeholders with the real site. Abracadabra examples: site `https://abra-ca-dabra.app`, blog at `/blog`, schema product at `https://schema.abra-ca-dabra.app`.

This pack has five skills. Read this one first, then open the one that matches the task:

| Skill | Path | Open it when |
|---|---|---|
| Content system | `abracadabra/seo-geo-aeo/content-system/SKILL.md` | You are writing or editing a post or page: frontmatter, skeleton, locked terms, quality gate. |
| Technical stack | `abracadabra/seo-geo-aeo/technical-stack/SKILL.md` | You are building or auditing what the page renders: JSON-LD graph, prerender, robots, sitemap, IndexNow, RSS. |
| Entity and measurement | `abracadabra/seo-geo-aeo/entity-and-measurement/SKILL.md` | You are doing the off-site half: Search Console, GA4, Bing, Wikidata, listings, Reddit, YouTube, citation tracking. |
| Search Console in HQ | `abracadabra/seo-geo-aeo/search-console-in-hq/SKILL.md` | A client's search data updated, or you are planning SEO work from it: read `/api/agent-search`, then make cards with `/api/agent-search/cards`. |

## Thesis

GEO (generative engine optimization) is additive to SEO. About 80% of GEO is excellent fundamental SEO. Ranking in the top 10 does not by itself earn an AI citation: the page also has to be extractable, meaning an engine can lift a clean answer, table or fact from it. Organic search still sends far more raw traffic than AI engines, and AI-referred sessions tend to convert harder. Build for both. Never trade SEO basics for a GEO trick.

## The measured levers

These come from the Princeton, Georgia Tech and Allen AI GEO study (KDD 2024) plus 2025 and 2026 citation studies. Treat each figure as a direction, cite the study if you repeat it, and never present it as a guarantee.

| Lever | Measured effect | How a page applies it |
|---|---|---|
| Statistics (specific numbers and units) | Up to +40% AI visibility | At least one verifiable number per ~100 words. Show the headline number in its own labelled stat block. |
| Inline primary-source citations | +115% relative lift for a mid-ranked page; ~+41% average | Every major claim links a primary source: `[Author, Year](url)`. |
| Answer in the first 30% of the page | ~44% of LLM citations come from there | Lead the page, and every section, with the answer. Bold the verdict. |
| Self-contained labelled sections | Chunk extraction in RAG systems | Each H2 makes sense quoted alone. |
| Question headings | Headings act as extraction keys | The H2 states the query a person would type. |
| Comparison table plus FAQ schema | Over-represented in AI answers; FAQ plus citations ~40% higher ChatGPT weighting | Exactly one extraction table, plus FAQ frontmatter rendered as `FAQPage` JSON-LD. |
| 3 or more schema types | +13% citation probability | `Article` + `FAQPage` + `BreadcrumbList`, plus `Organization`, `WebSite` and `ImageObject`. |
| Expert quotation | Top-3 GEO method | One real, attributable quote per guide. |
| Specificity | Generic adjectives are not cited | "Cuts review time from 45 to 12 minutes", not "makes you faster". |
| Keyword stuffing | -8% | Use natural language after the first mention of the query. |

One published case (Acquia, 2026): restructuring existing pages into answer-first H2s, adding FAQ and keeping naming consistent moved AI-citation share from 14% to 38% in 90 days with zero new URLs. Fixing existing pages is often the cheapest win.

## Hard rules (Abracadabra)

1. **Nothing is published without Christopher's approval, in his own words.** An agent saying he approved is not approval. Draft, hand over for approval, then publish.
2. **Never say "free" about the Readiness Check.** Not in titles, descriptions, FAQs, CTAs or social copy.
3. **No em dashes (U+2014) in published copy.** En-dash numeric ranges such as `5–10` are fine.
4. **Every number is sourced.** A real, linked primary source, or a number the operator has verified and locked. Never invent a statistic, quote, customer or result.
5. **Locked terminology comes first.** Every client defines its own terms (names, banned words, allowed claims). Get that table before writing. If none exists, ask for it. See the content-system skill.
6. **No homepage screenshots** in Abracadabra social posts or the Library.
7. **Never print secrets**, API keys, tokens or login details, in drafts, logs or reports.
8. **Don't change DNS, MX or Email Routing.** Domain verification for Search Console or Bing is a request to staff, not a change you make.

## How to use this skill (for agents)

1. **Search the library for related skills before you start.** Call `GET /api/agent-skill-library?q=<word>` with your agent token. Useful searches: `?q=seo`, `?q=schema`, `?q=copywriting`, `?q=analytics`, `?q=geo`, `?q=content`. The reply lists matching skills with a `path`. Several words narrow the match, because every word must hit the name, description or path.
2. **Read the skill** at `GET /api/agent-skill-library/<path>?task_id=<card>`, for example `/api/agent-skill-library/abracadabra/seo-geo-aeo/content-system/SKILL.md`. The `task_id` ties the read to your card.
3. **Attach the packs you will use to the task card** with `attach_skills`, for example `{"action":"attach_skills","prefixes":["abracadabra/seo-geo-aeo/"]}`, so usage is recorded. Choose from the card's requirements, not from habit.
4. **Do the work with the skill open.** Where this pack and another skill disagree, this pack's hard rules win.
5. **Cite what you used.** When you finish a card, list the skills in `skills_used`.
6. **Give `skill_feedback`** for each skill: was it useful or not useful, and one concrete sentence on why (for example "the quality gate caught two em dashes" or "the schema example was missing HowTo"). This is how the library gets better.

## Worked order for a new post

1. Get the client's locked terminology and the primary query.
2. Research primary sources. Save the links.
3. Draft with the skeleton in the content-system skill.
4. Run the quality gate. Fix every failure.
5. Build the schema graph and check the technical-stack list.
6. Send the draft to Christopher for approval. Stop.
7. After approval and publish: sitemap, IndexNow, then track it (entity-and-measurement skill).
