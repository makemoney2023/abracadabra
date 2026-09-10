# Academic Research Skills (4)

**Source:** [imbad0202/academic-research-skills](https://github.com/imbad0202/academic-research-skills) · License: CC BY-NC-SA 4.0 (see LICENSE — non-commercial share-alike)

Multi-agent academic research pipelines. The `shared/` directory contains protocols, schemas, and references the four skills depend on — keep it as a sibling when copying skills out.

| Skill | Purpose |
|-------|---------|
| `deep-research` | 13-agent research team, 8 modes: full research, quick brief, paper review, lit-review, fact-check, 3W literature scan, Socratic dialogue, systematic review + meta-analysis |
| `academic-paper` | Write academic papers — intake, style profiling, drafting, citation management |
| `academic-paper-reviewer` | Structured peer review of academic papers |
| `academic-pipeline` | End-to-end research-to-publication pipeline orchestration |

`ROUTING.md` (copied from the repo's `.claude/CLAUDE.md`) covers cross-skill routing discipline.

## Runbook integration

`deep-research` runs at the start of **Phase 2** in `business-idea-runbook.mdc` to produce `02-evidence-base.md` — the source-verified evidence report all later phases cite. Its fact-check mode re-runs in **Phase 10** to verify load-bearing strategy claims.

## Install into a project

```bash
cp -r deep-research shared /path/to/project/.cursor/skills/
```
