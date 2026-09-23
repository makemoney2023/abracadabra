# AI-Readiness Proposal Structure & Pricing (Internal)

Sell an **AI-Readiness Infrastructure** upgrade — not hourly webmaster work. Value-based, three tiers. Keep proposals under five pages; read like a diagnostic, not a brochure.

**Public site does not list these prices.** Use after a Schema scan + conversation.

## Proposal outline

### 1. Executive summary (diagnostic)

You tested their site with Schema. It lacks (or weakly implements) the machine-readable translation layer LLMs and search need.

- **Cost of inaction:** AI guesses context or defaults to structured competitors.
- **Goal:** Turn the site into an AI-ready entity with high data confidence.

Attach: score, top gaps, link to `/scan/{token}`.

### 2. Current state vs future state

- **Current:** Screenshot / Schema pillars showing weak structured data / missing discovery files.
- **Future:** Example of clean nested JSON-LD + discovery files — native language of AI retrieval.

### 3. Scope of work

Emphasize: zero redesign, no human-UX impact.

1. **Audit & mapping** — entities (services, products, leadership, locations)
2. **Code generation** — precise JSON-LD (+ llms.txt / robots / sitemap fixes as needed)
3. **Injection & testing** — header/CMS deploy; validate with Rich Results / schema tools + Schema rescan

### 4. Investment (always offer three options)

| Tier | Target | Scope | Est. price |
|------|--------|-------|------------|
| **Foundation** | Local businesses, single-location clinics, small agencies | Static JSON-LD for Organization, LocalBusiness, FAQPage (+ Review where relevant) | **$900–$1,500** one-time |
| **Dynamic Scale** | E-comm, publishers, multi-location | Tier 1 + programmatic schema at framework/CMS level (Product, Article, Service, etc.) | **$2,500–$4,500** one-time |
| **Knowledge Graph** | Enterprise, SaaS, complex platforms | Tier 2 + custom entity mapping / real-time generation; SoftwareApplication, taxonomies; monthly drift monitoring | **$6,000+** setup + **$400/mo** retainer |

Three options shift the question from “Should I buy?” to “Which one?”

### 5. Next steps

1. Approve the proposal  
2. Grant CMS / header access (or intro to their dev)  
3. ~7-day sprint to deployment  
4. Rescan in Schema to show before/after  

## Closing tips

- **Entity story:** They’re a bag of pages today; structured data makes them a known entity with attributes.
- **Retainer rationale:** Schema drifts when content changes (e.g. price update without JSON-LD update). Monthly validation catches that.
- Pair with [ai-blind-spot-playbook.md](./ai-blind-spot-playbook.md) objections and [nurture-7-day.md](./nurture-7-day.md) if they go quiet.
