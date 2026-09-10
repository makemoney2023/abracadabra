# Advertising Skills (12)

Direct-response advertising skills from [realkimbarrett/advertising-skills](https://github.com/realkimbarrett/advertising-skills) by Kim Barrett (listed in [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills#advertising-skills-by-kim-barrett)).

**Source:** https://github.com/realkimbarrett/advertising-skills  
**License:** MIT (declared in each skill frontmatter)  
**Upstream narrative:** [README.upstream.md](./README.upstream.md) · chain rules: [AGENTS.md](./AGENTS.md)

Avatar → offer → Schwartz awareness → mechanism → angles → creative → funnel → objections → QA. Orchestrator coordinates end-to-end paid campaigns; performance diagnosis runs post-launch.

## Skills

### Foundations

| Skill | Purpose |
|-------|---------|
| `avatar-extraction` | Define who the buyer is, what they want, what they've tried, and decision drivers |
| `offer-extraction` | Turn a product/service into a compelling, high-converting offer |

### Copy Chief

| Skill | Purpose |
|-------|---------|
| `schwartz-awareness-mapper` | Audience awareness level and correct messaging approach |
| `mechanism-builder` | Unique mechanism — why this works when others failed |
| `headline-matrix` | High-performing headline variations across angles |
| `objection-crusher` | Identify and neutralize buyer objections |

### Operator OS

| Skill | Purpose |
|-------|---------|
| `ad-angle-multiplier` | Expand a core idea into distinct ad angles for testing |
| `scroll-stopping-creative` | Ad concepts that stop attention in the first 3 seconds |
| `conversion-path-builder` | Funnel from click to conversion / booked calls |
| `performance-diagnosis` | Diagnose underperforming campaigns (CPL, CVR, creative) |

### Orchestrators

| Skill | Purpose |
|-------|---------|
| `full-funnel-campaign-orchestrator` | Coordinate all skills for a complete ads + funnel campaign |

### QA

| Skill | Purpose |
|-------|---------|
| `generic-language-killer` | Remove vague, corporate, or AI-sounding language |

## Runbook integration

Wired in `business-idea-runbook.mdc`:

| Phase | Skills |
|-------|--------|
| **2** Market | `avatar-extraction` |
| **4** Model | `offer-extraction` |
| **13** Copy | `schwartz-awareness-mapper` → `mechanism-builder` → `headline-matrix` → `objection-crusher` → `generic-language-killer` |
| **18** CRO | `conversion-path-builder` |
| **19** Paid | `ad-angle-multiplier` → `scroll-stopping-creative` → `full-funnel-campaign-orchestrator` |
| **22** Operate | `performance-diagnosis` (when paid underperforms) |

Do not skip upstream skills in the chain (see `AGENTS.md`).

## Install into a project

```bash
# Full pack (keep category folders)
cp -r skills/community/advertising-skills/skills/* /path/to/project/.cursor/skills/

# Or copy individual skills
cp -r skills/community/advertising-skills/skills/foundations/avatar-extraction /path/to/project/.cursor/skills/
cp -r skills/community/advertising-skills/skills/orchestrators/full-funnel-campaign-orchestrator /path/to/project/.cursor/skills/
```

## Standard flow (from upstream)

1. `avatar-extraction`
2. `offer-extraction`
3. `schwartz-awareness-mapper`
4. `mechanism-builder`
5. `ad-angle-multiplier`
6. `scroll-stopping-creative`
7. `conversion-path-builder`
8. `objection-crusher`
9. `generic-language-killer`

For a full paid campaign, also run `full-funnel-campaign-orchestrator`. Post-launch, use `performance-diagnosis`.
