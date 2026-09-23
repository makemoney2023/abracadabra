# Skills & Rules Inventory — Schema Project

**Source library:** `/Users/cbsuperpatch/Desktop/ClaudeSkills`  
**Pulled into:** `.cursor/rules/` and `.cursor/skills/`  
**Date:** 2026-08-11

This document lists everything reviewed, what applies, what was copied, and what was deferred or skipped.

---

## Summary

| Category | Reviewed | Pulled into project | Deferred / skipped |
|---|---|---|---|
| Shared rules (`rules/shared`) | 15 | 13 (+ taskmaster set) | `business-idea-runbook` |
| UI/UX Pro Max pack | 7 skill dirs | 5 | `slides`, `banner-design` |
| Superpowers | 14 | 14 | — |
| Parallel | 5 | 5 | — |
| Stack integrations / plugins | many | see below | Firecrawl, Stripe, Google Ads/GA (v1) |
| SEO / GEO / schema domain | many | 9 | CMS/setup, content-writer (later) |
| Org positions / OCC | many | 0 | whole org orchestration layer |
| Marketing skills | many | 6 | ads, video, PR, etc. |

---

## A. Rules — MUST (copied)

From `ClaudeSkills/rules/shared/` → `.cursor/rules/`

| Rule | Why it applies |
|---|---|
| `startup-session.mdc` | Mandatory session ritual before code |
| `readme-first-session.mdc` | Doc loading checklist for startup |
| `baseline-verification.mdc` | Run tests/lint before first code edit |
| `engineering-workflow.mdc` | Task → TDD → wire → verify → docs |
| `testing-tdd.mdc` | TDD default for this product |
| `no-scaffold-code.mdc` | Scanner/ops must be end-to-end wired |
| `documentation-maintenance.mdc` | Keep INTENT/README/spec truthful |
| `post-plan-deep-review.mdc` | After multi-step plans, full audit |
| `cursor_rules.mdc` | How to maintain project rules |
| `self_improve.mdc` | Evolve rules as patterns emerge |
| `taskmaster/*.mdc` | Taskmaster workflow preference |

### Rules — written for this project

| Rule | Why |
|---|---|
| `project-context.mdc` | Filled Schema stack, layout, terminology |
| `aeo-geo-product.mdc` | Locked product constraints (Parallel-only, soft gate, dual surface) |

### Rules — skipped

| Rule | Why skipped |
|---|---|
| `business-idea-runbook.mdc` | Past ideation; design already approved |

---

## B. Skills — MUST (copied)

### Session / engineering (Superpowers)

| Skill | Path in project | Why |
|---|---|---|
| `using-superpowers` | `.cursor/skills/using-superpowers` | Skill invocation discipline |
| `brainstorming` | `.cursor/skills/brainstorming` | Design-before-build |
| `writing-plans` | `.cursor/skills/writing-plans` | Next step after design approval |
| `executing-plans` | `.cursor/skills/executing-plans` | Implement plans |
| `test-driven-development` | `.cursor/skills/test-driven-development` | Scoring/detectors/API |
| `verification-before-completion` | `.cursor/skills/verification-before-completion` | Evidence before “done” |
| `systematic-debugging` | `.cursor/skills/systematic-debugging` | Scan/job failures |
| `subagent-driven-development` | `.cursor/skills/subagent-driven-development` | Parallelizable workstreams |
| `dispatching-parallel-agents` | `.cursor/skills/dispatching-parallel-agents` | Multi-agent execution |
| `finishing-a-development-branch` | `.cursor/skills/finishing-a-development-branch` | Ship discipline |
| `requesting-code-review` / `receiving-code-review` | same | Review loops |
| `using-git-worktrees` | same | Isolated experiments |
| `writing-skills` | same | Extend project skills |

### Parallel (core fetch + prospecting)

| Skill | Why |
|---|---|
| `parallel-research` | Router for Parallel packs; **adapted for Schema: Parallel also owns site map/extract** |
| `parallel-web-search` | Domain-scoped URL map |
| `parallel-web-extract` | Page + robots/sitemap/llms.txt fetch |
| `parallel-data-enrichment` | Contact/company fields for ops |
| `parallel-deep-research` | Only when explicitly asked for deep/exhaustive |

### UI / UX

| Skill | Why |
|---|---|
| `ui-ux-pro-max` | Design intelligence CLI for public + ops UI |
| `design` | Product/visual design workflows |
| `design-system` | Tokens / system generation |
| `ui-styling` | Styling implementation guidance |
| `brand` | Brand-first public landing |
| `frontend-design` | Avoid generic AI UI aesthetics |
| `shadcn-ui` + `vercel-shadcn` | Component primitives (required) |
| `natural-human-voice` | Report + outreach copy tone |

### Stack

| Skill | Why |
|---|---|
| `supabase` + `supabase-plugin` + `supabase-postgres-best-practices` | DB, Auth, RLS, migrations |
| `vercel` + `vercel-nextjs` + `vercel-react-best-practices` | App platform + React patterns |
| `vercel-env-vars` / `vercel-deployments-cicd` / `vercel-verification` | Deploy/config |
| `github` | GitHub CLI workflows |
| `context7-docs` | Current library docs |
| `playwright-browser` | E2E smoke for soft-gate flow |
| `obsidian-secrets` | API key resolution |
| `pagespeed-insights` | Optional performance signal later / ops |

### Domain (AEO / GEO / schema)

| Skill | Why |
|---|---|
| `geo-optimizer` | GEO signal literacy for scoring + recommendations |
| `schema-markup-generator` | JSON-LD types we detect / recommend |
| `schema-org-gap-fixes` | Finding → downloadable JSON-LD / llms / robots / sitemap package (wired via `src/lib/fixes` + `/api/scans/[token]/fixes`) |
| `seo-analysis` | Broader technical SEO context |
| `marketing-schema` | Schema.org implementation guidance |
| `marketing-seo-audit` | Audit framing for reports |
| `marketing-cold-email` | Ops outreach blurbs |
| `marketing-product-marketing` | Positioning for free tool |
| `marketing-signup` | Soft-gate / email capture patterns |
| `marketing-copywriting` | Landing + report microcopy |

---

## C. Skills — SHOULD / DEFERRED (not copied yet)

| Skill (source) | Why deferred |
|---|---|
| `ui-ux-pro-max-skill/slides` | No slide decks in v1 |
| `ui-ux-pro-max-skill/banner-design` | Pull when running paid/social creatives |
| `notfair-seo/content-writer`, `content-planner`, `seo-page`, `meta-tags-optimizer`, `broken-link-checker`, `setup-cms`, `keyword-research` | Post-v1 content services upsell |
| `marketingskills/*` (ads, video, PR, referrals, …) | Not needed for scanner MVP |
| `integrations/firecrawl` + plugin | **Explicit v1 non-goal** for crawl/map/scrape |
| `integrations/stripe` | No billing in v1 |
| `integrations/google-*` (Ads, Analytics, GSC, Auth) | Post-launch measurement |
| `integrations/figma` + figma plugins | Optional design handoff later |
| `integrations/fal-media`, `elevenlabs`, `ai-toolkit-local` | Media/voice not in scope |
| Org positions (`web-designer`, `tech-lead`, `seo-manager`, …) | Full OCC org layer — overkill for this repo; use skills directly |
| `business-idea-runbook` | Ideation complete |

---

## D. Skills — SKIP (do not apply)

- OpenMontage / Remotion / video / 3D / CAD packs
- Advertising creative stacks unrelated to this product
- Inference.sh agent-browser templates (unless we later need heavy browser automation beyond Playwright)
- Graphify OCC rules from ClaudeSkills root `.cursor/rules/graphify.mdc`

---

## E. Project-specific adaptations

1. **Parallel owns site intelligence** — Unlike the ClaudeSkills default (“Firecrawl for crawl/map”), Schema v1 uses Parallel `search` (domain-scoped) + `extract`/`fetch` for mapping and page content. See `aeo-geo-product.mdc` and adapted `parallel-research` skill.
2. **Dual surface** — Public soft-gate + ops inbox share one scoring engine.
3. **shadcn required** — UI primitives come from shadcn; pair with ui-ux-pro-max for direction.

---

## F. How agents should load skills

Per `startup-session.mdc`:

1. Read `docs/INTENT.md` + design spec + `project-context.mdc`
2. Scan `.cursor/skills/` and load domain matches:
   - UI work → `ui-ux-pro-max`, `design`, `frontend-design`, `shadcn-ui`
   - Scoring / schema → `geo-optimizer`, `schema-markup-generator`, `marketing-schema`
   - Fetch / leads → `parallel-research` + extract/search/enrich packs
   - DB → `supabase` + postgres best practices
   - Implementation → `test-driven-development`, `writing-plans` / `executing-plans`

---

## G. Refresh policy

When ClaudeSkills updates a skill/rule we depend on, re-rsync that path into `.cursor/` and note the date in this file. Prefer copying over symlinks so Schema stays portable.
