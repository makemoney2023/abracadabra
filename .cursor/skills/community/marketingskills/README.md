# Marketing Skills

Marketing agent skills from [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) (MIT License).

**Source:** https://github.com/coreyhaines31/marketingskills  
**Author:** [Corey Haines](https://corey.co)  
**Spec:** [Agent Skills](https://agentskills.io) — works with Cursor, Claude Code, Codex, Windsurf

## Skills (47)

### Foundation

| Skill | Purpose |
|-------|---------|
| `product-marketing` | **Read first** — product, audience, positioning context for all other skills |

### SEO & Content

| Skill | Purpose |
|-------|---------|
| `seo-audit` | SEO audits and recommendations |
| `ai-seo` | AI search / GEO optimization |
| `programmatic-seo` | Programmatic SEO playbooks |
| `schema` | Structured data / schema markup |
| `site-architecture` | Site structure and IA |
| `content-strategy` | Content planning |
| `copywriting` | Marketing copy for pages |
| `copy-editing` | Edit and improve existing copy |
| `directory-submissions` | Directory listing submissions |

### CRO & Conversion

| Skill | Purpose |
|-------|---------|
| `cro` | Conversion rate optimization |
| `signup` | Signup flow optimization |
| `onboarding` | User onboarding |
| `paywalls` | Paywall design |
| `popups` | Popup strategy and copy |
| `ab-testing` | A/B test design |
| `offers` | Offer design (bonuses, guarantees, value framing) |

### Paid & Ads

| Skill | Purpose |
|-------|---------|
| `ads` | Paid ads (Google, Meta, LinkedIn, ABM) |
| `ad-creative` | Ad creative development |

### Growth & Retention

| Skill | Purpose |
|-------|---------|
| `launch` | Product launch playbooks |
| `referrals` | Referral programs |
| `lead-magnets` | Lead magnet creation |
| `free-tools` | Free tool marketing |
| `churn-prevention` | Churn reduction |
| `community-marketing` | Community-led growth |
| `marketing-loops` | Growth loops |
| `marketing-ideas` | Marketing idea generation |

### Sales & Outbound

| Skill | Purpose |
|-------|---------|
| `cold-email` | Cold email outreach |
| `prospecting` | Prospecting workflows |
| `sales-enablement` | Sales enablement content |
| `revops` | Revenue operations |

### Strategy & Research

| Skill | Purpose |
|-------|---------|
| `marketing-plan` | Marketing plan creation |
| `marketing-psychology` | Psychology frameworks |
| `marketing-council` | Multi-perspective marketing review |
| `customer-research` | Customer research |
| `competitors` | Competitive analysis |
| `competitor-profiling` | Deep competitor profiles |
| `pricing` | Pricing strategy |
| `analytics` | Marketing analytics |

### Channels

| Skill | Purpose |
|-------|---------|
| `emails` | Email marketing |
| `sms` | SMS marketing |
| `social` | Social media |
| `video` | Video marketing |
| `image` | Image / visual assets |
| `public-relations` | PR and media |
| `co-marketing` | Co-marketing partnerships |
| `aso` | App store optimization |

## How skills work together

`product-marketing` is the foundation — other skills check for `.agents/product-marketing.md` (or `.claude/product-marketing.md`) in your project before asking questions.

```
product-marketing (foundation)
  ├── SEO: seo-audit, ai-seo, programmatic-seo, schema, site-architecture
  ├── CRO: cro, signup, onboarding, paywalls, popups, ab-testing
  ├── Content: copywriting, copy-editing, content-strategy
  ├── Paid: ads, ad-creative
  └── Growth: launch, referrals, lead-magnets, marketing-loops
```

## Usage

```bash
# Copy all marketing skills
cp -r skills/community/marketingskills/* /path/to/project/.cursor/skills/

# Or copy a subset
cp -r skills/community/marketingskills/{product-marketing,copywriting,cro,seo-audit} /path/to/project/.cursor/skills/
```

### Product marketing context (recommended)

Create `.agents/product-marketing.md` in your project root (or use the `product-marketing` skill to generate it). Other skills read this file for product/audience/positioning context.

## License

MIT — see [LICENSE](./LICENSE).
