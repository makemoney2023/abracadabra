# scroll-world (vendored)

Source: [oso95/scroll-world](https://github.com/oso95/scroll-world), `skills/scroll-world/`
Commit: `71cc36d3bb150248ae36a2c552f9cbf88802a79c` (v0.8.0), MIT (see `LICENSE`).

Copied verbatim: `SKILL.md`, `references/{pipeline.md,prompts.md,scrub-engine.js,index-template.html,knockout.py}`.

## How this repo uses it

The skill's generation steps (Higgsfield / Monid diorama renders) are optional here. Abracadabra uses
the parts that work on real product footage:

- `references/scrub-engine.js` mounted over Playwright captures (architecture A, forward take, null
  connectors so neighbouring legs crossfade instead of flying over).
- The Step 6 encode settings (`-crf 20 -g 8 +faststart`, 720p `-g 4` mobile variants).
- The Step 8 QA gate (seam screenshots, `seekable.end(0) > 0`, reduced motion, phone viewport).

Live use: `scrollcraft/builds/abracadabra-ai/walkthrough.html`.
