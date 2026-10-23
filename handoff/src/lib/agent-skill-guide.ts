/**
 * The agent skills guide, served at GET /api/agent-skill-guide to any registered agent token and to Client Services.
 * Plain markdown, short on purpose: the routes are the same ones handoff/README.md documents.
 */
export const AGENT_SKILL_GUIDE = `# Agent skills guide

Skills are task-based. You get no standing skill packs. For each card, read what it needs, search the skill library for
the skills that fit, load them, use them, and report whether they helped. The library is the R2-backed skill index, with
reusable how-to files (SKILL.md) in packs such as community/marketingskills/. All routes are on the HQ host
(hq.abra-ca-dabra.app) with your own bearer token. Set HQ to its origin. Every library route is open to every agent;
nothing needs granting first.

## The flow, per card

requirements -> search -> pick -> load with task_id -> attach to the card -> apply -> cite with skills_used and skill_feedback

### 1. Read the requirements
Read the card, its note, the brief and the client's rules. List what the work needs in plain words: for example caption
writing, LinkedIn posts, SEO, landing page copy, design, image prompts, an audit, a campaign plan.

### 2. Search by what the task needs
Search the library once per need, with one or two plain keywords. Every word must match the skill's name, description or path,
so if a search finds nothing, try a shorter or different word (caption, copywriting, seo, design, linkedin):
  GET $HQ/api/agent-skill-library?q=caption
  GET $HQ/api/agent-skill-library?q=seo+audit
  GET $HQ/api/agent-skill-library?q=design&task_id=<card id>
Each result has a name, a one-line description and a path. With no q you get every pack with its skill count and description:
  GET $HQ/api/agent-skill-library
  GET $HQ/api/agent-skill-library?pack=community/marketingskills/   (all skills in one pack)

### 3. Pick
Read the descriptions and choose one to three skills that fit this card. Prefer a specific skill over a whole pack. Do not
pick a skill because it is popular or because you used it last time. If nothing fits, say so on the card note and carry on;
do not force a skill.

### 4. Load with task_id
Read each SKILL.md you picked, with the card id so the usage log ties the read to the card:
  GET $HQ/api/agent-skill-library/community/marketingskills/copywriting/SKILL.md?task_id=<card id>

### 5. Attach to the card
Attach the pack so the team and the client page see which skills the card uses:
  POST $HQ/api/agent-board/tasks/<card id>   {"action":"attach_skills","prefixes":["community/marketingskills/"]}
  POST $HQ/api/agent-board/tasks/<card id>   {"action":"detach_skills","prefixes":["community/marketingskills/"]}
Detach a pack you loaded but did not use. Attaching is only possible while the card is not Done. After Done, what you
attached and read still shows in the usage history on the Agents page.

### 6. Apply
Follow the SKILL.md when you do the work. Do not copy its examples into the client's work.

### 7. Cite and report effectiveness
When you file the work, list the skills you followed with full SKILL.md paths (up to 30) in skills_used, and say honestly
whether each helped in skill_feedback, one entry per skill:
  POST $HQ/api/agent-work   {
    ...,
    "skills_used": ["community/marketingskills/copywriting/SKILL.md", "community/marketingskills/page-cro/SKILL.md"],
    "skill_feedback": [
      { "path": "community/marketingskills/copywriting/SKILL.md", "useful": true, "note": "Hook and CTA structure gave us a usable first draft." },
      { "path": "community/marketingskills/page-cro/SKILL.md", "useful": false, "note": "Assumes an ecommerce page; ours is a service site." }
    ]
  }
- useful is true or false. Say false when the skill did not change the work, did not fit, or slowed you down. Do not mark everything useful.
- Give a one-line note for every entry, especially a false one: what it gave you, or why it did not fit. Up to 500 characters; no client secrets or personal details.
- Cite only skills you read and followed. Paths not in the library come back as skills_unknown or skill_feedback_unknown.
- Feedback is only taken on a new filing. A repeated filing (same external_id) records nothing, so send it the first time.
- HQ shows reads, cites, useful and not useful counts, the useful rate and the latest note per pack and per skill on the Agents page, next to the review results of the cards.

## Optional: staff allow-list (grants)
Staff can grant a pack to an agent or a client, which lists it under GET $HQ/api/agent-skills. Grants are optional and are not
needed for the flow above. Do not wait for one, and do not ask for one.
  GET $HQ/api/agent-skills   (grants and packs attached to your open cards; add ?task_id=<card> to narrow it)

## Client Services

You have no agent token. When you review a card, check that its agent searched for skills for the task, cited them in skills_used and gave
honest skill_feedback; send it back if the card used none and a skill obviously fits. With the Client Services token you can browse and
read the library (read-only):
  GET $HQ/api/client-services/skill-library   (same ?q= and ?pack=)
  GET $HQ/api/client-services/skill-library/<path>/SKILL.md
Optional allow-list: GET $HQ/api/client-services/skill-grants lists grants (add ?agent_id= or ?client=<organization id>), and
POST $HQ/api/client-services/skill-grants {agent_id? | client?, prefixes[], revoke?} grants or revokes. Do not grant standing packs
for the usual flow; agents choose skills per card.
`;
