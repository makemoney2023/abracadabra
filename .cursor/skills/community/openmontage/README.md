# OpenMontage (agentic video production system)

Vendored from [calesthio/OpenMontage](https://github.com/calesthio/OpenMontage).

**License:** [AGPL-3.0](./LICENSE) — see upstream terms before commercial redistribution.  
**Upstream narrative:** [README.upstream.md](./README.upstream.md)  
**Agent contract:** [AGENT_GUIDE.md](./AGENT_GUIDE.md) · [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) · [CURSOR.md](./CURSOR.md)

Turn the coding agent into a full video studio: research → script → assets → edit → Remotion/HyperFrames compose → QA. **Rule Zero:** every video production request goes through a `pipeline_defs/` pipeline — no ad-hoc generation.

## Prerequisites

- Python 3.10+
- FFmpeg (`brew install ffmpeg`)
- Node.js 18+
- Optional API keys in `.env` (see `.env.example` if present, or upstream README)

From this pack directory:

```bash
cd skills/community/openmontage
make setup
# or: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && (cd remotion-composer && npm install)
```

## Pipelines (`pipeline_defs/`)

| Pipeline | Typical use |
|----------|-------------|
| `animated-explainer` | Product/education explainers |
| `animation` | Stylized animation |
| `avatar-spokesperson` | Avatar presenter |
| `character-animation` | Rigged character / SVG-GSAP |
| `cinematic` | Trailers, high-drama shorts |
| `clip-factory` | Short-form / social clips |
| `documentary-montage` | Real footage montage |
| `hybrid` | Mixed stills + motion |
| `localization-dub` | Dub / localize |
| `podcast-repurpose` | Podcast → video |
| `screen-demo` | Product screen demos |
| `talking-head` | Talking-head formats |

## How agents should run it

1. Read `AGENT_GUIDE.md` (and `skills/meta/onboarding.md` if the brief is vague).
2. Match the request to a pipeline in `pipeline_defs/<name>.yaml`.
3. Run tool-registry preflight (`tools/tool_registry.py`).
4. For each stage, read `skills/pipelines/<pipeline>/<stage>-director.md` before work.
5. Before calling a tool with `agent_skills[]`, read the Layer-3 skill under `.agents/skills/`.
6. Persist project outputs; for ClaudeSkills runbooks, also copy finals into `docs/business-idea/15-media/openmontage/`.

**Do not** skip pipelines and call providers/Remotion directly for full productions.

## Pairing with other ClaudeSkills packs

| Need | Pack |
|------|------|
| Image/video **prompt craft** only | `visual-skills/` |
| API render helpers | `inference-sh/` |
| Remotion skill docs (generic) | `remotion/` — OpenMontage also ships `remotion-composer/` for its own renders |
| Channel/video marketing strategy | `marketingskills/video/` |

## Runbook integration

Wired in `business-idea-runbook.mdc`:

| Where | Role |
|-------|------|
| Global principle | Any **video** generation → OpenMontage pipeline |
| Phase **15** | Primary video production path |
| Phase **19** | Paid video creatives when needed |

## Install note

This pack is meant to run **in place** (tools + composer need the repo root). Do not copy only a few `SKILL.md` files into `.cursor/skills/` — the registry and pipelines expect the full tree.
