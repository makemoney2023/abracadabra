---
name: pagespeed-insights
description: >-
  Use when measuring Core Web Vitals, Lighthouse, or PageSpeed Insights scores for a URL during SEO or web performance work.
---

# PageSpeed Insights

Thin adapter for digital workers. See `skills/org/TOOL-REGISTRY.md`.

## Preferred access
PageSpeed Insights API v5 (`pagespeedonline.googleapis.com`) or Lighthouse CLI

## Env / secrets
`GOOGLE_API_KEY` (optional; higher quota). Without key, anonymous PSI may rate-limit.

Resolve via `skills/integrations/obsidian-secrets/` then `.env.local`.

## MCP
— (no dedicated MCP in default stack)

## Primary ops
1. Run PSI for mobile and desktop on key templates (home, pricing, blog post)
2. Record LCP, INP, CLS + performance score
3. Pair with `seo-manager` / `web-designer` craft packs for fixes

## Fallback
Chrome DevTools Lighthouse or `npx lighthouse <url> --quiet --chrome-flags='--headless'`

## Common failures
429 → slow down / add API key; lab ≠ field — note CrUX when available
