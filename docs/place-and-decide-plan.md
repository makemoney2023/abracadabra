# Place a picture, then decide

**Status:** plan. Nothing in this document is built.
**Updated:** 2026-10-22
**Follows:** [space-library-gameplan.md](space-library-gameplan.md), which is built. Pictures already lead. This plan is how a picture gets onto a day, how a clip keeps its starting still, and how the next decision is the first thing on the screen.

## Outcome

A person can put a picture on a day, and the screen opens on the piece that needs a decision.

Six slices, in this order:

1. **Drop an approved piece onto a day.** Staff drag it from the rail. The calendar schedules it.
2. **Schedule this on a Library still.** Staff turn a photo or a clip into a social piece that needs a look.
3. **A clip keeps its starting still.** The Library, the share page, and the rail show that still.
4. **Open on Needs a look.** The Library and the social screen start there when something is waiting.
5. **Approve on the selected row.** The same approval the detail already writes, on the row the person is looking at.
6. **Month days say what is left.** Pictures that fit, then a count. A day with a hidden decision says that.

## What is already true

| Fact | Where |
|---|---|
| Staff can drag a post that is already `scheduled`. The drop keeps the clock time on a day and changes the hour on an hour. | `dropTime` and `acceptDrop` in `handoff/src/components/social/social-calendar-view.tsx`, `moveSocialPostAction` |
| The drag payload is `text/post-id`. The move calls `rescheduleSocialPost`. | `social-calendar-view.tsx`, `handoff/src/lib/social.ts` |
| An approved piece with no live post sits in "Approved, not on the calendar". Staff get a link, "Schedule from finished work". | `PieceDetail` in `handoff/src/components/social/social-operations-panel.tsx` |
| Scheduling a piece is `sendPiece` with `mode: "scheduled"`. The time must be at least one minute ahead. The piece must be approved. The call picks accounts and skips accounts that already have this piece. | `sendPiece` in `handoff/src/lib/social.ts` |
| Approving from the calendar is `ApproveForm`, which posts `feedbackAction` and returns to the calendar. | `handoff/src/app/w/[slug]/work/forms.tsx`, `feedbackReturnPath` |
| Auto-schedule runs only when cadence is on, and only for approved pieces that are not already live. | `autoScheduleApproved` in `handoff/src/lib/social-autopost.ts` |
| Month view already shows two chips and "+N more". The day number opens that day. | `social-calendar-view.tsx` |
| The Library has an All chip and a Needs a look chip. The page does not choose Needs a look by itself. | `LibraryFinder` in `library-browser.tsx`, `handoff/src/app/w/[slug]/library/page.tsx` |
| The social rail lists waiting pieces and does not select one on arrival. | `ReviewList` in `handoff/src/components/social/social-rail.tsx` |
| A generated still or clip is an `agent_media` row, then a normal file once it is filed with `media_ids`. `image_media_id` is used to generate a clip and is not stored on the row. | `handoff/migrations/0044_agent_media.sql`, `handoff/src/lib/agent-media.ts` |
| A selected photo in the Library uses `/api/files/{id}/preview`. A clip with no still shows the word Video. | `filePreviewSrc` and `filePlateWord` in `handoff/src/lib/file-type.ts` |
| A new social pack is `createDeliverable`, an item is `addDeliverableItem`, and a client sees it after `publishDeliverable`. `addDeliverableItem` does not take media. | `handoff/src/db/deliverables.ts` |

## Locked decisions

1. **A drop of an approved piece schedules it.** It calls `sendPiece` with `mode: "scheduled"`. It does not call `rescheduleSocialPost`. A drop of an existing scheduled post still calls `rescheduleSocialPost`.
2. **The drop uses one account.** The account is the active account on this client whose platform matches the piece's channel. No match, or more than one match, leaves the piece where it is and shows the existing error on the calendar. The drop does not open an account picker.
3. **The time rule stays.** A day drop keeps the piece's clock time in the calendar timezone, or 9:00 when the piece has no time. An hour drop sets that hour and keeps the minutes. A time under one minute from now is refused with the message `sendPiece` already returns.
4. **Clients do not drag.** `canReschedule` stays the gate. The client rail does not start a drag.
5. **Schedule this makes a piece that needs a look.** It does not post and it does not pick a day. Staff only. It writes one pending item, with the file as `main` media, on the open in-review social pack when that pack exists, otherwise a new social pack that `publishDeliverable` publishes as in review. The browser opens `/w/{slug}/social?piece={itemId}` and the rail selects that piece.
6. **A clip remembers the still it started from.** `agent_media.source_media_id` stores `image_media_id`. Filing copies that link onto `file_posters` for the two files in that filing. The Library, Sources, a share, and a social piece use the poster's preview. A clip with no starting still still says Video.
7. **Needs a look is the default only when the visit has no filters and something is waiting.** A later click on All stays on All. The social screen selects the first waiting piece when the URL has no `piece`.
8. **Approve on the row is the same form.** It renders only on the selected row, and only when the status is pending. Ask for a change stays in the detail, because it needs the note. Pressing the row still only selects.
9. **Month overflow names a hidden decision.** Two chips stay. The third line is "1 needs a look" when any hidden post on that day is pending or changes asked, otherwise "+N more". The line opens that day.
10. **No new approval write, no Library kanban, no frame comments, and no generated frame from a video file.**

## Slice 1. Drop an approved piece onto a day

The rail row for an approved piece with no live post is draggable when `canReschedule` is true. The payload is `text/piece-id`, plus hour and minute when the piece has a clock time.

`acceptDrop` tells the panel which kind of id landed. A post id calls `move`. A piece id calls a new staff action `placeSocialPieceAction` in `handoff/src/app/clients/social-actions.ts`. That action loads the piece, checks it is approved, finds the single matching account, and calls `sendPiece`.

The calendar shows the action's message. A success refreshes the page so the piece leaves "Approved, not on the calendar" and appears on the day.

Tests:

- A day drop of a piece keeps 9:00 and calls schedule, not reschedule.
- An hour drop changes the hour.
- Two Instagram accounts, or none, returns an error and writes no post.
- A client render of the rail has no `draggable` on the piece.
- A time in the past is refused.

## Slice 2. Schedule this on a Library still

Staff see **Schedule this** on a Library card whose file is a photo or a clip. The action is `scheduleLibraryFileAction`.

It copies the file bytes into deliverable media with `openObjectStore`, role `main`. A clip with a poster also stores that still as role `poster`. Format is `static` for a photo and `video` for a clip. Channel is empty until a person chooses a network on the piece. Title is the file name without the folder.

`addDeliverableItem` grows a `mediaJson` argument. The item status is `pending`. `publishDeliverable` runs when the pack was still a draft, so `listSocialReviewPieces` can see it.

The redirect is `/w/{slug}/social?piece={itemId}`. `SocialOperationsPanel` reads `piece` and selects that id.

A client member does not see the button. A file that is not an image or a video does not get the button. A second click for the same file, while that item is still pending on the open pack, opens the existing piece and does not add another item.

Tests:

- A png becomes one pending social item with `main` media, and the redirect contains its id.
- A second call returns the same item id.
- A pdf is refused.
- A client member is refused.
- The social page selects the `piece` query.

## Slice 3. A clip keeps its starting still

Migration `handoff/migrations/0045_media_poster.sql`, copied into `handoff/src/db/migration-sql.ts` the same way `0044` is:

```sql
ALTER TABLE agent_media ADD COLUMN source_media_id TEXT REFERENCES agent_media(id);

CREATE TABLE file_posters (
  file_id TEXT PRIMARY KEY REFERENCES files(id),
  poster_file_id TEXT NOT NULL REFERENCES files(id)
);
```

`insertRow` writes `source_media_id` from `imageMediaId`. `readyMediaBytes` returns each row's id and `source_media_id`. After `storeWorkflowOutput` returns the new file ids, the filing writes `file_posters` when both the clip and its still were in that filing. Match the still by `agent_media.id`, not by a display name.

`filePreviewSrc` stays for photos. A new `posterPreviewSrc(fileId, posterFileId)` returns `/api/files/{posterFileId}/preview`. `projectFiles`, `SourcesBrowser`, and `storedPicture` on a share use it for a clip that has a poster. The social piece created in slice 2 stores the same still as role `poster`, so `pictureRole` already prefers it.

A clip generated with no `image_media_id` has a null `source_media_id` and no `file_posters` row.

Tests:

- A clip request with `image_media_id` stores that id on the new row.
- Filing the still and the clip inserts one `file_posters` row.
- The Library card for the clip uses the still's preview address.
- A clip with no source still still has a null preview and the word Video.

## Slice 4. Open on Needs a look

`LibraryPage` redirects to `?status=needs_review` when the request has no `type`, `status`, `search`, `platform`, `project`, `from`, `to`, `needs`, or `cursor`, and `needsAction` is greater than zero. All remains the explicit chip, and that URL has no status.

On `/w/{slug}/social` and the client Social tab, when `piece` is absent and `waiting` is not empty, the panel's first selected id is `waiting[0].id`. The detail for that piece is open. The calendar stays on the week, or the day on a narrow screen.

Tests:

- A library request with no query and one item in needs review redirects to `status=needs_review`.
- The same request with `?type=social` does not redirect.
- A social page with two waiting pieces selects the first.
- `?piece=` selects that piece even when it is not first.

## Slice 5. Approve on the selected row

`ReviewList` takes the pending piece's approve form as an optional node for the selected row. The panel passes `ApproveForm` with the same `slug`, `deliverableId`, `itemId`, `version`, `label`, and `returnTo` the detail uses. The row button stays `type="button"` and only selects. The form's button is `type="submit"`.

Changes stay in `PieceDetail`. An approved row has no Approve button.

Tests:

- A selected pending row contains one Approve submit and the detail's return path.
- A selected approved row does not.
- An unselected pending row does not.

## Slice 6. Month days say what is left

In month view, a day with more than two posts still shows two chips. The line under them:

- "1 needs a look" when exactly one hidden post has approval `pending` or `changes_requested`.
- "N need a look" when more than one hidden post does.
- "+N more" when every hidden post is already decided.

Hidden means the posts after the two chips. The line opens that day, as "+N more" does now.

`CalendarEvent` already has `approval`. The month line reads it. No new query.

Tests:

- Three scheduled posts and no pending approval render "+1 more".
- Two scheduled posts and one pending post, with the pending post third, render "1 needs a look".
- The line's target is that day's key.

## Out of scope

- A Library kanban.
- Comments on a video frame.
- Making a still by sampling the video file.
- Letting a client drag a piece onto a day.
- Posting from Schedule this. The piece waits for a look, then a person drops it on a day or cadence places it.
- Changing `/view/[token]` or the upload route `/share/[token]`.
- An account picker on the calendar drop.

## Verification when a slice ships

```bash
cd handoff && npx vitest run src/components/social src/lib/social.test.ts src/lib/social-autopost.test.ts src/lib/agent-media.test.ts src/lib/library-queries.test.ts src/components/library src/app/w/[slug]/library
npx tsc --noEmit
```

Run the files that slice touched. Then open the social screen and the Library in the browser: drop one approved piece onto a day, schedule one Library photo, and confirm a clip that started from a still shows that still.
