# Space library: pictures first

**Status:** built. The rail, the Library card, Share, Sources, and the file tile follow this document.
**Updated:** 2026-10-22
**Amends the presentation in** [handoff-library-and-sharing-design.md](superpowers/specs/2026-10-21-handoff-library-and-sharing-design.md). The records, the view-link token, and the approval write stay as that spec describes them. Labels, the social rail, and what a card looks like follow this document.

## Outcome

A person recognizes the work before they read its name.

Three jobs, in this order:

1. **See it.** The social rail, the Library, Sources, and a share page lead with the picture.
2. **Decide.** A piece that needs a look opens on Approve and Ask for a change. Those words already exist on the finished-work page and on the social calendar.
3. **Share.** Sending a look is one button, used when someone means to send it. The page that opens shows the same pictures.

Files stay the folder of everything uploaded. The Library stays the shelf of finished work.

## How other content systems show the work

The pattern is the same across the tools that do this well. The picture is the card. The name is the caption. A decision is a verb on the open piece. A link you send is a deliberate share of that picture.

| System | What a person sees first | What “review” means there | What we take |
|---|---|---|---|
| Frame.io | A thumbnail grid. The list view still has a thumbnail. Clicking opens the picture or the player, and comments sit on that frame. | A review link opens that asset. The link list shows the thumbnail, so the recipient knows which piece it is before they read the title. | Click the picture. A share page shows the picture. |
| Air | Large thumbnails. Images and video sit in front of other files. Status is a label on the asset, and a board can group by that label. | Comments and approval happen on the asset. | The card is the picture. Status is a chip on the picture. |
| Dropbox Replay | The review page is the video or the still, with Approve and request-changes on that page. The file browser stays a file browser. | Replay is a review pass over a file. It is a second screen, and it is still the picture. | Files stay files. The decision stays on the piece. |
| Planable and Later | The calendar cell and the draft list show the creative. Later’s media tray is a strip of thumbnails you drag onto a day. Approval is Approve or request changes on the post. | The word on the post is the decision. | The social rail is that tray: picture, then a short title, then the status. |
| Dropbox and Drive photo grids | Grid view is the picture. List view is the name with a small icon. Photos default to the grid. Share appears after you select. | Sharing is a button on the selection. | Checkboxes appear only while sharing. |

We do not copy Frame.io’s frame comments, Replay’s separate review product, or Air’s custom kanban. Social planning already has one calendar. A second board would split it again. Status on a Library card is a chip.

## What is already true

| Fact | Where |
|---|---|
| The social screen is a left rail plus a day, week, and month calendar. | `ReviewList` in `handoff/src/components/social/social-operations-panel.tsx` |
| Each rail row is the title, a status, the deliverable name, and up to two lines of caption. | Same component, the button inside `ReviewList` |
| The piece already carries media roles and content types. The detail pane already builds `/api/deliverables/{deliverableId}/items/{itemId}/media/{role}`. | `SocialReviewPiece` in `handoff/src/lib/social-review.ts`, `PieceDetail` in the panel |
| A calendar chip can show a 20px image, and it always asks for the `main` role. | `thumbnailRole: "main"` in `handoff/src/components/social/calendar-posts.ts` |
| A Library card is a tinted plate, the type word, a large title, a status pill, and an underline. When the status is `needs_review`, that underline says Review and goes to the finished-work page. | `ArtifactCard`, `actionsFor` in `handoff/src/lib/library-artifacts.ts` |
| The plate shows an image only when some media role is an image. A video-only piece shows the word “video” or “social”. | `previewSrc` in `handoff/src/lib/library-queries.ts`, `ArtifactThumbnail` |
| Every card can show a dashed “Add to view link” checkbox, under a box titled “Copy view link”. | `LibraryGallery` |
| The public share page lists the type word and the title. It has no picture. | `PublicLibraryView` |
| Sources (`?type=file`) is a different page: the file name as a text link, a scan status, and Show in Library. | `SourcesBrowser` |
| The Files page already knows which names can be a thumbnail, and draws them at 40px. | `thumbnailable` in `handoff/src/lib/file-type.ts`, `TypeTile` in `folder-files.tsx` |
| Approving still writes deliverable feedback and returns to the calendar when you came from it. | `feedbackAction`, `feedbackReturnPath` |

## The hole

1. The rail is the list a person scans, and it is names. The picture is one scroll below, after they already had to pick by title.
2. The Library asks the same person to do three jobs at once: browse, tick “Add to view link” on every card, and follow an underline called Review. Review and the view link sound like one action. They are not. Review opens the finished-work page. The view link is a read-only bundle and does not collect Approve or Ask for a change.
3. A video with no still, and a share page, and Sources, all fall back to words. The Files page can already preview a jpg, png, webp, or gif, at a size that is hard to recognize.
4. The calendar says “Needs a look” and “Changes asked”. The Library says “Needs review” and “Changes requested”. The same piece wears two names.

## Locked decisions

1. **One picture picker.** Prefer an image role named `poster`, then `cover`, then `thumbnail`, then `square`, then `main`, then any other image. A video file is never the `img` source. A piece with only video shows a tile that says Video. A broken image hides and leaves that tile.
2. **The card is the link.** The Library card’s click target is the picture and its title, going to the same finished-work page Review goes to today. There is no second underline called Review.
3. **The decision words stay on the open piece.** Approve and Ask for a change stay the forms that already write feedback. The grid does not approve on click.
4. **Share is a mode.** The dashed checkbox and the “Copy view link” box are hidden until the person presses Share. The button, the dialog, and the public page say Share. The table stays `library_shares`. The route stays `/view/[token]`. An upload link stays `/share/[token]`.
5. **A share page shows the pictures it contains.** Those images are served by the view token, for items already on that share. They do not reuse the signed-in deliverable media route.
6. **One status phrase on the card.** `needs_review` reads “Needs a look”. `changes_requested` reads “Changes asked”. The stored status values stay. Filters can still offer the finer staff states.
7. **Sources uses the Library grid.** An image file uses `/api/files/{id}/preview` when `thumbnailable` is true. Show in Library stays a button on that tile. Folder, scan, and download rules stay.
8. **No new table, no new approval write, no second calendar.**

## The screens

### Social rail

Each row is a square picture, about 4.5rem, then one line of title, then one line of status and deliverable name. The caption stays in the detail. A carousel shows the chosen still and a count when there is more than one image. The same picker feeds the calendar chip, so the chip and the rail show the same frame.

### Library

The first row is Needs a look, All, and search. Type tabs stay. Search and the other filters stay behind the disclosure that already exists.

A card is the picture at 4:3, the status chip on the picture, and one line of title under it. Clicking opens the finished-work page. Article cards keep their current article layout and use the same click rule.

The header line under the title is: “Files are everything uploaded. The Library is the work ready to look at.”

### Share

Share sits with the page actions. Pressing it turns on selection and opens the dialog that already creates the link. The public page leads with each picture, then the title, then Visit site, Read article, or Download when those already apply. The sentence on that page stays: the link is for looking, and it does not take uploads or comments.

### Sources

Same grid, same tile size. The name is one line under the picture. A file that cannot be a thumbnail keeps a type tile. The scan status and Show in Library sit on the tile.

## Build order

Each slice is shippable on its own. Tests are written first.

### 1. Pictures on the social rail

- Add `pictureRole` next to the social review types. Cover the preference order, a video-only piece, and a piece with no media.
- `ReviewList` renders an `img` only when `pictureRole` returns a role. The address is the detail pane’s media address. `onError` hides a broken image.
- Point `thumbnailRole` on calendar cards at `pictureRole` instead of the hardcoded `main`.
- Tests: an image role renders the media address; video-only renders no `img`; the calendar chip uses a poster when that role exists.

### 2. The Library card is the picture

- `previewSrc` uses the same role order. A later poster still wins over an earlier unrelated image.
- `ArtifactCard` wraps the plate and the title in the existing href. Remove the Review underline. The status chip uses “Needs a look” and “Changes asked”.
- Tests: a poster role becomes `previewSrc`; a needs-review card contains the work href and does not contain the link text Review.

### 3. Share is a mode, and the share page has pictures

- `LibraryGallery` starts with no checkboxes. Share reveals them and the existing dialog.
- Visible strings become Share. Assertions that require “Add to view link” and “Copy view link” move to the share-mode render.
- Add a view-token image route that authorizes the item the way `openViewLink` already authorizes the page, then streams the same object the deliverable media route streams.
- `PublicLibraryView` renders that image when the item has one.
- Tests: the default gallery has no checkbox; share mode still creates a link; a public item with an image renders the token image address; a token for a different share does not.

### 4. Sources and Files at a recognizable size

- `SourcesBrowser` renders the Library tile. Image names that `thumbnailable` accepts use `/api/files/{id}/preview`.
- The Files page `TypeTile` grows from 40px to the same square the rail uses, and keeps the file name beside it.
- Tests: a png row renders the preview address; a pdf row renders no preview image; Show in Library still posts.

### 5. Copy pass

- One map for the short status phrases, used by the Library chip and the social rail.
- Space header sentence from the screens section.
- README Library paragraph updated so it describes the pictures and the Share button.

## Out of scope

- Comments pinned to a video frame.
- A Library kanban.
- Approving from the grid without opening the piece.
- Renaming `/view/[token]`, `library_shares`, or the upload route `/share/[token]`.
- Generating stills from video. Until a poster image is stored, a video shows the Video tile.

## Verification when a slice ships

- `npx vitest run` on the files that slice touched.
- `npx tsc --noEmit` in `handoff/`.
- The social rail, the Library, and a share page opened in the browser, with a piece that has an image and a piece that does not.
