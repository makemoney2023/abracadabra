# Business Analysis Skills

Business analysis skill pack from [45ck/business-analysis-skills](https://github.com/45ck/business-analysis-skills) (MIT License).

**Source:** https://github.com/45ck/business-analysis-skills  
**Skills:** 53 — atomic techniques, requirements, elicitation, workflows, quality checks

## Usage pattern

1. **Workflow skills** — broad problem spaces (start here)
2. **Atomic skills** — specific BA techniques
3. **Quality skills** — review deliverables before handoff

Create `.agents/product-marketing.md` or project context docs as needed; skills gather inputs via their Procedure sections.

## Workflows (7)

| Skill | Purpose |
|-------|---------|
| `business-problem-framing` | Frame problems before solutioning |
| `strategy-analysis` | Strategic analysis |
| `stakeholder-analysis` | Stakeholder mapping and engagement |
| `requirements-elicitation` | End-to-end requirements discovery |
| `process-modelling-and-improvement` | As-is / to-be process work |
| `ssm-analysis` | Soft Systems Methodology |
| `requirements-packager` | Package discovery into delivery-ready requirements |

## Atomic techniques (17)

| Skill | Purpose |
|-------|---------|
| `pestle-analysis` | PESTLE macro-environment analysis |
| `swot-prioritisation` | SWOT with prioritization |
| `porters-five-forces` | Porter's Five Forces |
| `value-proposition-analysis` | Value proposition canvas |
| `stakeholder-register` | Stakeholder register |
| `power-interest-grid` | Power/interest grid |
| `raci-matrix` | RACI responsibility matrix |
| `interview-design` | Interview planning |
| `questionnaire-design` | Questionnaire design |
| `workshop-design` | Workshop facilitation design |
| `observation-study-plan` | Observation study planning |
| `prototype-elicitation` | Prototype-based elicitation |
| `use-case-specification` | Use case specs |
| `process-model-spec` | Process model specification |
| `moscow-prioritisation` | MoSCoW prioritization |
| `see-i-clarifier` | SEE-I clarification technique |
| `catwoe-root-definition` | CATWOE root definition |

## Requirements & specification (14)

| Skill | Purpose |
|-------|---------|
| `acceptance-criteria-writer` | Write acceptance criteria |
| `ambiguity-hunter` | Find ambiguous requirements |
| `assumption-extractor` | Extract assumptions |
| `constraint-detector` | Detect constraints |
| `definition-of-done-drafter` | Draft definition of done |
| `edge-case-elicitor` | Elicit edge cases |
| `functional-vs-nonfunctional-splitter` | Split FR vs NFR |
| `problem-statement-refiner` | Refine problem statements |
| `proto-requirements-normalizer` | Normalize raw requirements |
| `requirements-conflict-checker` | Detect requirement conflicts |
| `requirements-gap-auditor` | Audit requirements gaps |
| `requirements-interrogator` | Interrogate requirements depth |
| `requirements-prioritizer` | Prioritize requirements |
| `requirements-traceability-starter` | Start traceability matrix |

## Elicitation & process (10)

| Skill | Purpose |
|-------|---------|
| `raci-rasci-builder` | RACI/RASCI matrices |
| `stakeholder-communication-planner` | Stakeholder comms planning |
| `probe-question-generator` | Generate probe questions |
| `pyramid-funnel-diamond-interviewer` | Interview structure patterns |
| `questionnaire-pilot-checker` | Pilot questionnaire review |
| `breakout-structure-designer` | Workshop breakout design |
| `as-is-process-investigator` | Investigate current processes |
| `to-be-process-designer` | Design future processes |
| `business-rule-extractor` | Extract business rules |
| `benefit-hypothesis-writer` | Write benefit hypotheses |

## Quality checks (5)

| Skill | Purpose |
|-------|---------|
| `critical-thinking-bias-check` | Bias and critical thinking review |
| `assumptions-constraints-log` | Assumptions/constraints log |
| `evidence-gap-review` | Evidence gap analysis |
| `deliverable-consistency-check` | Cross-deliverable consistency |
| `requirements-quality-check` | Requirements quality review |

## Templates

Reusable BA templates in `templates/`:

- Requirements register, traceability matrix, RACI matrix
- Acceptance criteria, definition of done, problem statement
- Process analysis, questionnaire, assumptions/constraints
- Benefit hypothesis

## Install

```bash
# All skills
cp -r skills/community/business-analysis-skills/skills/* /path/to/project/.cursor/skills/

# Templates (optional)
cp -r skills/community/business-analysis-skills/templates /path/to/project/docs/ba/

# Starter workflow set
cp -r skills/community/business-analysis-skills/skills/{business-problem-framing,stakeholder-analysis,requirements-elicitation,requirements-packager,requirements-quality-check} /path/to/project/.cursor/skills/
```

## Example invocations

```
/business-problem-framing claims triage process
/stakeholder-analysis payroll replacement program
/requirements-elicitation onboarding workflow
/swot-prioritisation launch of a student support portal
/acceptance-criteria-writer password reset requirements
/evidence-gap-review proposed CRM migration
```

## License

MIT — see [LICENSE](./LICENSE).
