# AI Blind Spot — Sales Playbook

Internal ops guide. Source strategy: Gemini GTM pack (2026-08-11). Product proof: Schema scan reports.

**Positioning:** Do not sell “schema markup.” Sell **AI visibility** / an **AI-readiness upgrade**.

## Core angle

AI engines don’t read sites like humans. They prefer a machine-readable **translation layer**. Without it they guess — and cite competitors who structured their facts.

**Best medium:** 2-minute Loom *or* a live walkthrough of their personalized Schema report (`/scan/[token]`).

## Pre-call prep (ops)

1. Prospect via FindAll → enrich → auto-scan (or rescan).
2. Open the scan in ops; note score, top gaps, pages missing JSON-LD.
3. Copy public report URL: `{APP_URL}/scan/{token}` (preview works without unlock; encourage them to unlock).
4. Optional: record Loom pointing at their Schema score + competitor contrast.

Use `buildOutreachBlurb` in the LeadSheet for a short pasteable opener.

## Loom / live demo script (~2 min)

**Subject:** Why AI engines are ignoring [Company Name] (and how to fix it fast)

### Hook (0:00–0:30)

> Hi [Name], I’m researching [Industry/Niche] in [City], and I ran a test to see which businesses ChatGPT, Gemini, and Perplexity recommend right now.
>
> [Company Name] isn’t showing as a top recommendation, but [Competitor] is. I dug into your site and found a critical missing piece — it isn’t your content or reviews. It’s how AI *reads* your site.

### Proof (0:30–1:15)

Share screen: Schema score for their domain (and optionally competitor).

> Humans can read your site perfectly. AI looks for a hidden translation layer — structured data and related signals. Schema scored you at [score]/100. Because that layer is thin or missing, AI has to guess your services, authors, and location. AI hates guessing. [Competitor] makes those facts easy to trust, so they get cited instead.

### Solution (1:15–1:45)

> You don’t need a redesign. We map your site, write the JSON-LD / discovery fixes AI prefers, and inject them so engines digest your facts instantly. You can also download a fix package from the report if your team wants to ship it.

### CTA (1:45–2:00)

> It’s a one-time AI-readiness upgrade — usually days, not months. Reply if you want 10 minutes to walk through the exact tags you’re missing.

## Objection handling

| Objection | Response |
|-----------|----------|
| We already pay an SEO agency | Most still optimize for 2020 (keywords/backlinks). I specialize in AI retrieval. Your Schema report shows the gap — if structured data is blank, you’re flying blind for AI. |
| Will this break my site? | No. The layer is invisible to visitors. No pixel changes, no slowdown. |
| Guarantee ChatGPT recommends us? | No one can guarantee AI output. Think business card vs 10-page brochure — you remove friction that blocks citations. |

## Closing tips

- Sell the **entity** concept: pages → recognized brand entity in the AI knowledge graph.
- Lead with their **scan link**, not abstract jargon.
- After interest, send [proposal-tiers.md](./proposal-tiers.md) structure (keep under five pages).
- Nurture non-repliers with [nurture-7-day.md](./nurture-7-day.md).
