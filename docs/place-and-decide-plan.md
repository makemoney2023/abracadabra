# Place a picture, then decide

**Status:** built. The six slices below are in the app.
**Updated:** 2026-10-22
**Follows:** [space-library-gameplan.md](space-library-gameplan.md), which is built. Pictures already lead. This plan is how a finished picture becomes one social piece, how that piece gets a network and a caption before a client sees it, and how an approved piece lands on one day.

## Outcome

A staff person can turn a Library photo or clip into one piece, the client can decide on that picture with its words and its network, and staff can put the approved piece on a day.

Six slices, in this order:

1. **Schedule this on a Library still.** Staff set the network and the caption, then the piece is published for a look.
2. **A clip keeps its starting still.** The Library, the share page, and the rail show that still.
3. **Open on the piece that needs a look.** The detail is open. Approve is not armed until the person clicks the row.
4. **Approve on the clicked row.** The same approval the detail already writes.
5. **Drop an approved piece onto a day.** Staff drag it from the rail on the staff calendar. One account. One new post.
6. **A failed send stays one post.** Retry updates that post. The rail does not offer the piece again.

## What is already true

| Fact | Where |
|---|---|
| Staff can drag a post that is already `scheduled`. The drop keeps the clock time on a day and changes the hour on an hour. | `dropTime` and `acceptDrop` in `handoff/src/components/social/social-calendar-view.tsx`, `moveSocialPostAction` |
| The drag payload is `text/post-id`. The move calls `rescheduleSocialPost`. | `social-calendar-view.tsx`, `handoff/src/lib/social.ts` |
| Dragging is on only for staff, on `/clients/{id}?tab=social`. The client calendar `/w/{slug}/social` sets `canReschedule` to false. | `handoff/src/app/clients/[id]/social-tab.tsx`, `handoff/src/app/w/[slug]/social/page.tsx` |
| An approved piece with no live post sits in "Approved, not on the calendar". Staff get a link, "Schedule from finished work". The client sees "Approved. It is not on the calendar yet." | `PieceDetail` in `handoff/src/components/social/social-operations-panel.tsx` |
| Scheduling a piece is `sendPiece` with `mode: "scheduled"`. The time must be at least one minute ahead. The piece must be approved. The call needs account ids. | `sendPiece` in `handoff/src/lib/social.ts` |
| A post counts as live only when its status is `sending`, `scheduled`, `published`, or `partial`. A `failed` post is on the calendar and the piece also returns to "Approved, not on the calendar". | `LIVE_STATUSES` in `social.ts`, `postOnCalendar` and `boardLists` in `handoff/src/components/social/social-board.ts` |
| Approving calls `feedbackAction`, then `autoScheduleApproved` when cadence is on. A cadence failure is `console.error` only. | `handoff/src/app/w/[slug]/work/actions.ts`, `handoff/src/lib/social-autopost.ts` |
| The rail selects nothing on arrival. The heading is "Waiting for a look" plus a count. | `ReviewList` in `handoff/src/components/social/social-rail.tsx`, `social-operations-panel.tsx` |
| Month view already shows two chips and "+N more". | `social-calendar-view.tsx` |
| The Library has an All chip and a Needs a look chip. The page does not choose Needs a look by itself. | `LibraryFinder` in `library-browser.tsx`, `handoff/src/app/w/[slug]/library/page.tsx` |
| A generated still or clip is an `agent_media` row, then a normal file once it is filed with `media_ids`. `image_media_id` is used to generate a clip and is not stored. | `handoff/migrations/0044_agent_media.sql`, `handoff/src/lib/agent-media.ts` |
| A selected photo in the Library uses `/api/files/{id}/preview`. A clip with no still shows the word Video. | `filePreviewSrc` and `filePlateWord` in `handoff/src/lib/file-type.ts` |
| `addDeliverableItem` accepts `channel` and `copyText`. It writes `media_json` as `[]`. Adding an item to a pack whose published version is current bumps the version, sets the pack back to draft, and does not copy the older items onto that version. `publishDeliverable` publishes a draft only. | `handoff/src/db/deliverables.ts` |
| The client social page reads `social` and `sent`. The staff client page reads `tab`, `social`, and `sent`. Neither reads `piece`. | `handoff/src/app/w/[slug]/social/page.tsx`, `handoff/src/app/clients/[id]/page.tsx` |

## Locked decisions

1. **Schedule this publishes one complete piece.** Network and caption are required. An empty network or an empty caption writes nothing. The client sees the piece only after that save. The caption is one field on the item (`copy_text`). Per-network caption variants stay as they are.
2. **The piece is a snapshot.** The action copies the file bytes into deliverable media with `openObjectStore`. Role `main`. A clip with a poster also stores that still as role `poster`. Format is `static` for a photo and `video` for a clip. A later change to the Library file leaves this piece as it is. The form says that in one line: "This copies the file. A later change in the Library leaves this piece as it is."
3. **The pack is a new social pack, or a social pack that has never been published.** The action does not add an item to a pack that already has a published version. A version bump would publish a draft that does not carry the older items. Title of a new pack is the file name without the folder. `publishDeliverable` runs so `listSocialReviewPieces` can see the item.
4. **One open piece per file.** `deliverable_items.source_file_id` stores the Library file id. A second click, while that item is pending, changes asked, or approved with no live post, opens the existing piece and does not add another item. A new piece starts only after the previous one is posted (`published` or `partial`), or after the person confirms another. A `failed` post is not a reason to start another piece.
5. **Staff land on the calendar that can place the piece.** The redirect is `/clients/{organizationId}?tab=social&piece={itemId}`. A client member does not see Schedule this. The client calendar stays `/w/{slug}/social`.
6. **A drop of an approved piece schedules it.** It calls `sendPiece` with `mode: "scheduled"`. It does not call `rescheduleSocialPost`. A drop of an existing scheduled post still calls `rescheduleSocialPost`. The payload for a piece is `text/piece-id`.
7. **The drop uses one account.** The account is the active account on this client whose platform matches the piece channel. No match, or more than one match, leaves the piece where it is and shows the error on the calendar. The drop does not open an account picker.
8. **The time rule stays.** A day drop keeps the piece's clock time in the calendar timezone, or 9:00 when the piece has no time. An hour drop sets that hour and keeps the minutes. A time under one minute from now is refused with the message `sendPiece` already returns.
9. **Clients do not drag.** `canReschedule` stays the gate.
10. **Cadence and the drop are one outcome.** When cadence is on, approval still calls `autoScheduleApproved`. A success leaves the piece off the ready rail. A failure is a sentence on the staff calendar (`schedule` query), and the piece is not offered for a second drop when that failure already wrote a `failed` post. When cadence is off, the client line reads "Approved. The studio still has to put it on a day."
11. **A failed post is the same row.** `sendPiece` accepts `retryPostId`. That id must be a `failed` post for this item and version. The call updates that row and does not insert another. The ready rail treats a failed item as already on the calendar. The calendar chip stays.
12. **Arrival is not a choice.** With no `piece` query, the detail shows the first waiting piece and Approve is absent until that row is clicked. `?piece=` selects that id and arms Approve, because the link is the choice. Ask for a change stays in the detail, because it needs the note.
13. **The rail says how many are waiting.** Zero stays "Waiting for a look". One reads "1 needs a look". More reads "N need a look". The parenthetical count comes off that heading. Month view keeps two chips and "+N more".
14. **No Library kanban, no frame comments, no still sampled from a video file, no client drag, and no posting from Schedule this.**

## Slice 1. Schedule this on a Library still

Staff see **Schedule this** on a Library card whose file is a photo or a clip. A PDF or any other file does not get the button. A client member does not see it.

The first click opens a form on the card. The form has the network, the caption, and the snapshot line. The network options are the active accounts on this client, one option per platform. Submit calls `scheduleLibraryFileAction`.

The action refuses a client member, a file that is not an image or a video, an empty network, and an empty caption. It copies the bytes, then `addDeliverableItem` with `channel`, `copyText`, `mediaJson`, and `sourceFileId`. `mediaJson` entries match the stored shape `{ r2_key, role, content_type, size }`. The item status is `pending`.

The pack is the newest `social_pack` for this workspace whose `published_version` is null. When none exists, `createDeliverable` makes one. `publishDeliverable` runs after the item exists.

Migration `handoff/migrations/0046_item_source_file.sql`, copied into `handoff/src/db/migration-sql.ts`:

```sql
ALTER TABLE deliverable_items ADD COLUMN source_file_id TEXT REFERENCES files(id);
```

A second click finds the latest item with that `source_file_id` on this workspace. Pending, changes asked, or approved with no live post redirects to that item. A failed post for that item redirects to the staff calendar with that post selected. A posted item shows the form again only after the person confirms another piece.

Staff redirect: `/clients/{organizationId}?tab=social&piece={itemId}`.

Tests:

- A png with a network and a caption becomes one pending item with `main` media, that channel, that caption, and that `source_file_id`. The redirect is the staff social tab and contains the item id.
- An empty caption writes no item.
- A second call returns the same item id.
- A pdf is refused.
- A client member is refused.
- The action creates a new pack when the only social pack is already published. It does not bump that pack.

## Slice 2. A clip keeps its starting still

Migration `handoff/migrations/0045_media_poster.sql`, copied into `handoff/src/db/migration-sql.ts` the same way `0044` is:

```sql
ALTER TABLE agent_media ADD COLUMN source_media_id TEXT REFERENCES agent_media(id);

CREATE TABLE file_posters (
  file_id TEXT PRIMARY KEY REFERENCES files(id),
  poster_file_id TEXT NOT NULL REFERENCES files(id)
);
```

`insertRow` writes `source_media_id` from `imageMediaId`. `readyMediaBytes` returns each row's id and `source_media_id`. After `storeWorkflowOutput` returns the new file ids, the filing writes `file_posters` when both the clip and its still were in that filing. Match the still by `agent_media.id`, not by a display name.

`filePreviewSrc` stays for photos. A new `posterPreviewSrc(fileId, posterFileId)` returns `/api/files/{posterFileId}/preview`. `projectFiles`, `SourcesBrowser`, and `storedPicture` on a share use it for a clip that has a poster. Slice 1 stores that same still as role `poster` on the social piece, so `pictureRole` already prefers it.

A clip generated with no `image_media_id` has a null `source_media_id` and no `file_posters` row.

Tests:

- A clip request with `image_media_id` stores that id on the new row.
- Filing the still and the clip inserts one `file_posters` row.
- The Library card for the clip uses the still's preview address.
- A clip with no source still still has a null preview and the word Video.

## Slice 3. Open on the piece that needs a look

`LibraryPage` redirects to `?status=needs_review` when the request has no `type`, `status`, `search`, `platform`, `project`, `from`, `to`, `needs`, or `cursor`, and `needsAction` is greater than zero. All is the explicit chip `?status=all`, so a later click stays on everything.

On both social screens, when `piece` is absent and `waiting` is not empty, the detail shows `waiting[0]`. Approve is not mounted for that arrival. The calendar stays on the week, or the day on a narrow screen.

The waiting heading uses the count. "1 needs a look" or "N need a look". The "(n)" beside the old title goes away. The empty heading stays "Waiting for a look".

Both pages accept `piece`. The panel selects that id when it is in `waiting`, `ready`, or the posts.

Tests:

- A library request with no query and one item in needs review redirects to `status=needs_review`.
- The same request with `?type=social` does not redirect.
- A social page with two waiting pieces shows the first in the detail and renders no Approve submit.
- The waiting heading for three pieces is "3 need a look".

## Slice 4. Approve on the clicked row

`ReviewList` takes Approve as an optional node for one row. The panel passes `ApproveForm` with the same `slug`, `deliverableId`, `itemId`, `version`, `label`, and `returnTo` the detail uses. The row button stays `type="button"` and only selects. The form's button is `type="submit"`.

Approve mounts when the person has clicked that row in this visit, or when the URL contains `piece` for that id. An approved row has no Approve button. Changes stay in `PieceDetail`.

Tests:

- A selected pending row, after a click, contains one Approve submit and the detail's return path.
- The first waiting piece on a bare visit does not.
- `?piece=` for a pending id does, before any click.
- A selected approved row does not.

## Slice 5. Drop an approved piece onto a day

The ready-rail row is draggable when `canReschedule` is true and the piece has no `failed` post. The payload is `text/piece-id`, plus hour and minute when the piece has a clock time.

`acceptDrop` tells the panel which kind of id landed. A post id calls `move`. A piece id calls `placeSocialPieceAction` in `handoff/src/app/clients/social-actions.ts`. That action loads the piece, checks it is approved, refuses when a failed post exists for this item and version, finds the single matching account, and calls `sendPiece`.

The calendar shows the action's message. A success refreshes the page so the piece leaves the ready rail and appears on the day.

The staff hint reads "Drag a scheduled post to another day or hour, or drag an approved piece onto a day. The time of day stays unless you drop it on an hour."

When cadence schedules the piece, it leaves the ready rail. When cadence fails, `feedbackAction` redirects with a `schedule` query whose text is the failure sentence, and the calendar shows it. `sent` stays the approval confirmation. A failed row from that attempt is not draggable as a new piece.

The client line, when cadence is off and the piece is approved with no live post, reads "Approved. The studio still has to put it on a day."

Tests:

- A day drop of a piece keeps 9:00 and calls schedule, not reschedule.
- An hour drop changes the hour.
- Two Instagram accounts, or none, returns an error and writes no post.
- A piece with a failed post returns an error and writes no post.
- A client render of the rail has no `draggable` on the piece.
- A time in the past is refused.

## Slice 6. A failed send stays one post

`sendPiece` takes optional `retryPostId`. The post must belong to this item and version and have status `failed`. The call keeps that id, updates the row, and does not insert a second `social_posts` row.

The failed chip on the day offers **Retry** to staff. Retry calls `sendPiece` with that `retryPostId`, the same account ids, and `mode: "scheduled"` at the post's existing time when that time is still at least one minute ahead. A time that is too soon returns the existing time error and leaves the failed row in place.

`boardLists` ready list excludes an approved piece whose item id has a failed post on the current version. The calendar still shows the chip.

Tests:

- Retry of a failed post updates that id and inserts no second row.
- The ready rail does not list that piece.
- The calendar still renders the failed chip.

## Out of scope

- A Library kanban.
- Comments on a video frame.
- Making a still by sampling the video file.
- Letting a client drag a piece onto a day.
- A client "Ask to post this" on a Library photo. Staff Schedule this is the path until it lands on a day.
- Posting from Schedule this. The piece waits for a look, then cadence places it or a person drops it on a day.
- Changing `/view/[token]` or the upload route `/share/[token]`.
- An account picker on the calendar drop.
- Per-network caption variants on Schedule this. One caption is stored on the item.
- Changing the month overflow line. It stays "+N more".

## Verification when a slice ships

```bash
cd handoff && npx vitest run src/components/social src/lib/social.test.ts src/lib/social-autopost.test.ts src/lib/agent-media.test.ts src/lib/library-queries.test.ts src/components/library src/app/w/[slug]/library
npx tsc --noEmit
```

Run the files that slice touched.

The whole path, with cadence off: staff schedule one Library photo, set one network and a caption, land on the staff calendar, the client approves, staff drop it on a day, one scheduled post appears, and the piece leaves the rail. Two accounts on that network show the error and write nothing. A forced failed send stays one post, the rail does not offer a second drop, and Retry updates that same post.
