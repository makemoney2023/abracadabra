---
name: abracadabra-seo-technical-stack
description: "What a page must render and publish so crawlers and AI engines can read it: prerendered HTML, HTML metadata, one JSON-LD @graph (Article, BreadcrumbList, FAQPage, Organization, WebSite, ImageObject, Person author) with shared @ids, blog index graph, robots.txt for Googlebot, Bingbot and AI retrieval bots, sitemap, IndexNow and RSS. Use when building, auditing or debugging structured data and crawl access. Triggers: JSON-LD, schema markup, FAQPage, Article schema, sameAs, robots.txt, sitemap, IndexNow, RSS, prerender, canonical, Open Graph."
metadata:
  version: 1.0.0
  parent: abracadabra/seo-geo-aeo/SKILL.md
---

# Technical stack: what the page renders and how it is discovered

Read the parent skill `abracadabra/seo-geo-aeo/SKILL.md` first. Search the library for related skills before building: `?q=schema`, `?q=seo`, `?q=sitemap`. The schema product at `https://schema.abra-ca-dabra.app` is the Abracadabra example of structured-data work.

Replace `{origin}` below with the canonical host (for Abracadabra, `https://abra-ca-dabra.app`). Pick one canonical host and 301 the other (apex to www or the reverse).

## 1. Prerender is required

The answer, the extraction table and the FAQ schema must be in the server-rendered HTML. Main content that appears only after JavaScript runs is invisible to many AI crawlers. Check with `curl -sS <url>` (no JS) and confirm the H1, the answer paragraph, the table and the JSON-LD are all in the response.

## 2. What the page renders, top to bottom

1. JSON-LD `<script type="application/ld+json">` with the post graph.
2. Visible breadcrumb: Home / Blog.
3. H1 equal to the frontmatter title.
4. Byline: author name, "Updated {dateModified}", and read time. The name must match the Article `author` node exactly.
5. Hero figure when there is a hero image: server-rendered, sized, with alt text from `heroImageAlt` (fall back to the title).
6. Table of contents built from the H2s.
7. The body.
8. Footer CTA, then related guides (same cluster first, then a link to `/blog`).

## 3. HTML metadata

| Field | Value |
|---|---|
| `<title>` | `{frontmatter title} \| {Brand}` |
| meta description | frontmatter `description` |
| canonical | the post's own absolute URL |
| RSS alternate | `/blog/rss.xml`, with a descriptive feed title |
| Open Graph | `type: article`, `siteName`, title (no brand suffix), description, url, `publishedTime`, `modifiedTime` |
| Twitter | `summary_large_image`, same title and description |
| `og:image` / `twitter:image` | 1200 x 630. The hero composited full-bleed, or a branded title card when there is no hero. |

Article JSON-LD `headline` equals the frontmatter title (matching Open Graph), not the suffixed document title.

## 4. JSON-LD: one `@graph` per post

`@context` is `https://schema.org`. Build it from one function so every post is identical in shape. Five nodes always, a sixth when there is a hero. Use three or more schema types on every post.

| Node | Filled from | Must match what is visible |
|---|---|---|
| `Article` with `@id` `{url}#article` | `headline`, `description`, `datePublished`, `dateModified` (ISO 8601). `mainEntityOfPage` is a `WebPage` whose `@id` is the absolute post URL. `author` is the Person node below. `publisher` is `{"@id": "{origin}#organization"}`. `image` is the absolute hero URL when set. | H1, meta description, byline |
| `BreadcrumbList` with `@id` `{url}#breadcrumb` | Home, then `/blog`, then the post title: positions 1 to 3, absolute `item` URLs. | The visible crumb; the H1 carries the title |
| `FAQPage` with `@id` `{url}#faq` | Each frontmatter `faqs` entry becomes a `Question` with `name` and `acceptedAnswer.text`. | The quotable answers; the question H2s are the visible surface |
| `Organization` with `@id` `{origin}#organization` | name, url, logo. | Shared `@id` with the site-wide graph |
| `WebSite` with `@id` `{origin}#website` | name, url, `publisher` pointing at `#organization`. | Shared `@id` with the site-wide graph |
| `ImageObject` with `@id` `{url}#primaryimage` | Only with a hero. `contentUrl` and `url` are the absolute hero URL; `caption` is the alt text or title; `representativeOfPage: true`; `creditText`, `copyrightNotice`, `license`, `acquireLicensePage` and `creator` (the organization) when you own the rights. | The hero figure |

Rules:

- **Shared `@id`s.** `#organization` and `#website` use the same `@id` in the site-wide graph (injected from the root layout) and in each post graph, so they resolve to one linked entity.
- **Never mark up what is not on the page.** If the visible text does not match, do not emit the node.
- **Omit `sameAs` until verified public profiles exist**, and omit `SearchAction` until a public site-search endpoint exists. Schema must not point at a surface that does not exist. When Wikidata and listings exist, add those URLs to Organization `sameAs` and update the schema test (see the entity-and-measurement skill).
- **Validate** every graph with a structured-data validator and with a test in the repo before it ships.

### Author is a Person

Credit a named Person or a named team as a Person, not a faceless Organization. It must be dereferenceable.

```json
{
  "@type": "Person",
  "@id": "{origin}#author-<slug>",
  "name": "Team or person name, exactly as in the byline",
  "jobTitle": "Their real role",
  "url": "{origin}/about",
  "worksFor": { "@id": "{origin}#organization" }
}
```

The `url` must resolve to a real About page. Do not invent a person or credentials.

### Blog index graph

On `/blog`: a `Blog` node (`{origin}/blog#blog`) whose `blogPost` list has one `BlogPosting` per post (headline, absolute url, dates, image when present); an ordered `ItemList` (`#itemlist`) of `ListItem`s with position, url, name; and a `BreadcrumbList` (`#breadcrumb`): Home, Blog.

## 5. Discovery and publish

| Piece | What it does |
|---|---|
| `robots.txt` | Allows `/` for Googlebot, Bingbot and the AI retrieval and search bots: OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User, ClaudeBot, anthropic-ai, GPTBot, Google-Extended, Applebot-Extended, Amazonbot, Amzn-SearchBot. Disallows app, auth, admin and credential paths. Blocking an AI training-only crawler (such as Bytespider or CCBot) is a per-client decision. Declares the sitemap URL. Never block Googlebot or Bingbot. |
| Sitemap | Public URLs only, including the blog index and every live post. Submitted to Google Search Console and Bing Webmaster Tools. ChatGPT search reads from Bing, so Bing coverage matters. |
| IndexNow | A key file served at the site root plus a ping to Bing and Yandex on publish. Google ignores IndexNow. A non-2xx IndexNow response is logged and must not block the release. |
| RSS | `/blog/rss.xml`, declared as an alternate on every post. |
| Release job | On the publish day: revalidate `/blog`, the post and `/sitemap.xml`, then submit to IndexNow. The job authenticates with a secret header. Never print that secret. |
| Calculators or tool pages | Apply the same pattern (answer, table, FAQ schema, Person author, stat block) to the URLs the posts link to. |

## 6. Audit checklist

- [ ] Canonical host chosen and the other 301s to it.
- [ ] H1, answer paragraph, table and JSON-LD all present in the no-JS HTML.
- [ ] Title, description, canonical, Open Graph and Twitter set per page.
- [ ] Graph has Article, BreadcrumbList, FAQPage, Organization, WebSite (plus ImageObject with a hero), shared `@id`s, Person author.
- [ ] Byline name equals `author.name`.
- [ ] robots.txt allows Googlebot, Bingbot and the retrieval bots; sitemap declared.
- [ ] Sitemap lists every live post and nothing private; submitted to Google and Bing.
- [ ] IndexNow key file live; publish job pings it.
- [ ] RSS alternate on every post.
- [ ] No `sameAs` or `SearchAction` that points at something that does not exist.
