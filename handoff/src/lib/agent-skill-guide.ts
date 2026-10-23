/**
 * The agent skills guide, served at GET /api/agent-skill-guide to any registered agent token and to Client Services.
 * Plain markdown, short on purpose: the routes are the same ones handoff/README.md documents.
 */
export const AGENT_SKILL_GUIDE = `# Agent skills guide

The skill library holds reusable how-to files (SKILL.md) in packs, such as community/marketingskills/. Use them before
you write copy, audit a site, plan a campaign, or build, then say which ones you used. All routes are on the HQ host
(hq.abra-ca-dabra.app) with your own bearer token. Set HQ to its origin.

## 1. Discover

- Every pack, with its skill count and a one-line description:
  GET $HQ/api/agent-skill-library
- Skills in a pack, or skills that match words:
  GET $HQ/api/agent-skill-library?pack=community/marketingskills/
  GET $HQ/api/agent-skill-library?q=landing+page+copy
- What you were granted or attached to your open cards:
  GET $HQ/api/agent-skills   (add ?task_id=<card> to narrow it to one card)

You can browse and read the whole library, granted or not. Add ?task_id=<card id> to a lookup to tie it to your card in the usage log.

## 2. Pick

Read the pack and skill descriptions and choose one to three skills that fit the card. Prefer a specific skill over a broad pack.
If nothing fits, say so on the card note; do not force a skill.

## 3. Load

Read the SKILL.md and follow it:
  GET $HQ/api/agent-skill-library/community/marketingskills/copywriting/SKILL.md?task_id=<card id>

## 4. Attach

Attach the pack to the card so the team and the client page can see which skills the card uses:
  POST $HQ/api/agent-board/tasks/<card id>   {"action":"attach_skills","prefixes":["community/marketingskills/"]}
  POST $HQ/api/agent-board/tasks/<card id>   {"action":"detach_skills","prefixes":["community/marketingskills/"]}
Attached packs stop counting once the card is Done, so cite the skills when you file (next step).

## 5. Cite

When you file the work, list the skills you followed. Use full SKILL.md paths, up to 30:
  POST $HQ/api/agent-work   { ..., "skills_used": ["community/marketingskills/copywriting/SKILL.md"] }
Paths that are not in the library come back as skills_unknown. Cite only skills you actually read and followed.

## 6. Mark whether it helped

On the same filing, add one entry per skill saying whether it helped, with a short reason when it did not:
  "skill_feedback": [
    { "path": "community/marketingskills/copywriting/SKILL.md", "useful": true },
    { "path": "community/marketingskills/page-cro/SKILL.md", "useful": false, "note": "Assumes an ecommerce page; ours is a service site." }
  ]
- useful is true or false. note is optional plain words, up to 500 characters. Never put client secrets or personal details in it.
- Up to 30 entries, one per skill path. Skills that are not in the library come back as skill_feedback_unknown.
- HQ counts Useful and Not useful per pack and per skill on the Agents page, next to reads, cites, and review results.
- Feedback is only taken on a new filing. A repeated filing (same external_id) records nothing, so send it the first time.

## Client Services

You have no agent token. With the Client Services token you can browse and read the library (read-only):
  GET $HQ/api/client-services/skill-library   (same ?q= and ?pack=)
  GET $HQ/api/client-services/skill-library/<path>/SKILL.md
and list who has what:
  GET $HQ/api/client-services/skill-grants   (add ?agent_id= or ?client=<organization id> to filter)
Grant or revoke with POST $HQ/api/client-services/skill-grants {agent_id? | client?, prefixes[], revoke?}.
`;
