# Abracadabra AI catalog

One-page Scrollcraft gallery of shipped work. Brief is in `BRIEF.md`. Footage and sales packs live in `/outputs`.

```bash
# from this folder
npx --yes serve -l 4500
```

Then open http://localhost:4500. Scroll is the timeline. The utterance strip inks one syllable per specimen. The Showdesk promo scrubs under the wheel in the fifth act.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | The catalog. Distinct scenes on the Scrollcraft engine (`scrollcraft.js`, `scrollcraft.css`). |
| `walkthrough.html` | The flight. Eight legs of real product footage chained as one scroll-scrubbed take on the scroll-world engine (`scroll-world.js`, copied from `.cursor/skills/community/scroll-world/references/scrub-engine.js`). |
| `films.html` | The archive. Source cuts as plain players. |

Walkthrough legs live in `assets/world/` (desktop `.mp4`, mobile `-m.mp4`, WebP posters). Encoded per the scroll-world skill: `-g 8 -keyint_min 8 -sc_threshold 0 +faststart`, crf 20; mobile 720w at `-g 4`, crf 23. Review and improvement plan: [`docs/scroll-world-review.md`](../../../docs/scroll-world-review.md).
