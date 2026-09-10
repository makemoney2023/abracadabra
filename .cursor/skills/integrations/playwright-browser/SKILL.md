---
name: playwright-browser
description: >-
  Use when automating or inspecting web pages via Playwright or Cursor browser MCP for QA, competitive checks, or SEO verification.
---

# Playwright / Browser

Thin adapter for digital workers. See `skills/org/TOOL-REGISTRY.md`.

## Preferred access
Playwright MCP (`user-playwright`) for eng QA; `cursor-ide-browser` when a Cursor-owned tab is required

## Env / secrets
—

Resolve via `skills/integrations/obsidian-secrets/` then `.env.local`.

## MCP
`user-playwright`, `cursor-ide-browser`

## Primary ops
1. Snapshot (or accessibility tree) before click; unlock / close when done
2. Use for live page checks and MVP smoke — not bulk crawl (prefer firecrawl)
3. Record URLs checked + date on handoff / build log
4. Stop after repeated blockers (login/captcha); escalate to human — do not bypass captchas
5. If MCP unavailable → `tool_status: unavailable`; fall back to firecrawl scrape of public HTML or local doctor/shell

## Fallback
firecrawl scrape of public HTML; local doctor/shell for claimed production paths

## Common failures
Login walls → escalate to human; do not bypass captchas
