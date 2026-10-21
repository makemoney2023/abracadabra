# Social publishing through Zernio

Status: Phases 1, 2 and 3 built. Phase 4 is the plan.

The workflow, UI, and Grok-agent expansion is specified in [Agent-managed social publishing](2026-10-21-agent-managed-social-publishing-design.md), with its [test-first implementation plan](../plans/2026-10-21-agent-managed-social-publishing.md).

## Goal

Each client has its own social accounts. Finished work for that client (the caption, the pictures, the videos, the title) stays together as one piece and goes out to the client's accounts in one API call, now or at a set time.

## Why Zernio

[Zernio](https://zernio.com/llms.txt) is one REST API for the social networks we support here, including Instagram, Facebook, TikTok, LinkedIn, X, YouTube, Threads, Bluesky, and Google Business. Zernio also supports other destinations, but blog publishing and Pinterest-specific workflows are excluded from this product scope. It has the multi-tenant model we need:

| Zernio | HQ |
|---|---|
| Profile (`externalId`) | One client (`organizations.id`) |
| Connected account (`accountId`, `platform`) | One social account of that client |
| Post (`content`, `mediaItems`, `platforms[]`, `scheduledFor`) | One finished-work piece (`deliverable_items`) |
| Presigned media upload | The piece's R2 files, copied out once |

The client clicks a link Zernio makes (`GET /v1/connect/{platform}?profileId=`), signs in to the network, and Zernio sends them back to HQ. We never hold their social passwords or tokens. We hold one agency API key.

## What already exists in HQ

Finished work is already shaped for posting. `deliverable_items` carry `channel`, `format` (`static`, `carousel`, `video`, `story`, ad formats), `title`, `copy_text` (the caption), and `media_json` (R2 keys with roles `main`, `square`, `slide`, `poster`). Agents and repos fill these through `POST /api/agent-work` and the manifest pull. The client approves each piece in their space. So the "keep it together" part is done; what was missing is a place for the accounts and a way to send a piece.

## Phase 1 (built)

1. **Key.** `ZERNIO_API_KEY` is a secret on `handoff-hq` (and `handoff` when crons post later). It is read from `process.env` or the Worker binding. It is never in git.
2. **Data.** Migration `0037_social.sql`:
   - `social_profiles`: one row per client, its Zernio profile id.
   - `social_accounts`: cache of the client's connected accounts (platform, handle, active).
   - `social_posts`: each send of a piece: deliverable, item, version, target accounts, Zernio post id, status, time, error.
3. **Client Social tab** (`/clients/[id]?tab=social`): lists connected accounts, a Connect button per network (opens Zernio's sign-in and returns to the tab), Disconnect, and the posts sent for this client with their status. Opening the tab refreshes accounts and the status of posts that are still waiting.
4. **Post a piece** (`/deliverables/[id]`): each piece with a caption or media has "Post to social". Staff pick the client's accounts and choose Save as draft, Schedule (date, time, time zone), or Post now. Schedule and Post now need the client to have approved that piece. HQ copies the piece's media from R2 into Zernio (presigned upload), then creates one Zernio post for all the chosen accounts. The row is written before the call, so a failure is visible and a retry does not double-post.
5. **Media rules.** A carousel sends its slides in order. Otherwise the `main` file is sent (or `square` when there is no `main`). A video's `poster` becomes its thumbnail. PDFs go only to LinkedIn. Video and images are not mixed in one post.

## Phase 2: status and per-network options (built)

- Zernio webhooks to `POST /api/zernio/webhook`: post events by Zernio post id, account events by `profiles[0].externalId`. Signed with `ZERNIO_WEBHOOK_SECRET`; registered with `npm run zernio:webhook`.
- The one-minute cron on worker `handoff` refreshes posts due in the last six hours that still say sending or scheduled.
- Large videos stream from R2 into Zernio.
- Per-network text (`customContent`) and per-network options: YouTube title and tags, first comment.

Blog article posting and Pinterest options are out of scope for now.

## Phase 3: let the client and the agent drive it (built)

- The client connects accounts from their own space (`/w/[slug]/social`) with the same link. Staff stay able to do it for them.
- A content calendar per client: scheduled posts grouped by day, with Move (`PUT /v1/posts/{id}`) and Cancel (`DELETE /v1/posts/{id}`).
- HQ chat tools: `list_social_accounts`, `list_social_posts`, `schedule_social` (approval card). Only approved pieces can be scheduled.
- Auto-schedule on approval: a client setting picks accounts and a cadence; approving a piece queues it in the next open slot.

## Phase 4: results

- Per-post and per-account analytics from Zernio pulled into the client page and the Monday status note.
- Comment and DM inbox per client (Zernio inbox API), shown in Threads.

## Costs and limits

- First 2 connected accounts are free, then $6 per account per month for accounts 1 to 10, $3 for 11 to 100. Blog sites count as accounts.
- 60 requests a minute on the free tier, 600 on paid. HQ calls Zernio only on staff actions and tab opens.
- Videos stream from R2 into Zernio's presigned upload (FixedLengthStream), so a large file is not held in Worker memory. Pictures are small and still read whole.

## Risks

- Posting is public and permanent. Schedule and Post now are gated on client approval, and Zernio drafts are the default.
- TikTok needs consent flags on each post. Phase 1 sends videos to TikTok as drafts (`tiktokSettings.draft`), so the client picks the audience in TikTok.
- Instagram needs a Business account; Facebook needs a Page; LinkedIn may need an organization pick after sign-in. Zernio handles those screens.
