# Executive Summary — Schema (AEO / GEO Readiness)

Schema is a **free AI-visibility (AEO/GEO readiness) scanner** for businesses and an **internal outbound engine** for our team. Public copy leads with the **AI Blind Spot** — whether answer engines can confidently read the site — not “schema markup.”

**Public:** Paste a URL → get an AI visibility score immediately → email unlocks which pages lack JSON-LD / schema.org, whether `llms.txt` exists, robots/AI-bot status, and a PDF.

**Ops:** Use Parallel FindAll + enrich to discover companies and contacts, auto-scan their sites, and work an in-app queue (`new` → `contacted` → `won` / `skipped`) sorted by opportunity.

**Technical stance:** Next.js + Supabase + Inngest; **Parallel only** for map/extract/prospecting (no Firecrawl in v1); deterministic scoring over ~40 pages + site files; soft email gate; no CRM sync in v1.

Full intent, success criteria, and links: **[INTENT.md](./INTENT.md)**  
Design: **[superpowers/specs/2026-08-11-aeo-geo-readiness-scanner-design.md](./superpowers/specs/2026-08-11-aeo-geo-readiness-scanner-design.md)**  
Marketing / brand: **[brand-guidelines.md](./brand-guidelines.md)** · **[.agents/product-marketing.md](../.agents/product-marketing.md)** · **[sales/](./sales/)**  
Agent skills/rules pulled into the repo: **[SKILLS-AND-RULES-INVENTORY.md](./SKILLS-AND-RULES-INVENTORY.md)**
