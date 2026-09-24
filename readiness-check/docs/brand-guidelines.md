# Schema Brand Guidelines v1.0

> Last updated: 2026-08-11  
> Status: Active  
> Marketing context: [.agents/product-marketing.md](../.agents/product-marketing.md)

## Quick Reference

| Element | Value |
|---------|-------|
| Brand name | Schema |
| Positioning | AI visibility / AI-readiness scanner |
| Primary accent | Teal (cool slate system) |
| Heading font | Newsreader |
| Body font | IBM Plex Sans |
| Mono | IBM Plex Mono |
| Voice | Diagnostic, direct, benefit-first |

---

## 1. Mission, vision, positioning

**Mission:** We help businesses see — and close — the gap between how humans read their site and how AI engines do.

**Vision:** A world where every local and mid-market business is a recognized entity in AI answer engines, not an invisible collection of pages.

**Value proposition:**  
For businesses who still optimize for blue links, Schema is the free AI-visibility check that shows whether ChatGPT, Perplexity, and Gemini can confidently read their site. Unlike generic SEO checkers, we measure the translation layer AI actually uses — and queue implementation when they want it fixed.

**Positioning statement:**  
Schema is the AI-readiness scanner for business owners who want to know if answer engines can cite them — because we turn an invisible code gap into a clear score, page matrix, and fix path.

### Primary message

See whether AI engines can confidently read your site.

### Supporting messages

| Message | Audience need | Proof |
|---------|---------------|-------|
| You’re optimizing for blue links while AI looks for machine-readable context | Awareness | Landing problem section |
| Without a translation layer, AI guesses — and prefers competitors | Urgency | Brochure vs business card analogy |
| Free score in minutes; no account required | Low friction | Public scanner |
| Invisible upgrade — no redesign, no pixel change | Objection | FAQ + sales playbook |

### Elevator pitches

**10-second:** Schema shows whether AI engines can actually read your website.

**30-second:** Most sites still chase Google blue links. Answer engines need a hidden translation layer of structured data. Schema scores that layer for free and shows which pages are holding you back.

**60-second:** Paste your URL. In minutes you get an AI-visibility score across structured data, discovery files, crawlability, and page coverage. Unlock the page matrix and PDF with email. Download fix packages — or ask us to implement the AI-readiness upgrade so ChatGPT and peers stop guessing about your business.

---

## 2. Voice framework

| Do | Don’t |
|----|-------|
| Sell AI visibility | Lead with “schema markup” or JSON-LD |
| Use “AI blind spot,” “translation layer” | Promise ChatGPT will recommend them |
| Be specific and diagnostic | Use hype / exclamation / purple AI clichés |
| Analogies (business card vs brochure) | Feature laundry lists in the hero |
| Calm urgency (shift is happening) | Fearmongering without a next step |

**Tone:** Professional consultant with proof. Short sentences. Customer language first; technical terms as supporting detail.

**Public vs internal:** Public prefers “AI readiness / AI visibility.” Ops and docs may use AEO / GEO and JSON-LD freely.

---

## 3. Visual identity (source of truth in code)

Do **not** replace with purple gradients, Space Grotesk, or cream/terracotta AI defaults.

| Token | Implementation |
|-------|----------------|
| Background / foreground | Cool slate in `src/app/globals.css` |
| Accent | Teal (`oklch` primary system already in CSS) |
| Heading | Newsreader (`--font-heading`) |
| Body | IBM Plex Sans |
| Code / labels | IBM Plex Mono |
| Atmosphere | Soft radial washes + light grid; editorial, not glassmorphic dark cinema |

The Schema scanner (`/`, `/scan`) and ops stay on this system. The Readiness Check (`/check`, guides, and the assessment PDF) uses the Abracadabra marketing studio: canvas `#070706`, surface `#11110F`, ink `#F5F0E8`, accent `#FF4B24`, Tektur headings, IBM Plex Sans body. Tokens live in `src/lib/brand/studio.ts` and `.check-studio` in `globals.css`. Primary button labels use canvas ink on the accent fill so the check’s contrast gate passes; the marketing site’s cream accent-ink stays a named token only.

### Logo / wordmark

Wordmark **Schema** in heading font is the brand signal. On public surfaces it must read as hero-level identity (not only nav chrome).

### Motion

- Staggered fade / slide on hero load
- Subtle section entrance
- Respect `prefers-reduced-motion`
- Duration ~150–700ms; no decorative noise

---

## 4. Message by surface

| Surface | Key message | Primary CTA |
|---------|-------------|-------------|
| Landing `/` | AI blind spot → free visibility check | Check your AI visibility |
| Soft gate | Score free; pages AI can’t read need email | Unlock report |
| Opt-in | Close the blind spot with implementation help | Request follow-up |
| Ops outreach | Personalized scan proof + competitor angle | Reply / book 10 minutes |

---

## 5. Consistency checklist

- [ ] Brand name “Schema” is the hero signal on first viewport
- [ ] CTA uses AI visibility language (not AEO/GEO jargon)
- [ ] No purple-on-white or cream/terracotta default aesthetics
- [ ] Objections addressed before hard sell
- [ ] Pricing dollar amounts stay internal (`docs/sales/`) unless a public pricing page is explicitly requested
