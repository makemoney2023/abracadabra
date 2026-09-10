# Awesome Claude Corporate Skills

Production-ready corporate skills from [w95/awesome-claude-corporate-skills](https://github.com/w95/awesome-claude-corporate-skills) (MIT License).

**Source:** https://github.com/w95/awesome-claude-corporate-skills  
**Total:** 166 skills across 14 departments

## Departments

| Dept | Skills | Highlights |
|------|--------|------------|
| `00-meta` | 1 | `skill-creator` |
| `01-executive-leadership` | 12 | `strategic-planning`, `board-meeting-prep`, `ma-due-diligence`, `risk-assessment` |
| `02-finance-accounting` | 42 | `dcf-model`, `lbo-model`, `comps-analysis`, `pitch-deck`, `earnings-analysis` |
| `03-human-resources` | 9 | `job-description-writer`, `performance-review-assistant`, `onboarding-planner` |
| `04-marketing` | 15 | `seo-content-optimizer`, `campaign-planner`, `brand-guidelines`, `content-research-writer` |
| `05-sales` | 16 | `call-prep`, `compose-outreach`, `account-research`, `competitive-intelligence` |
| `06-legal-compliance` | 7 | `contract-review`, `nda-triage`, `compliance-tracking`, `legal-risk-assessment` |
| `07-operations` | 11 | `sop-builder`, `business-case-builder`, `incident-postmortem`, `kaizen` |
| `08-it-engineering` | 14 | `code-review`, `system-design`, `test-driven-development`, `mcp-builder` |
| `09-product-management` | 10 | `prd-writer`, `roadmap-builder`, `feature-spec`, `user-research-synthesizer` |
| `10-data-analytics` | 9 | `sql-queries`, `data-visualization`, `statistical-analysis`, `postgres` |
| `11-customer-success` | 10 | `qbr-builder`, `churn-analysis`, `ticket-triage`, `onboarding-playbook` |
| `12-procurement-supply-chain` | 6 | `rfp-builder`, `vendor-evaluation`, `supplier-scorecard` |
| `13-document-processing` | 4 | `docx`, `pdf`, `pptx`, `xlsx` |

## Usage

```bash
# Copy a single skill
cp -r skills/community/awesome-claude-corporate-skills/04-marketing/seo-content-optimizer /path/to/project/.cursor/skills/

# Copy a whole department
cp -r skills/community/awesome-claude-corporate-skills/04-marketing/* /path/to/project/.cursor/skills/

# Copy everything
find skills/community/awesome-claude-corporate-skills -mindepth 2 -maxdepth 2 -type d \
  ! -name '0*' -exec cp -R {} /path/to/project/.cursor/skills/ \;
# Or simpler — copy each dept folder's skills:
for dept in skills/community/awesome-claude-corporate-skills/*/; do
  cp -r "$dept"*/ /path/to/project/.cursor/skills/ 2>/dev/null
done
```

### Starter sets by role

```bash
# Marketing
cp -r skills/community/awesome-claude-corporate-skills/04-marketing/{seo-content-optimizer,campaign-planner,content-research-writer} /path/to/project/.cursor/skills/

# Product
cp -r skills/community/awesome-claude-corporate-skills/09-product-management/{prd-writer,roadmap-builder,feature-spec} /path/to/project/.cursor/skills/

# Engineering
cp -r skills/community/awesome-claude-corporate-skills/08-it-engineering/{code-review,system-design,test-driven-development} /path/to/project/.cursor/skills/

# Sales
cp -r skills/community/awesome-claude-corporate-skills/05-sales/{call-prep,compose-outreach,account-research} /path/to/project/.cursor/skills/
```

## Structure

Skills are organized by department prefix:

```
awesome-claude-corporate-skills/
├── 01-executive-leadership/
│   ├── strategic-planning/SKILL.md
│   └── ...
├── 04-marketing/
│   ├── seo-content-optimizer/SKILL.md
│   └── ...
└── ...
```

See [INDEX.md](./INDEX.md) for the full skill index from the upstream repo.

## License

MIT — see [LICENSE](./LICENSE).
