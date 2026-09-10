# NotFair SEO Skills

Open-source SEO agent skills from [nowork-studio/NotFair](https://github.com/nowork-studio/NotFair) (MIT License).

**Source:** https://github.com/nowork-studio/NotFair/tree/main/seo  
**Publisher:** [NotFair](https://notfair.co) — Google Search Console, Ads, and SEO tooling for AI agents

## Skills (10)

| Skill | Purpose |
|-------|---------|
| `broken-link-checker` | Find and report broken links |
| `content-planner` | SEO content planning methodology |
| `content-writer` | SEO-optimized content writing |
| `geo-optimizer` | Generative engine optimization |
| `keyword-research` | Keyword research and prioritization |
| `meta-tags-optimizer` | Title tags, meta descriptions, social tags |
| `schema-markup-generator` | JSON-LD structured data for rich results |
| `seo-analysis` | GSC analysis, PageSpeed, CMS integrations |
| `seo-page` | Full-page SEO optimization |
| `setup-cms` | CMS setup for SEO workflows |

## Shared resources

The `shared/` folder contains preamble and best-practices docs referenced by multiple skills:

- `preamble.md` — GSC auth, script discovery (used by analysis skills)
- `seo-best-practices.md` — Cross-skill SEO guidelines
- `business-context.md` — Business context template

## Usage

Copy individual skills into a project:

```bash
cp -r skills/community/notfair-seo/schema-markup-generator /path/to/project/.cursor/skills/
```

For skills that use GSC scripts (`seo-analysis`, etc.), also ensure `seo-analysis/scripts/` is available — skills reference scripts via the shared preamble discovery path.

## License

MIT — see [LICENSE](./LICENSE). Copyright (c) 2026 Toprank Contributors.
