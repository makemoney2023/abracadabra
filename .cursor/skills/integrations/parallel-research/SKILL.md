---
name: parallel-research
description: >-
  Use when running web search, extract, deep research, or data enrichment via Parallel Cursor plugin skills and parallel-cli.
---

# Parallel Research

Thin adapter for digital workers. See `skills/org/TOOL-REGISTRY.md`.

## Preferred access
Cursor Parallel plugin skills → `parallel-cli` (not MCP)

## Env / secrets
`PARALLEL_API_KEY` **or** OAuth via `parallel-cli login` (stored under `~/.config/parallel-web-tools/auth.json`)

Resolve via `skills/integrations/obsidian-secrets/` then `.env.local`. Verify with `parallel-cli auth`.

## Setup
If `parallel-cli` missing or unauthenticated: `/parallel-setup`, then `parallel-cli login`. If neither API key nor OAuth → `tool_status: unavailable` on handoff.

## Choose pack

| Task | Pack path | When |
|------|-----------|------|
| Lookup / current facts | `skills/plugins/parallel/parallel-web-search/` | Default for Phase 2 RQs and Phase 10 fact-check |
| Known URL / PDF / JS page | `skills/plugins/parallel/parallel-web-extract/` | Prefer over generic fetch; Firecrawl when site crawl/map needed |
| Exhaustive multi-source report | `skills/plugins/parallel/parallel-deep-research/` | Phase 2 evidence synthesis when packet/manager goal requires deep research; or operator says deep/exhaustive |
| Competitor/entity lists | `skills/plugins/parallel/parallel-data-enrichment/` | Bulk company/people fields → CSV |

## Primary ops
1. Load the pack that matches the task (table above)
2. Prefer Parallel for multi-source research; Firecrawl for site-specific crawl/map
3. Cost gate: prefer search/extract; deep-research only for Phase 2 synthesis or explicit deep asks
4. Cite sources; label confidence on handoffs; never invent URLs

## Fallback
firecrawl + context7-docs + browser

## Common failures
- `parallel-cli` not found → stop; tell operator to run `/parallel-setup` — do not answer from memory
- Deep research is expensive — use only when Phase 2 / packet / operator requires it
