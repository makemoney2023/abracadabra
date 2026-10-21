# Social publishing through Zernio

Status: Phase 1 built (this PR). Phases 2 to 4 are the plan.

## Goal

Each client has its own social accounts and blog sites. Finished work for that client (the caption, the pictures, the videos, the title) stays together as one piece and goes out to the client's accounts in one API call, now or at a set time.

## Why Zernio

[Zernio](https://zernio.com/llms.txt) is one REST API for 16 social networks (Instagram, Facebook, TikTok, LinkedIn, X, YouTube, Threads, Pinterest, Bluesky, Google Business, and more) plus WordPress and Wix blogs. It has the multi-tenant model we need:

| Zernio | HQ |
|---|---|
| Profile (`externalId`) | One client (`organizations.id`) |
| Connected account (`accountId`, `platform`) | One social account or blog of that client |
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

## Phase 2: status and blogs

- Zernio webhooks (`post.published`, `post.failed`) to `POST /api/zernio/webhook`, routed by `profiles[0].externalId`. Replaces refresh-on-open.
- The one-minute cron on worker `handoff` refreshes posts due in the last hour.
- Blog posting: a `page` piece (or a `document` deliverable) goes to a connected WordPress or Wix site through `POST /v1/accounts/{id}/blogs/{blogId}/articles` (`title`, `bodyHtml`, `image`, `publishDate`).
- Per-network text (`customContent`) and per-network options: Pinterest board, YouTube title and tags, TikTok privacy, Instagram story or reel, first comment.

## Phase 3: let the client and the agent drive it

- The client connects accounts from their own space (`/w/[slug]/social`) with the same link. Staff stay able to do it for them.
- A content calendar per client: every scheduled post on a month view, drag to move (`PUT /v1/posts/{id}`).
- HQ chat and agent tools: `list_social_accounts`, `schedule_piece`, `list_scheduled_posts`. Approval rules stay the same: only approved pieces can be scheduled.
- Auto-schedule on approval: a client setting picks accounts and a cadence; approving a piece queues it in the next open slot.

## Phase 4: results

- Per-post and per-account analytics from Zernio pulled into the client page and the Monday status note.
- Comment and DM inbox per client (Zernio inbox API), shown in Threads.

## Costs and limits

- First 2 connected accounts are free, then $6 per account per month for accounts 1 to 10, $3 for 11 to 100. Blog sites count as accounts.
- 60 requests a minute on the free tier, 600 on paid. HQ calls Zernio only on staff actions and tab opens.
- A Worker reads the whole media file into memory before the upload. Videos above about 100 MB should move to a streamed copy (R2 presigned GET handed to Zernio) in Phase 2.

## Risks

- Posting is public and permanent. Schedule and Post now are gated on client approval, and Zernio drafts are the default.
- TikTok needs consent flags on each post. Phase 1 sends videos to TikTok as drafts (`tiktokSettings.draft`), so the client picks the audience in TikTok.
- Instagram needs a Business account; Facebook needs a Page; LinkedIn may need an organization pick after sign-in. Zernio handles those screens.
