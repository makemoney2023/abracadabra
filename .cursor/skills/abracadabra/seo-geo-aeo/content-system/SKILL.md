---
name: abracadabra-seo-content-system
description: "How to write a blog post or landing page that search engines rank and AI engines quote: frontmatter contract, answer-first post skeleton, question H2s, one extraction table, FAQ that becomes FAQPage schema, locked terminology (each client defines its own), and the content-quality gate (reading level, length, em dashes, uniqueness). Use before drafting or editing any public SEO or AEO content. Triggers: blog post, article, content brief, frontmatter, FAQ, extraction table, quality gate, locked terminology."
metadata:
  version: 1.0.0
  parent: abracadabra/seo-geo-aeo/SKILL.md
---

# Content system: the post skeleton and the quality gate

Read the parent skill `abracadabra/seo-geo-aeo/SKILL.md` first for the thesis, the measured levers and the hard rules. Those rules apply here: nothing is published without Christopher's approval, never say "free" about the Readiness Check, no em dashes, every number sourced.

Search the library for related skills before drafting: `?q=copywriting`, `?q=seo`, `?q=content`. Cite them in `skills_used`.

## 0. Before you write

- **Get the client's locked terminology.** Every client defines its own terms: product names, capitalised feature names, banned words, allowed claims, how numbers are shown. You must have that table before writing. If you do not, ask Client Services or Christopher. Do not guess and do not reuse another client's table.
- **One primary query per post.** The post owns it. Check no other post already targets it.
- **Collect primary sources** first: papers, datasets, official docs, original data. Not other blogs.

## 1. Frontmatter contract

Machines read the frontmatter. People and LLMs quote the body. Keep prose in the body and everything machine-read in typed frontmatter. `faqs` needs at least two entries. `heroImage` and `heroImageAlt` are optional.

```yaml
---
title: "How to Check Your Website for AI Readiness: 7 Steps"
description: "How to check a website for AI readiness: the seven checks that matter, what each one means, and what to fix first. 150 to 160 characters."
datePublished: "2026-11-03"
dateModified: "2026-11-03"
cluster: "guides"             # a small fixed set per site, for internal linking
primaryQuery: "how to check website ai readiness"
ctaHref: "/readiness-check"
ctaLabel: "Run the Readiness Check"
order: 11
heroImage: "/blog/ai-readiness-checklist/hero.jpg"
heroImageAlt: "Plain description of what the image shows."
faqs:
  - q: "What is an AI readiness check?"
    a: "A self-contained answer of two to four plain sentences that an LLM can lift whole. No markdown."
  - q: "How long does it take?"
    a: "Another self-contained answer, with a real number where one exists."
---
```

- **Title:** leads with the primary query, about 60 characters, with a hook (a number, an audience or a concrete outcome).
- **Description:** 150 to 160 characters, contains the primary query, ends with the call to action. Never the word "free" for the Readiness Check.
- **FAQ answers:** plain sentences, no markdown, quotable verbatim. Google dropped FAQ rich results in May 2026, so the FAQ schema's job is AI extraction.
- **Dates:** ISO format. Update `dateModified` only on a real change.

## 2. Body, in this order

```mdx
Direct answer in the first screenful. **Bold the verdict.** Two to four sentences.

<ExtractionTable
  caption="Options compared"
  headers={["Option", "Best for", "Cost", "Limit"]}
  rows={[
    ["Option A", "Small sites", "Sourced number", "Sourced limit"],
  ]}
/>

<Cta href="/readiness-check" label="Run the Readiness Check" />

## A question a reader would type?

First sentence is a complete answer. Then the explanation. One idea per section.
At least one real number per ~100 words, sourced inline: [Author, Year](url).
Headline numbers go in a stat block that pairs number and label.

## Why <Brand> is different

One short section. Locked terminology only.

Closing call-to-action paragraph, then the CTA again.

## Sources

- Author (Year). [Title](url). (One line on what it supports.)
```

(`ExtractionTable`, `Cta` and the stat block are examples. Use the components the site really has. Do not invent new ones.)

Rules on top of that order:

- **Answer first.** The first screenful and the first sentence of every section carry the answer.
- **Question H2s.** The H2 is the query. "What does a schema audit check?" not "Our approach".
- **Exactly one extraction table**, near the top. An LLM must be able to quote it with no surrounding prose.
- **CTA early and again at the close.** Link and label come from the content plan.
- **Two to three internal links** in the body, same cluster first. Round-up posts link every sibling.
- **At least one verifiable number per ~100 words.** Real and sourced, or operator-locked. Any product number is operator-verified before publish.
- **Every major claim has an inline primary citation.**
- **One expert-framed, attributable quote per guide.** Real and sourced. Never invent a person.
- **Specific over generic.** Replace adjectives with numbers and examples.

## 3. Locked terminology (each client defines its own)

Locked terms are hard fails. The writer must get the client's table first, check every draft against it, and add a test or gate if the site has one. A good table has these columns: **trap**, **rule**, **why**. Typical entries are: a product term that must always be capitalised one way, a competitor or method that must never be named, a metric that must be shown in one unit only, a feature the product does not have, and a list of banned words.

### Worked example (a made-up client, for shape only)

The table below is an invented example for a fictional running-performance product. It is not a rule for any real client and must not be applied to one. It only shows what a good locked-terms table looks like. Replace it with the client's own table before writing.

| Trap | Example rule |
|---|---|
| Abbreviation for a record | Banned. Always the full product term. |
| The five drivers | Only the five named drivers, spelled exactly, summing to the total. |
| Readiness scale | One named score from 0 to 100 with fixed named bands. |
| Third-party formulas | Never named. Referred to generically. |
| Uncertainty | One product term, never statistical jargon. |
| Performance change | Shown in seconds, never percentages. |
| Integrations | Only the ones that exist. |
| Banned words | A fixed list, plus the em dash. |

Notice what makes it good: every row is checkable by a script, and each states what to use as well as what to avoid.

### Abracadabra baseline (applies unless a client table says more)

- Never "free" about the Readiness Check.
- No em dashes in published copy.
- No homepage screenshots in social posts or the Library.
- No claim about a result, customer or number you cannot source.

## 4. Content-quality gate

Put thresholds in the content plan so they are per-site and checkable. Defaults for a plain-language blog:

| Rule | Default threshold |
|---|---|
| Reading level | Flesch-Kincaid grade set per client. A consumer-audience client may need grade 5 or lower; use 8 or lower for general business readers unless the client says otherwise. Prose only: strip frontmatter, JSX, code and link syntax before scoring. |
| Length | 1,500 to 2,000 words of prose. Excludes frontmatter, FAQs, the table, stat blocks and CTAs. |
| Em dashes | Zero. |
| Uniqueness | 3-gram shingle Jaccard similarity below 0.25 against every other post. Each post owns one primary query. |
| Numbers | Every number has a link or a locked source. |
| Terminology | Zero hits against the client's banned list. |

Reading time shown on the page uses the same prose word count at 200 words per minute.

If the site has a gate script, run it on every draft. If it has none, run these checks by hand (word count, em-dash search, banned-word search, similarity against the nearest sibling post) and report the results in the card. A draft is not done until every row passes.

## 5. Publish rules

- The draft goes to Christopher for approval. Stop there.
- Future-dated posts are prerendered and return 404 until `datePublished` is reached, then are revalidated on that day. A post only counts as live once it is in the sitemap and returns 200.
- After publish: sitemap, IndexNow and tracking, per the technical-stack and entity-and-measurement skills.
