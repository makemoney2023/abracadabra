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

## Client lead agents: choose the function agent for a card

Every client has the same function agents (engineering, SEO, creative, social, and any added later) as hires. Choose by what the card
needs, the way you choose a skill, then create the card with that agent as its assignee and move it to Doing:
  GET $HQ/api/agent-agents                 (the function agents on your clients: agent_id, function, description)
  GET $HQ/api/agent-agents?client=<organization id | domain | space slug>
  POST $HQ/api/agent-board/tasks   {"title":"...","note":"...","client":{"domain":"..."},"assignee":"<agent_id>","work_request_id":"<Client Services request id>"}
  POST $HQ/api/agent-board/tasks/<card id>   {"action":"move","to":"doing"}
Pick from the descriptions. If none fits, keep the card yourself and say so in its note. The function agent then searches the library for its own skills.

## Scheduling a social post (only if staff turned it on for you)

A function agent can schedule or publish a LinkedIn post only when staff turned that on for you on this client. It is off by default;
a plan for an agent that is not allowed is 403. You prepare a plan, then run it. Nothing posts when you prepare. Send an
external_id (your idempotency key) on every write; reuse it to retry safely, and use a new one for a new post.
  1. Card first: the deliverable's card must be Done and the piece approved. Save the caption for the network if it is not saved yet
     (PATCH $HQ/api/agent-social/pieces/<item id>/variants). You cannot change the caption of a post that is already scheduled: 409 post_scheduled.
     Approving one piece: if the piece is still pending and you are allowed to approve (a client lead in schedule_approved or managed mode, or a
     hire staff granted can_approve), approve exactly that piece. It is the same item-level approval a staff member or the client gives:
       POST $HQ/api/agent-social/items/<item id>/approve   {"client":"<domain>","external_id":"approve-<item>-v1","deliverable_id":"<id>","reason":"<who asked, e.g. Christopher said so in chat>"}
       POST $HQ/api/agent-social/items/<item id>/unapprove  (same body) puts an approved piece back to pending, until it is scheduled.
     It only changes that one piece, at the published version, and it never schedules or posts: prepare and run a plan afterwards (steps 2 and 3).
     Never approve a sibling you were not asked about (a poster picture approved by mistake would be a separate picture post). Errors: 403 (not
     allowed, feature off, or mode draft or observe), 404 not_found, 409 stale_version / piece_removed / not_social_piece / deliverable_not_reviewable /
     changes_requested / project_excluded / post_scheduled, 429 rate_limited. Approving twice is safe: changed:false. Every approval is logged with your agent id and reason.
  2. Prepare:
     POST $HQ/api/agent-social/plans   {"client":"<domain>","external_id":"li-<work item>-v1","action":"schedule","deliverable_id":"<id>","work_item_id":"<Done card id>",
       "selection":{"mode":"explicit","item_ids":["<item id>"],"account_ids":["<linkedin account id>"]},
       "timing":{"mode":"scheduled","start_at":"2026-11-02T14:00:00Z"},"timezone":"America/Toronto"}
     For "now" use "action":"publish_now" and no timing (needs publish-now permission too; a Done and approved card is enough, no staff approval). GET $HQ/api/agent-social/accounts lists the connected LinkedIn account.
     The response has planId, planHash, authorization, rows (will post) and blocked (with a reason each: unapproved, card_not_done,
     project_excluded, platform_not_allowed, duplicate, ...). Errors: 400 deliverable_required / work_item_required / external_id_required,
     404 not_found, 409 card_not_done / work_item_mismatch / deliverable_mismatch, 403 (not allowed or feature off), 429 rate_limited.
  3. Run: POST $HQ/api/agent-social/plans/<planId>/execute   {"external_id":"li-<work item>-v1-run","plan_hash":"<planHash>"}
     Schedule and publish now run straight away when authorization is allowed. A move or cancel (and anything else with authorization
     confirmation_required) needs staff approval first. Staff approve in HQ. Poll GET $HQ/api/agent-social/plans/<planId> until
     approval.status is approved, then send approval.confirmationToken as "confirmation_token" in execute. The token is single use and short lived.
  4. Status: GET $HQ/api/agent-social/plans/<planId> (outcomes), GET $HQ/api/agent-social/posts?client=<domain>, GET $HQ/api/agent-social/attention.
  5. Move or cancel a scheduled post: POST $HQ/api/agent-social/posts/<post id>/move-plan {"client","external_id","scheduled_for"} or /cancel-plan,
     then the same approval and execute. A failed post shows in attention; ask staff before retrying with a token that has expired.
Limits per agent and client: 20 plans an hour, 10 posts a day, 3 publish-now a day, 30 approvals an hour (429 rate_limited). You cannot sweep: name the pieces.
Alt text is not supported yet; do not promise it.

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
