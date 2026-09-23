# Schema — Intent & Executive Summary

**Product working name:** Schema (AEO / GEO Readiness)  
**Date:** 2026-08-11  
**Status:** v1 implementation complete (public soft-gate + ops inbox/prospecting) — see plan `docs/superpowers/plans/2026-08-11-aeo-geo-readiness-scanner.md`

## Intent

Give businesses a **free, credible way to see how ready their website is for AI answer engines and generative search** — and give our team an **outbound machine** that finds companies, scores their sites, and queues the weak ones for contact.

Schema is not another generic SEO checker. It measures the signals that matter for **AEO** (Answer Engine Optimization) and **GEO** (Generative Engine Optimization): structured data, AI discovery files, crawl permissions, and page-level coverage.

## The problem

AI systems increasingly answer questions instead of sending clicks. Sites without schema.org JSON-LD, without clear machine-readable structure, and without AI-friendly discovery files are invisible or misrepresented in those answers. Most businesses do not know they have a gap until a competitor shows up in ChatGPT, Perplexity, or AI Overviews instead of them.

Operators who sell AEO/GEO services need more than a PDF audit template: they need **automatic discovery, scoring, and a contact queue**.

## What we are building

A standalone dual-surface product:

| Surface | Who | What |
|---|---|---|
| **Public scanner** | Any business | Enter a URL → get a readiness score immediately → email unlocks page-level detail + PDF |
| **Ops inbox** | Internal staff | Parallel FindAll + enrich → auto-scan → queue (`new` / `contacted` / `won` / `skipped`) |

Both surfaces share one scan and scoring engine.

## Locked product decisions

- **Parallel** for map / extract / scrape / prospecting (`search`, `extract`/`fetch`, `findall`, `enrich`) — no Firecrawl in v1. Direct HTML GET is used only as a schema fallback because Parallel returns markdown and strips `application/ld+json` script blocks.
- Soft gate: overall score free; email for page matrix + PDF
- Standard depth: site files + up to ~40 priority pages
- In-app ops inbox only (no CRM sync in v1)
- Next.js monolith + Supabase + Inngest jobs
- Deterministic scoring (no LLM score subjectivity in v1)

## Value proposition

**Public positioning (AI Blind Spot):** Sell AI visibility — not “schema markup.” Free check for whether answer engines can confidently read the site; soft gate for page detail; optional implementation upsell.

**For businesses:** “In minutes, see if AI systems can understand your site — and which pages are holding you back.”

**For our team:** “Find companies missing schema / llms.txt, score them, and work a prioritized contact queue with evidence.”

**Marketing / sales source of truth:** [.agents/product-marketing.md](../.agents/product-marketing.md), [docs/brand-guidelines.md](./brand-guidelines.md), [docs/sales/](./sales/)

## Success looks like

1. A stranger can paste a URL and get a trustworthy score without creating an account.
2. After email unlock, they see exactly which pages have / lack JSON-LD, plus `llms.txt` / robots / sitemap status.
3. Ops can run an ICP FindAll, enrich contacts, and open an inbox sorted by opportunity (low score + has contact).
4. Every finding is explainable from fetched evidence — not a black-box “AI said so.”

## Non-goals (v1)

CRM sync · Firecrawl · 100-page deep crawls · multi-tenant white-label · public user accounts · LLM-based scoring

## North-star metrics (later)

- Public scans completed / week
- Unlock rate (email / completed scans)
- Ops queue → contacted → won conversion
- Parallel cost per scan (keep free tier sustainable)

## Source of truth

- Design spec: [docs/superpowers/specs/2026-08-11-aeo-geo-readiness-scanner-design.md](./superpowers/specs/2026-08-11-aeo-geo-readiness-scanner-design.md)
- Skills/rules inventory: [docs/SKILLS-AND-RULES-INVENTORY.md](./SKILLS-AND-RULES-INVENTORY.md)
- Agent orientation: [.cursor/rules/project-context.mdc](../.cursor/rules/project-context.mdc)
