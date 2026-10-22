# Premium finished work, run by the Grok agents

> **Status:** Implemented on `cursor/finished-work-shelf-f3c1`. The tasks below are the record of what shipped. A signed-in browser pass of Library → piece → Remove → Social was not run in that change.

> **For agentic workers:** Implement one task at a time. Write the failing test first, confirm the intended failure, then make the smallest complete change. Do not start the next task while the current test is red.

**Goal:** Make Files, the Library, and Social feel like one finished-work desk. The client sees pictures and one next step. The assigned Grok lead does the staff job on that same desk.

**Architecture:** Keep the shelf from the finished-work change (`removed_at`, a card opens `?item=`, Social is the calendar). Add the staff actions the screen still lacks, then expose those same commands to the assigned Grok agent. The agent uses the existing social command layer for anything that leaves the building. It never approves as the client, and it never finishes a social sign-in.

**Tech stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, D1, R2, existing `caw_…` agent tokens, existing social plans and policy.

**Builds on:** [Library and sharing design](../specs/2026-10-21-handoff-library-and-sharing-design.md), [picture-first gameplan](../../space-library-gameplan.md), [agent-managed social publishing](../specs/2026-10-21-agent-managed-social-publishing-design.md), and the shelf on branch `cursor/finished-work-shelf-f3c1` (pull request 187).

---

## Repository boundary

Implementation is in [`handoff/`](../../../handoff/).

Commit as `makemoney2023 <124006256+makemoney2023@users.noreply.github.com>` by passing `GIT_AUTHOR_*` and `GIT_COMMITTER_*` on every commit. Do not change git config.

`ZERNIO_API_KEY` and `ZERNIO_WEBHOOK_SECRET` stay Worker secrets. Agent responses never include them, provider URLs, or OAuth tokens.

## What premium means here

Premium is a short path, a clear picture, and a staff member who already did the chores.

| The client sees | The client does |
| --- | --- |
| A picture of the piece, one status, one sentence | Approve, ask for a change, or remove it |
| The calendar of posts that have a time or a live link | Connect their own social account when asked |
| A share page of the pictures they were sent | Look. The share does not collect an approval |

The client does not see a pack, a version number, a provider name, or the same piece on two screens.

| The Grok lead does | The Grok lead does not |
| --- | --- |
| File the work, choose which files sit on the Library, write the caption per network | Approve the content in the client's place |
| Place an approved piece on the calendar inside the client's cadence | Finish the client's social sign-in |
| Move, cancel, or retry a post, then say what happened in plain words | Delete a file the client uploaded |
| Take a piece off the shelf, or put it back, under the same rules as the button | Treat an empty id list as "every piece" |

A hire can file work and draft captions for a client it is on. The lead places posts and releases a round. A human on Client Services remains the exception desk: send-back, a stuck account, and the first weeks of a new agent.

## What is already true

| Fact | Where |
| --- | --- |
| A Library card opens that piece at `/w/[slug]/work/[id]?item=`. Approve, ask for a change, and Remove are on the piece. | Shelf change, pull request 187 |
| Remove sets `deliverable_items.removed_at`. The Library and the Social waiting lists hide it. Put back clears the time. A draft, sending, scheduled, published, or partial post blocks Remove. | `handoff/src/lib/finished-shelf.ts` |
| Social shows two counts and links to the Library. The calendar stays. | `social-operations-panel.tsx` |
| Files still delete only for the person who uploaded them. Sources can take a chosen file off the Library. | Existing file delete and `toggleSourceAction` |
| An agent files work with `POST /api/agent-work`. The batch is held until Client Services releases it. The client then approves the piece. | `handoff/README.md`, migration 0032 |
| An assigned agent can read social overview, pieces, posts, accounts, cadence, and attention. Writes go through prepare-then-execute and stay off unless `SOCIAL_AGENT_ACTIONS` is on. | `/api/agent-social/*`, `socialAgentActionsEnabled` |
| The agent piece list reads `deliverable_items` at `deliverables.version`, and it does not look at `removed_at`. | `currentPieces` in `social-queries.ts` |
| Staff still schedule from **Post to social** on `/deliverables/[id]`, which lists the pack. | `handoff/src/app/deliverables/[id]/page.tsx` |
| **See the whole set** still opens every piece with the same buttons and Approve all. | `handoff/src/app/w/[slug]/work/[id]/page.tsx` |

## Locked decisions

1. **One desk, three jobs.** Files are uploads. The Library is the shelf. Social is the calendar. A new screen that lists the pieces again is a defect.
2. **The open piece is the proof.** The large picture, the caption for the network, and one primary action. Approve all stays on the set index, not on the proof.
3. **The agent is staff for the chores, not for the client's yes.** Client approval stays a client write. Agent policy (`observe`, `draft`, `schedule_approved`, `managed`) still decides what the agent may execute.
4. **The client shelf is the published round.** Agents read and schedule `published_version`. The working version is the draft the client cannot see.
5. **Release is a separate, named step.** In `observe` and `draft`, a filing stays held for a human. In `schedule_approved` and `managed`, the lead may release its own unpublished round onto the client shelf. Release does not mark the pieces approved.
6. **Remove is the same function for the button and the agent.** `setPieceShelf`. A live post still blocks it. The activity records the actor.
7. **Empty lists stay empty.** An agent prepare with no piece ids is a refusal, as it is today. The staff form's "all pieces" may mean every eligible piece in that pack, and it must say which ones.
8. **Provider names stay off the client screen and out of the agent's client summary.** HQ and the agent JSON may name the provider when the caller is staff or the agent.

## Out of scope

- Comments pinned to a video frame.
- A second calendar or a kanban of the Library.
- Blog publishing, WordPress, Wix, and Pinterest-specific flows.
- The agent completing OAuth.
- Deleting client-uploaded bytes from an agent call.
- Analytics that republish a post on their own.
- A comments or DM inbox.

## The day, as the lead runs it

1. `GET /api/agent-social/overview` plus the Library list. The counts match the sentence on the client's Social page: needs a look, approved and not on the calendar, posts that need attention.
2. File new work. A still comes from `POST /api/agent-media`, then `media_ids` on the filing. It is not a post until it is a piece on a released round.
3. Choose which clean files appear on the Library. Leave the rest in Files.
4. Write the caption per network on the piece.
5. Wait. The client approves or asks for a change on the proof.
6. Prepare a schedule for the exact approved piece ids, into the next free cadence slots. Execute that plan.
7. On a failure, retry or cancel through a plan. Write the client a plain sentence. Do not leave a failed card up after the piece is removed.
8. If the piece should leave the shelf, call the same remove the button uses. If a post is still live, cancel that post first, then remove.

A hire stops at step 4 unless its policy includes schedule.

## Requirements

| ID | Requirement |
| --- | --- |
| PFW-001 | The set page is an index: picture, title, status. The proof is one piece. Approve all lives on the index. |
| PFW-002 | Staff Post to social omits removed pieces and names a live post when Remove is blocked, with a link to that post. |
| PFW-003 | A removed piece drops its failed and cancelled calendar cards. A live post still blocks Remove. |
| PFW-004 | The agent piece list uses the published round and skips `removed_at`. |
| PFW-005 | An assigned agent can list the Library the client sees, including Removed, without another client's rows. |
| PFW-006 | An assigned lead can remove and restore a piece through `setPieceShelf`. A hire can do it only while the round is still held. |
| PFW-007 | An assigned agent can show or hide a clean file on the Library. It cannot delete the bytes. |
| PFW-008 | An assigned lead can create and revoke a view link for pieces on the published round. |
| PFW-009 | An approved piece can be scheduled from the proof. The action prepares one plan for that piece and the chosen accounts. |
| PFW-010 | In `schedule_approved` and `managed`, the lead can release its own held round. The pieces stay unapproved. `observe` and `draft` still wait for a human. |
| PFW-011 | The agent overview counts use the same words as the client Social page. |
| PFW-012 | A posted Library card shows the public link under the title. The picture still opens the proof. |
| PFW-013 | The Removed shelf shows who took it off and when. |
| PFW-014 | Client copy stays short and plain. No provider name, no internal id, no agent name. |

## Tasks

### Task 1: The set is an index

**Files:** `handoff/src/app/w/[slug]/work/[id]/page.tsx`, a small presentational component next to `collection-review.tsx`, a render test.

**Done when:**

- With no `?item=`, the page lists each piece as a picture, a title, and a status, and each row links to `?item=`.
- Approve, ask for a change, and Remove render only when `?item=` is set.
- Approve all stays on the index when any piece is still pending.
- A brief keeps its current Approve and Deny.

**Test:** render the index and the proof. The index HTML contains the piece link and does not contain the Remove button. The proof HTML contains Remove.

### Task 2: Post to social matches the shelf

**Files:** `handoff/src/app/deliverables/[id]/page.tsx`, the send form's piece list, `finished-shelf.ts` if the block message needs the post id.

**Done when:**

- A piece with `removed_at` is absent from Post to social.
- Remove on a live post returns the existing sentence plus the post title and a path the staff calendar can open.
- "All pieces" on that form means every piece still on the shelf in that pack, and the confirmation names any piece it skipped.

**Test:** a removed id is not in the form's piece list. A scheduled post blocks remove and the error includes the post id.

### Task 3: Failed cards leave with the piece

**Files:** `setPieceShelf` in `finished-shelf.ts`.

**Done when:**

- After a successful remove, posts for that item and version in `failed`, or `failed` with error `Cancelled.`, are marked so `postOnCalendar` hides them.
- `scheduled`, `sending`, `published`, `partial`, and `draft` still block the remove. Their rows stay.

**Test:** extend `finished-shelf.test.ts`. A failed post is off the calendar query after remove. A scheduled post is unchanged and the remove is refused.

### Task 4: The agent reads the client shelf

**Files:** `currentPieces` in `social-queries.ts`, `social-queries` tests.

**Done when:**

- The query uses `COALESCE(d.published_version, d.version)` only when `published_version` is set. A draft round with no published version is returned as `state: "held"` and cannot be scheduled.
- `removed_at` rows are omitted from the default list. `?state=removed` returns them.
- A stranger agent, and an agent on another client, still get the current 404.

**Test:** a removed published piece is absent from the default list and present for `state=removed`. An unpublished working copy is not `state: "review"`.

### Task 5: Agent Library list

**Files:** `GET /api/agent-library` (new), a read model that calls `listLibraryArtifacts` for the assignment's space.

**Done when:**

- The lead and a hire on that client receive the same cards the client Library shows: type, title, status, piece path, preview path, public URL when there is one.
- `removed=1` matches the Library's Removed shelf.
- The JSON includes `itemId` and `deliverableId` because the agent must act. It does not include provider secrets or another workspace.

**Test:** route test with two clients. The agent sees only its assignment. A removed piece appears only with `removed=1`.

### Task 6: Agent remove, restore, and file choice

**Files:** `POST /api/agent-library/shelf`, `POST /api/agent-library/files`. Both call `setPieceShelf` and the existing select/revoke file helpers.

**Done when:**

- The body is `{ client, itemId, version, removed: boolean }` or `{ client, fileId, selected: boolean }`.
- The server checks assignment, then policy. A lead may remove a published piece. A hire may remove only while the filing is still held. Both may select a clean file.
- File bytes are not deleted. A missing or foreign id is 404. A live post is 409 with `SHELF_LIVE`.
- The activity actor is the agent id.

**Test:** lead removes and restores. Hire is refused on a published piece. A scheduled post returns 409 and `removed_at` stays null. Selecting a file makes `listLibraryArtifacts` return it; revoking hides it.

### Task 7: Schedule from the proof, and a view link

**Files:** the proof page, `prepare` social plan for one item, view-link create/revoke reused by `POST /api/agent-library/shares`.

**Done when:**

- On an approved proof, staff see accounts and a time. Submit prepares one plan and shows the exact row before anything is sent. Execute uses the existing plan route.
- The client proof does not show that form. The client sees "Approved. It will go on the calendar."
- A lead can create a view link for published piece ids and revoke it. The public page stays read-only.
- `SOCIAL_AGENT_ACTIONS` still gates the social execute. The view link and the shelf do not call Zernio.

**Test:** the proof render includes the schedule form only for staff. An agent share for another client's item is 404. Executing a plan still requires the flag and an approved piece.

### Task 8: The lead can release its own round

**Files:** a new command next to Client Services approve, gated by agent mode. Do not weaken the human approve path.

**Done when:**

- `POST /api/agent-work/:id` `{ action: "release" }` works for the lead when the client policy is `schedule_approved` or `managed`, the filing is that agent's, and it is still held.
- The deliverable is published as `in_review`. Pieces stay `pending`. No client mail goes out unless the client's update mode is already `auto`.
- `observe` and `draft` return 403 `policy_mode`. A hire returns 403.
- The human send-back and approve routes stay as they are.

**Test:** managed lead release makes the piece visible to the client member and still unapproved. Draft mode does not. Auto-schedule does not run, because nothing was approved.

### Task 9: The same words on both sides

**Files:** `socialOverview`, `shelfNote`.

**Done when:**

- Overview returns `needsALook` and `approvedNotScheduled` as counts, plus the Library paths the Social page uses.
- Those counts ignore removed pieces and unpublished rounds.
- The client Social page and this JSON can be checked against one fixture.

**Test:** one pending published piece and one removed piece. The count is 1. The removed piece is not in it.

### Task 10: The card tells the truth after it is posted or removed

**Files:** `artifact-card.tsx`, `article-card.tsx`, `setPieceShelf` activity read on the proof.

**Done when:**

- A published social card shows the public post link under the title. The picture still opens `?item=`.
- The proof for a removed piece says who removed it and the local time. The actor kind may say "Studio" for an agent, never the agent id, on the client view. Staff and the agent JSON may show the agent id.

**Test:** card HTML contains the post URL and the piece href. The client proof HTML contains "Studio" and does not contain the agent id.

## Order

Tasks 1–4 can land before any new agent route. They fix what humans and agents already see.

Tasks 5–7 are the staff desk for the agent.

Task 8 is the one policy change. Do it after 5–7 so a released round has a shelf the agent can actually run.

Tasks 9–10 are the premium pass: the same sentence on both sides, and a card that shows the live post.

## Verification

For each task, from `handoff/`:

```bash
npx vitest run src/lib/finished-shelf.test.ts src/lib/library-queries.test.ts src/lib/social-queries.test.ts src/lib/social-review.test.ts
npx eslint <the files that task touched>
npx tsc --noEmit
```

`tsc` already reports `LayoutProps` and `PageProps` missing in `src/app/layout.tsx` and `src/app/page.tsx`. Those two errors are older than this plan. A new error in a file this plan touches is a failure.

A task that changes the Library, the proof, or Social is not done until someone signed in has opened the piece, removed it, seen it under Removed, and seen the Social count drop. Say so in the task note if that click-through could not be run.

## What we are not doing, on purpose

- Dragging a picture onto a day. Task 7 puts the time on the proof. Dragging can follow if that form feels slow.
- A Decide mode that approves many ticked cards. Approve all on the index covers a pack. Ticked approve can follow if packs get large.
- A separate "Hidden from the client" state. Release versus held already hides a draft. Removed is the client-visible shelf. Adding a third hide splits the desk again.
- Letting the agent mark a piece approved when the client has gone quiet. Silence is not a yes.
