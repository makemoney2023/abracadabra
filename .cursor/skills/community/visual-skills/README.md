# Visual Skills (2)

AI image and video **prompting** skills from [smixs/visual-skills](https://github.com/smixs/visual-skills) (MIT).

**Source:** https://github.com/smixs/visual-skills  
**License:** MIT  
**Upstream narrative:** [README.upstream.md](./README.upstream.md)

These skills write production-grade prompts (model choice + syntax). They do **not** call image/video APIs. To render, pair with `inference-sh` generators (`nano-banana-2`, `gpt-image`, `ai-image-generation`, Seedance/Veo/Kling skills, etc.).

| Skill | Purpose | Models |
|-------|---------|--------|
| `image` | Image prompts — product, ads, UI, storyboards, edits | Nano Banana (NB2/NBP), GPT Image 2 |
| `video` | Video prompts — shot lists, multi-shot, dialogue | Seedance, Kling, Veo |

## Runbook integration

Whenever the runbook needs generated visuals:

1. Run `visual-skills/image` (or `visual-skills/video`) → ready-to-use prompt + model/size header  
2. Run the matching `inference-sh` skill to render  
3. Store assets under the phase artifact folder (e.g. `14-pages/`, `15-media/`, `19-paid/`)

Wired in `business-idea-runbook.mdc`:

| Phase | Skill |
|-------|-------|
| **Global** | Any image/video generation request |
| **11** Brand | `image` for brand/visual system assets |
| **14** Pages | `image` for page/hero/product imagery (+ `banner-design`) |
| **15** Video | `video` for prompt craft; full productions use **OpenMontage** |
| **19** Paid | `image` for ad creative prompts; video ads via OpenMontage |

## Install into a project

```bash
cp -r skills/community/visual-skills/image /path/to/project/.cursor/skills/
cp -r skills/community/visual-skills/video /path/to/project/.cursor/skills/
```

Keep each skill's `references/` folder — `SKILL.md` alone is insufficient.
