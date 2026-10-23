---
name: abracadabra-seo-entity-and-measurement
description: "The off-site and analytics half of SEO, AEO and GEO: Search Console linked to GA4 with an AI Mode filter, GA4 AI assistant channel, Bing Webmaster sitemap and IndexNow, Wikidata then Organization sameAs, business listings with identical name, address and phone, genuine Reddit and YouTube presence, and citation share-of-voice tracking on a fixed prompt set. Use when setting up or reporting on search and AI visibility, analytics or entity building. Triggers: Search Console, GA4, Bing Webmaster, Wikidata, sameAs, listings, NAP, Reddit, YouTube, share of voice, AI citations, analytics report."
metadata:
  version: 1.0.0
  parent: abracadabra/seo-geo-aeo/SKILL.md
---

# Entity and measurement: the off-site half

Read the parent skill `abracadabra/seo-geo-aeo/SKILL.md` first. Search the library for related skills: `?q=analytics`, `?q=seo`, `?q=reporting`. On-site posts are not enough on their own. Engines decide who a brand is from many sources and decide what works from measurement. These steps are often left unfinished, so track each one as a card.

Limits that always apply: no DNS, MX or Email Routing changes (ask staff for domain verification), never print account keys or tokens, nothing public (a listing, a Reddit answer, a video, a Wikidata edit) goes out without Christopher's approval in his own words, and no invented numbers in reports.

## 1. Search Console linked to GA4

- Verify the property in Google Search Console (domain property preferred; DNS verification is a staff request) and submit the sitemap.
- Link Search Console to the GA4 property.
- Save an **AI Mode** filter in the Search Console performance report so AI-surface impressions and clicks can be pulled on a schedule.
- In GA4, use the native AI assistants channel for referral traffic from AI engines. A custom channel group is optional.
- Report organic and AI-referred sessions side by side, with conversions for each. AI-referred sessions tend to convert at a higher rate but are far fewer, so show both the count and the rate.

## 2. Bing

- Add and verify the site in Bing Webmaster Tools, submit the sitemap, and confirm the IndexNow key shows as active.
- ChatGPT search reads from Bing, so a gap in Bing coverage is a gap in ChatGPT visibility.

## 3. Wikidata, then `sameAs`

- Create a Wikidata item for the organization only if it meets notability and referencing rules, with real third-party references. Do not fabricate sources.
- After the item exists, and only then, add the Wikidata URL and the other verified profile URLs to the Organization node's `sameAs` in the site schema, and update the schema test. See the technical-stack skill.

## 4. Listings with the same name, address and phone

Create or claim profiles where they apply (for example LinkedIn, Crunchbase, Product Hunt, G2, Capterra, Google Business Profile). Use the identical business name, description, URL and, where relevant, address and phone (NAP) everywhere. Inconsistency weakens the entity. Keep one master record of the exact strings and copy from it.

## 5. Genuine Reddit and YouTube

- **Reddit:** answer real questions as a real, disclosed person or account. Follow each subreddit's rules. No astroturfing, no fake accounts, no undisclosed promotion. Drafts go to Christopher first.
- **YouTube:** two or three explainer videos on the topics the posts cover, with accurate titles and descriptions, a link to the matching page, and captions or a transcript.

## 6. Citation share-of-voice tracking

- Choose a fixed set of about 20 prompts that match the client's primary queries and buyer questions. Keep the set stable so trends are comparable. Record it in the card.
- Run it on a schedule against the main engines (ChatGPT, Perplexity, Google AI Overviews and AI Mode, Gemini, Claude, Copilot) with a share-of-voice tool, or by hand if there is none. Record, for each prompt: was the brand cited, which URL, which competitors were cited, and the date.
- Report share of voice = prompts where the brand is cited divided by prompts run, per engine, with the change since last run.

## 7. Reporting rules

- Every figure comes from a named tool and a date range. Say which. If a number cannot be pulled, say so. Never estimate and present it as measured.
- A good weekly report has: new posts live, indexation status (Google and Bing), clicks and impressions from Search Console, AI Mode data, AI-referred sessions and conversions from GA4, share of voice, top and bottom pages, and the three next actions.
- The restructure-first rule: when a page ranks but is not cited, fix the page (answer-first H2s, one table, FAQ, consistent naming) before writing new URLs.
- Findings that need a decision go to Christopher as a short card with a recommendation, not as a published change.

## 8. Setup checklist

- [ ] Search Console verified, sitemap submitted, linked to GA4, AI Mode filter saved.
- [ ] GA4 shows the AI assistants channel.
- [ ] Bing Webmaster verified, sitemap submitted, IndexNow key active.
- [ ] Wikidata item created (if notable), then `sameAs` updated with a schema test.
- [ ] Listings created or claimed with identical NAP.
- [ ] Reddit and YouTube plan approved by Christopher.
- [ ] Share-of-voice prompt set of about 20 saved, first baseline run recorded.
