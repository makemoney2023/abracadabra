# Review: the walkthroughs, and the move to scroll-world

Review of the Abracadabra AI build after the first deploy, with the correction that followed. The brief was one page of shipped work with product walkthroughs. The walkthroughs shipped as a screening room. They should have been a scroll world.

## What was wrong

1. **The walkthroughs were players, not a flight.** `films.html` was a grid of `<video controls>`. Every clip started at zero, played on its own clock, and stopped. The viewer chose what to watch and the page had no camera. That is a media library, not a walkthrough.
2. **The brief closed the door on it.** Answer 7 in `BRIEF.md` said "distinct scenes, not one camera flight" and applied that to the whole build. It was the right answer for the catalog and the wrong answer for the walkthrough. The two pages have different jobs and needed different answers.
3. **Captures were not encoded to scrub.** The stored MP4s used default keyframe spacing. Seeking is only smooth when a keyframe is never more than a few frames away. Under a scroll-driven `currentTime` those files would have stuttered.
4. **Nothing joined the legs.** Each Playwright take began from `about:blank`, so first frames were blank or half-painted, and no take ended where the next began. There were no seams to check because there was no chain.
5. **Fixed-media QA never happened.** The screening room was checked with one screenshot. Scroll-driven pages fail at seams and on phones, and neither was looked at.

## What changed

- **scroll-world is installed** at `.cursor/skills/community/scroll-world/` (oso95/scroll-world v0.8.0, MIT, verbatim, with `PROVENANCE.md`). The skill's Higgsfield and Monid generation steps are not needed for real footage and are left as-is for later.
- **Eight legs re-encoded** into `scrollcraft/builds/abracadabra-ai/assets/world/` with the skill's Step 6 settings: `-an`, unsharp, libx264 slow, crf 20, `-g 8 -keyint_min 8 -sc_threshold 0`, `+faststart`; 720p mobile variants at `-g 4`, crf 23; WebP posters from the first frame. Lead-ins trimmed so every first frame is the real product hero.
- **`walkthrough.html`** mounts `scrub-engine.js` (copied as `scroll-world.js`) over those legs. Architecture A: one forward take, `connectors: [null…]`, so neighbouring legs crossfade instead of flying over an unrelated bridge. Eight route dots, top nav, dark theme on `--sw-*` tokens, footage framed as a screen on the right so product UI text stays legible. Counter and scroll hint hidden per Scrollcraft rules.
- **QA done by scrolling**, desktop 1440 and phone 390, plus reduced motion: 8 scenes, `seekable.end(0)` = 6.52 on the first leg, mobile loads the 720w clips, reduced motion renders stills only, no console errors, crossfades observed at seams.
- **Links updated.** `index.html` footer sends people to the flight first. `films.html` stays as the archive of source cuts and points at the walkthrough.

## Where it still falls short

The legs are eight separate recordings joined by crossfade. That is a legal scroll-world (the skill allows null connectors) but not the strongest one. The seam law says a connector's endpoints must be actual frames of the neighbouring legs. With separate captures the endpoints match by product, not by pixel.

## Improvement plan

Ordered by payoff.

1. **Recapture each product as one continuous Playwright take.** One session per product: land, scroll, click into the key screen, scroll again. Cut the legs from that single take at exact frames. Seams then match by pixel and the crossfade can drop to the skill's 0.12 or lower. This is the single biggest lift and needs no new tooling.
2. **Chain the products with a captured bridge.** Between products, record a short take that leaves the last screen and arrives on the next hero (a tab switch, a zoom out to the catalog page, a zoom into the next). Real footage, real endpoints, no AI generation needed.
3. **Generated connectors once Higgsfield is authenticated.** The skill's architecture B (hub and spokes) or generated fly-overs would let the flight leave the browser frame. Blocked today: Higgsfield MCP `needsAuth`, no `higgsfield` or `monid` CLI. Not a blocker for real footage.
4. **Fill the capture gaps.** Schema seeded `/scan/[token]` report (the sales docs already ask for it; the live form at schema-two.vercel.app currently fails with "Missing Supabase admin env", so this needs the deployment fixed or a seeded fixture), the LLM Leverage lesson body, and for CDA the warehouse film sections, `/visit`, and a Path Check run with real door numbers. The CDA leg is already one continuous take from cdastore.vercel.app (home → Path Check).
5. **Move the catalog's Showdesk scrub to the same encode.** `index.html` act 5 scrubs the Showdesk promo. Re-encode it with `-g 8` so it seeks as cleanly as the walkthrough legs.
6. **Make the flight the entrance.** Once the recapture lands, consider the walkthrough as the landing page and the catalog as the index behind it. Today the catalog leads because it is the more finished object.

## Rules carried forward

- Walkthrough footage is one continuous take per product, scrub-encoded, chained; never a grid of players.
- Every first frame is the product, never a blank page.
- QA scroll-driven pages by scrolling, at desktop and phone widths, and once with reduced motion.
- Answer "one world or distinct scenes" per page, not per build.
