# Handoff Library, article sharing, and social promotion

Status: Draft for review

## Executive summary

**Feature:** Client work Library
**Feature ID:** HLS
**Surfaces:** Handoff client space, Handoff HQ, finished work, files, Zernio-backed social publishing
**Implementation:** [Handoff Library implementation plan](../plans/2026-10-21-handoff-library-and-sharing.md)
**Builds on:** [Handoff portal](2026-10-05-handoff-portal-design.md), [social publishing](2026-10-21-social-publishing-design.md), and [agent-managed social publishing](2026-10-21-agent-managed-social-publishing-design.md)

Handoff should present completed work as a client-facing Library, not as three unrelated destinations for files, finished work, and social operations. A client should be able to find an article, open its published URL, copy that URL, review its source files, see the social posts promoting it, and share a polished read-only Handoff page without understanding how the work was stored.

The Library is a read model over existing records. It does not replace deliverables, built work, files, or social posts. It gives those records one visual language and explicit relationships.

Two kinds of URL are intentionally different:

1. A **canonical artifact URL** is where an article, website, video, or post is publicly available.
2. A **Handoff view link** is a revocable, read-only presentation of selected finished work for a stakeholder who may not have a Handoff account.

The existing `/share/[token]` link remains upload-only. It must never be reused for read-only work sharing.

Zernio remains the social distribution provider. Handoff does not use Zernio to publish blog articles. An article may create a social-promotion draft that contains the article URL, platform copy, and approved media; that draft follows the existing review and Zernio publishing lifecycle.

## Problem

The current implementation has the necessary records but fragments the experience:

- Files are presented primarily as storage paths.
- Finished Work is a separate list with only title, kind, status, and Open.
- Built websites appear on the space home rather than beside other completed work.
- Zernio status and public post URLs appear mainly in Social history.
- A blog article can carry `link_url`, but the client sees a generic “Open link.”
- Finished-work review is a long page with bulk approval before the content.
- Public upload links and public presentation links are not distinct product concepts.
- There is no explicit provenance between source files, the delivered artifact, and its promotion posts.

The result is technically complete but hard to understand. Clients must know where the system stored something instead of finding it by what it is.

## Goals

1. Make completed work easy to scan, open, review, download, and share.
2. Give articles, websites, social posts, videos, images, documents, and files appropriate visual cards.
3. Make canonical public URLs first-class, safe, and easy to copy.
4. Show approval and publishing state together without merging them into one ambiguous status.
5. Show Zernio target outcomes and public URLs on the work they came from.
6. Let staff create social-promotion drafts from an article without publishing the article through Zernio.
7. Provide revocable read-only presentation links that are separate from upload links.
8. Preserve workspace isolation, held-work visibility, versioning, and existing social safeguards.
9. Improve review ergonomics for large finished-work collections.
10. Keep existing file and finished-work deep links valid during migration.

## Non-goals

- Publishing articles to WordPress, Wix, or another CMS.
- Pinterest-specific creation or publishing workflows.
- Replacing Zernio or letting routes call Zernio directly.
- Replacing R2 file storage or the existing malware-scan lifecycle.
- Turning every raw file into a client-facing artifact.
- Public indexing, search-engine discovery, or an unauthenticated client portal.
- Anonymous approval or comments in the first read-only-share release.
- Editing article bodies inside Handoff.
- Automatically publishing social posts when a promotion draft is created.
- Automatically adding tracking parameters to a canonical URL.
- Rebuilding the task board or project lifecycle.

## Product principles

### Organize by meaning, not storage

A client looks for “Q4 launch article,” not `Finished work/2026-10-21/q4-launch/summary.md`. Folder paths remain useful in Sources, but the primary Library uses artifact cards.

### One artifact, several representations

An article may have:

- a canonical URL;
- a hero image;
- a source document;
- an approved deliverable item;
- several promotion posts;
- Zernio target outcomes;
- a read-only Handoff view link.

The Library keeps these representations connected without copying them into one overloaded table.

### Approval and publication are separate

“Approved” means the client accepted the content. “Published” means an external destination is live. An artifact may be approved but not published, or published to one destination while another target needs attention.

### Safe links are deliberate

A signed R2 download URL is not a share link. It expires and exposes a file, not a presentation. A Handoff view link is explicitly created, scoped, revocable, and audited.

### Client language hides providers

Client-facing copy says “Social accounts,” “Scheduled,” and “Published.” It does not name Zernio. HQ may show provider diagnostics where useful.

### Existing workflows continue to work

The Library is additive. Existing direct `schedule_social`, staff Post to social, client approval, webhook reconciliation, cron fallback, and agent social plans retain their current behavior until separately migrated.

## Terms

- **Library:** The client-facing collection of completed and publishable work.
- **Artifact:** A meaningful unit in the Library, projected from a deliverable item, built-work row, or selected clean file.
- **Collection:** A deliverable and its published version, containing one or more artifacts.
- **Canonical URL:** The authoritative external URL for an article, website, video, or other published artifact.
- **Destination URL:** A public URL created by a publishing destination, such as a LinkedIn post URL returned through Zernio.
- **Handoff view link:** A tokenized read-only page for selected finished work.
- **Source:** A raw file or repository-backed file used to produce an artifact.
- **Promotion:** A social artifact whose purpose is to distribute another artifact.
- **Provenance relation:** A typed connection such as `source_of`, `promotes`, or `supersedes`.

## Actors and permissions

| Action | Staff | Client owner | Client member | Public view-link visitor |
| --- | --- | --- | --- | --- |
| View released Library artifacts | Yes | Yes | Yes | Selected artifacts only |
| View held or retired work | Assigned staff | No | No | No |
| View internal notes and repo links | Staff | No | No | No |
| Open/copy canonical URL | Yes | Yes | Yes | If included |
| Download released source file | Yes | Yes | Yes | Only when share allows downloads |
| Review or approve work | Yes | Yes | Yes | No in MVP |
| Create/edit canonical metadata | Yes | No | No | No |
| Create social promotion draft | Yes | No | No | No |
| Schedule approved social promotion | Authorized staff/agent | Existing client behavior | Existing client behavior | No |
| Create/revoke Handoff view link | Yes | Yes | No | No |
| See view-link access history | Yes | Yes | No | No |

Existing workspace authorization remains authoritative. A caller who cannot see a workspace receives 404, not information about the resource.

For these features, staff means a super-admin or an operator assigned to the workspace. Add explicit `view_link.manage`, `article_promotion.create`, and `library_file.select` authorization actions. A foreign or unseen authenticated resource returns 404; a caller who can see the workspace but lacks the requested action receives 403. Public expired, revoked, disabled, or otherwise unavailable view resources all return the same generic 404 page. Unlock throttling returns 429 without confirming whether a passcode was close or correct.

## Information architecture

### Client navigation

The target navigation is:

- **Overview**
- **Library**
- **Calendar**
- **People**

Library includes:

- **All**
- **Articles**
- **Social**
- **Video**
- **Images**
- **Websites**
- **Documents**
- **Sources**

Implementation may retain the current navigation labels during rollout:

- `/w/[slug]/work` remains a compatibility route and redirects to or renders the Library.
- `/w/[slug]` continues to support existing file deep links.
- `/w/[slug]/social` remains the detailed account/calendar operations route.

The first release may add Library without renaming every navigation item. Route compatibility is required.

### Staff client page

The Files & spaces tab gains:

- recent finished work;
- counts by artifact type;
- items needing review;
- links to the client Library and Sources;
- recent view links and their state.

The existing deliverable page remains the detailed staff editor and social-publishing entry point.

## Library read model

The Library service returns a discriminated union. It does not force all sources into one database table.

```ts
type LibraryArtifact =
  | DeliverableArtifact
  | BuiltWorkArtifact
  | SourceFileArtifact;

type LibraryArtifactBase = {
  artifactKey: string;
  sourceKind: "deliverable_item" | "built_work" | "file";
  sourceId: string;
  workspaceId: string;
  organizationId: string;
  title: string;
  artifactType:
    | "article"
    | "social"
    | "video"
    | "image"
    | "website"
    | "document"
    | "file";
  thumbnail: LibraryThumbnail | null;
  deliveredAt: number | null;
  updatedAt: number;
  visibility: "client" | "held" | "retired";
  primaryStatus: LibraryStatus;
  actions: LibraryAction[];
};
```

Stable keys use a source prefix, for example:

- `deliverable_item:<id>:<version>`
- `built_work:<id>`
- `file:<id>`

The service resolves client visibility before projecting records. Held, withdrawn, superseded, deleted, or unreleased records never enter the client/public projection.

An explicitly selected file is recorded in `library_file_selections`; being clean or present in a folder is not enough to enter the Library. Removing a selection retires only the Library projection and does not delete the file or its provenance relations.

### Artifact-type derivation

| Existing source | Library type |
| --- | --- |
| `deliverable_items.format = link` plus article metadata | Article |
| `deliverable_items.format = link` without article metadata | Document; a link card is its presentation variant |
| Social item formats | Social |
| Video formats/media | Video |
| Static/carousel image media without social channel | Image |
| `deliverable_items.format = page/file` | Document |
| `built_work` | Website |
| Explicitly selected clean file | File |

Type derivation is deterministic and covered by pure tests. Metadata may override only within an allowlisted set.

## Status model

The Library shows one prominent next-action status and preserves detailed dimensions.

### Approval status

- Draft
- Needs review
- Changes requested
- Approved

### Publication status

- Not published
- Ready
- Scheduled
- Publishing
- Published
- Partially published
- Needs attention

### Primary status precedence

1. Changes requested
2. Needs attention
3. Needs review
4. Publishing
5. Scheduled
6. Partially published
7. Published
8. Ready
9. Approved
10. Draft

“Partially published” displays successful destination links and failed/blocked targets together. It is never flattened to “Published.”

## Library cards

Every card includes:

- preview or type illustration;
- title;
- artifact-type label;
- delivered or published date;
- primary status;
- approval progress when the card represents a collection;
- version when more than one released version exists;
- primary action appropriate to state;
- secondary actions in an overflow menu;
- destination chips where applicable.

### Primary-action examples

| State/type | Primary action |
| --- | --- |
| Article with canonical URL | Read article |
| Website live | Visit site |
| Needs review | Review |
| Changes requested | View request |
| Social scheduled | View schedule |
| Social published | Open post |
| Video/image/document | Preview |
| Source file | Open file |

### Empty and loading states

- Empty Library: “Finished work will appear here after the studio sends it.”
- Empty filter: “No articles yet.” plus Clear filters.
- Search with no result: restate the query and offer Clear search.
- Card data failure: keep other cards visible and show a retry row, not a blank page.

## Article artifact

An article is a first-class deliverable item with `format = link` and article metadata.

### Article fields

| Field | Required | Meaning |
| --- | --- | --- |
| `headline` | Yes | Client-facing title; defaults to deliverable item title. |
| `canonical_url` | For Published | Public article URL; stored separately from tracking URLs. |
| `dek` | No | Short excerpt or summary. |
| `hero_media` | No | Existing deliverable media role, normally `main` or `poster`. |
| `publisher_name` | No | Human-readable publication/CMS label. |
| `author_name` | No | Display author. |
| `published_at` | For Published | External publication date. |
| `article_status` | Yes | `draft`, `review`, `approved`, `published`, `updated`, `archived`. |
| `source_file_id` | No | Clean source document in the same workspace. |
| `seo_title` | No | Staff-only metadata in MVP. |
| `seo_description` | No | Staff-only metadata in MVP. |

Only HTTP(S) URLs are accepted. Production staff writes require HTTPS. The UI shows the hostname but opens the full canonical URL.

### Article card

The article card shows:

- hero image, or an article illustration fallback;
- headline and dek;
- publisher hostname;
- author and publication date when present;
- approval and article status;
- destination chips for promotion posts;
- Read article;
- Copy link;
- Review, when action is required;
- Create social promo, for authorized staff.

Copy link copies the canonical URL exactly. It does not copy a signed file URL or add tracking parameters.

## Canonical and destination links

### Canonical link behavior

- Open in a new tab with `noopener noreferrer`.
- Display a normalized hostname without hiding the destination.
- Copy through a client interaction with success/failure feedback.
- Reject `javascript:`, `data:`, credentials in the URL, and malformed URLs.
- Preserve the stored URL path, query, and fragment.
- Record edits to canonical metadata in activity without logging the full query string.

### Destination links

`social_posts.published_urls` remains the source for public social links. The Library projection maps those URLs to target chips:

- LinkedIn · Published · Open
- Instagram · Published · Open
- X · Failed · Retry

Client views omit provider error internals. Staff views may include the normalized provider reason and recovery action.

## Handoff view links

### Route and semantics

Read-only presentation links use:

```text
/view/[token]
```

They are separate from:

```text
/share/[token]   # existing upload access
```

The product labels them:

- “Copy view link” for read-only presentation.
- “Copy upload link” for the existing upload capability.

No UI uses the generic label “Share link.”

### Link creation

A creator selects:

- one collection, one artifact, or several artifacts in the same workspace;
- expiry: 1 day, 7 days, 30 days, or no expiry;
- allow downloads: off by default;
- optional passcode;
- custom title;
- whether canonical/destination links are visible.

MVP view links are read-only. Approval and comments require sign-in and remain on the client route.

### Version pinning

A view link pins:

- deliverable ID and published version;
- selected deliverable item IDs;
- built-work IDs;
- file IDs.

A later version does not silently replace what the sender shared. The creator sees “A newer version is available” and may update the share through an explicit action that creates an audit entry.

### Security

- Generate at least 256 bits of randomness.
- Store only a SHA-256 token hash.
- Return the raw token only at creation time.
- Scope every selected resource to one workspace.
- Check held/deleted/superseded state on creation and access.
- A revoked or expired link returns a generic unavailable page.
- Passcodes are slow-hashed and rate-limited.
- Production creation and unlock fail closed when the `HANDOFF_SHARE_HASH_PEPPER` Worker secret is absent.
- Access logs store share ID, time, coarse user agent, and a privacy-preserving IP hash; never the token.
- Downloads are proxied or signed only after share authorization and use short TTLs.
- `robots` is `noindex, nofollow`.
- CSP prevents embedding by untrusted origins.
- Public pages contain no staff notes, agent IDs, repo URLs, task IDs, or unpublished versions.

## Zernio-backed social promotion

### Boundary

Handoff publishes the article elsewhere or records the already-published URL. Zernio receives only social promotion content.

The following are forbidden:

- sending an article body to Zernio as a blog post;
- presenting WordPress or Wix as a social destination;
- marking the article Published because a promotion post published;
- publishing a promotion before normal content approval;
- bypassing the social command or plan layer.

### Create social promo flow

1. Staff opens a published or approved article.
2. Staff selects Create social promo.
3. Handoff creates a draft social collection or adds draft social items to a selected collection.
4. Each item references the article through `promotes`.
5. Suggested copy includes the canonical URL.
6. Staff selects hero media or an existing social crop.
7. Staff reviews platform variants and destinations.
8. The draft follows existing client approval.
9. Authorized staff/agent schedules through the existing Zernio workflow.
10. Zernio outcomes appear on both the social piece and the source article.

Creating a promo performs no external write.

The local draft transaction is exact:

1. If no target is supplied, create a `deliverables` row with `kind = social_pack`, `status = draft`, `version = 1`, and `published_version = NULL`. If a target is supplied, it must be a same-workspace draft `social_pack`; use its current working version.
2. Insert one pending `deliverable_items` row per platform at that working version.
3. Insert or update the matching `social_variants` row, including the reviewed outbound URL in `options_json`.
4. Create or update the draft `social_collections` row pointing to that deliverable.
5. Insert version-pinned `promotes` relations from each social item/version to the article item/version.
6. Persist the idempotency result and return the local IDs.

These statements commit together through `Sql.batch`; any failure rolls back the entire draft. The client reviews it through the existing `/w/[slug]/work/[id]` flow. After approval, staff may use the existing Post to social form, or an authorized agent may use the existing prepare/execute plan route. Creation itself never calls `sendPieces`, `autoScheduleApproved`, or the Zernio adapter.

### Tracking URLs

The promotion builder may offer UTM parameters:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`

The canonical URL remains unchanged. Each promotion target stores its derived outbound URL in variant/options metadata. The review step displays the exact outbound URL before scheduling.

### Relationship display

On an article:

- “Promoted by 4 posts”
- destination chips with schedule/outcome
- Open post for published targets
- View promotion collection

On a social piece:

- “Promotes: Article title”
- Read article
- outbound URL preview

## Review experience

### Collection header

The finished-work detail header shows:

- collection title and type;
- delivered date;
- version;
- `N of M reviewed`;
- approved, changes-requested, and pending counts;
- Share/View-link action;
- sticky progress/action bar on long pages.

### Item review

- Each item visibly shows its approval status.
- Change-request input is collapsed until Ask for changes is selected.
- Approve is on the item card.
- Approve all appears after the item list or in a sticky footer after review progress.
- Approve all names the count and never includes already-requested changes without warning.
- Social items use the same in-situ preview for staff and clients. A Facebook destination looks like a Facebook post: page header, caption above the media, then Like, Comment, and Share. An Instagram destination looks like an Instagram post: profile header, media first, caption underneath. A carousel stays one slide at a time, with the count, dots, and previous and next controls, inside whichever network frame it belongs to. Reels, Shorts, and Stories use a tall 9:16 frame. Several destinations produce several frames. A piece with no destination yet still uses its format frame, so a carousel does not become a stack of files.
- Article items use the article card, not a generic link row.
- Keyboard focus moves to confirmation/error feedback after submission.

Approval does not silently publish. Existing publishing-cadence wording remains explicit where auto-schedule is enabled.

## Search, filtering, and sorting

### Search

Search matches:

- title/headline;
- excerpt;
- section/campaign;
- hostname;
- file name for Sources;
- destination platform/account display name.

MVP search may be server-side SQL `LIKE` over bounded client data. It must not expose held records through counts or suggestions.

### Filters

- artifact type;
- status;
- delivered/published date;
- project;
- destination platform;
- needs action;

### Sort

- Recently delivered (default)
- Recently updated
- Published date
- Title
- Needs action first

Filter and sort state live in the URL query so a signed-in user can deep-link to a Library view.

## Sources and provenance

Sources is the file-oriented view. It retains:

- folder tree;
- preview/download safety;
- scan status;
- file type;
- upload batch and request.

It adds:

- breadcrumbs;
- search;
- type/source/date filters;
- sort;
- deep links to a folder or file;
- “Used in” artifact links;
- “Delivered as” collection links.

The Library never exposes a clean file automatically. Staff or an artifact relation must classify it as a source or selected file artifact.

## Data model

### Existing records retained

- `deliverables`
- `deliverable_items`
- `deliverable_feedback`
- `built_work`
- `files`
- `batches`
- `agent_work_items`
- `social_posts`
- `social_post_targets`
- `social_attention_items`
- `social_variants`

### `deliverable_artifact_metadata`

Type-specific metadata for a deliverable item/version.

| Field | Meaning |
| --- | --- |
| `id` | Metadata row ID. |
| `organization_id`, `workspace_id` | Ownership boundary and indexed filter. |
| `deliverable_id`, `item_id`, `version` | Exact artifact version. |
| `artifact_type` | Allowlisted Library type. |
| `dek` | Client-facing excerpt. |
| `canonical_url` | Authoritative external URL. |
| `publisher_name`, `author_name` | Optional article display metadata. |
| `external_published_at` | External publication time. |
| `article_status` | Optional article lifecycle. |
| `source_file_id` | Optional source in the same workspace. |
| `seo_title`, `seo_description` | Staff metadata. |
| `created_by`, `created_at`, `updated_at` | Audit. |

Unique key: `(item_id, version)`.

`deliverable_items.link_url` remains supported. Read order during migration:

1. metadata `canonical_url`;
2. existing `link_url`;
3. no canonical URL.

Writes update both `canonical_url` and `link_url` during compatibility rollout. The metadata table becomes authoritative only after parity tests and backfill review.

### `artifact_relations`

| Field | Meaning |
| --- | --- |
| `id` | Relation ID. |
| `organization_id`, `workspace_id` | Ownership boundary. |
| `source_kind`, `source_id`, `source_version` | Origin resource; version is non-null and `0` means an unversioned source. |
| `target_kind`, `target_id`, `target_version` | Related resource; version is non-null and `0` means an unversioned target. |
| `relation_kind` | `source_of`, `promotes`, `derived_from`, `supersedes`. |
| `created_by_kind`, `created_by_id`, `created_at` | Audit. |

Uniqueness prevents duplicate relations. Both ends must resolve to the same organization and workspace before insertion.

Because the relation endpoints are polymorphic, endpoint existence, version identity, and same-workspace ownership are transactional service invariants rather than ordinary foreign keys. Deleting a source record is refused while a relation is active; normal product retirement uses the source record's existing hidden/retired state. Tests cover orphan endpoints, cross-workspace endpoints, and duplicate unversioned relations.

### `library_file_selections`

| Field | Meaning |
| --- | --- |
| `id`, `workspace_id`, `file_id` | Append-only selection event and selected clean file. |
| `selected_by`, `selected_at` | Audit for adding it to the Library. |
| `revoked_by`, `revoked_at` | Audit for removing it from the Library without deleting it. |

An active partial unique index on `(workspace_id, file_id) WHERE revoked_at IS NULL` permits only one active selection while preserving every select/revoke cycle. Reselecting after revocation inserts a new row. Only staff with `library_file.select` may select or revoke a file in the first release. Selection verifies same-workspace ownership and `clean` scan state. A later unsafe scan state immediately removes the file from signed-in and public projections even if the selection remains for audit.

### `library_shares`

| Field | Meaning |
| --- | --- |
| `id` | Share ID. |
| `organization_id`, `workspace_id` | Ownership boundary. |
| `token_hash` | Unique SHA-256 hash; raw token is never stored. |
| `title` | Optional presentation title. |
| `expires_at`, `revoked_at` | Availability. |
| `passcode_hash` | Optional slow hash. |
| `allow_downloads` | Default false. |
| `show_external_links` | Default true. |
| `created_by_kind`, `created_by_id`, `created_at`, `updated_at` | Audit. |

### `library_share_items`

| Field | Meaning |
| --- | --- |
| `share_id` | Parent share. |
| `public_id` | Random 128-bit opaque ID used in public routes; unique within the share. |
| `resource_kind` | `deliverable_item`, `built_work`, or `file`. |
| `resource_id` | Selected record. |
| `resource_version` | Non-null published version; `0` for unversioned built work and files. |
| `sort` | Presentation order. |

Unique key: `(share_id, resource_kind, resource_id, resource_version)`.

`share_id` has an ordinary foreign key to `library_shares` with delete restricted; product deletion is revocation so audit history remains. Polymorphic resource identity is validated by the share service rather than foreign keys.

### `library_share_events`

Records `created`, `opened`, `downloaded`, `updated`, and `revoked` without tokens or content.

### `library_share_unlock_attempts`

Stores one atomic attempt window per `(share_id, ip_hash)` with count, window start, and blocked-until time. `ip_hash` is HMAC-SHA-256 over the normalized client IP using the `HANDOFF_SHARE_HASH_PEPPER` Worker secret; raw IPs are never stored.

Passcodes use versioned PBKDF2-HMAC-SHA-256 with a random 128-bit salt, 310,000 iterations, and a 32-byte derived key. Verification is constant-time. Five failures in 15 minutes block that share/IP pair for 15 minutes and return 429.

### `library_share_unlock_sessions`

A successful unlock clears the attempt window, generates a separate 256-bit session token, stores only its SHA-256 hash with `share_id`, creation time, and a 30-minute expiry, and returns the raw token in a cookie that is `HttpOnly`, `Secure`, and `SameSite=Lax`. Every protected read resolves the cookie hash to the same share and rechecks share expiry/revocation; a forged, cross-share, expired, or replayed-after-revocation cookie is rejected. The raw view token and passcode are never stored in this session.

### `article_promotion_idempotency`

Stores actor kind/ID, external ID, source item/version, response JSON, and creation time. The unique key `(actor_kind, actor_id, external_id)` makes repeated creation return the same local draft. It is written in the same batch as the deliverable, items, variants, collection, and relations.

## Service contracts

### Library query

```ts
listLibraryArtifacts(sql, caller, {
  workspaceId,
  type,
  status,
  projectId,
  platform,
  needsAction,
  search,
  sort,
  cursor,
}): Promise<LibraryPage>
```

The query:

- authorizes the workspace first;
- loads source families independently in parallel;
- projects and merges them;
- filters client-invisible records before counts;
- returns a stable cursor and filter counts;
- limits pages to 24 artifacts.

Each source family seeks on the same normalized cursor tuple: `(sort_value, source_family_rank, source_id, source_version)`. Source family rank is fixed as deliverable item, built work, then selected file. Every family applies its equivalent seek predicate and over-fetches; the service merges and refills until it has 24 visible records or every family is exhausted. Exact filter counts come from separate scoped `COUNT` queries per family and are summed only after visibility conditions are applied. Tests cover tied timestamps/titles, a page dominated by one family, inserts at a page boundary, and exact filtered counts.

### Article metadata mutation

Staff server action:

```ts
saveArtifactMetadata({
  deliverableId,
  itemId,
  version,
  expectedUpdatedAt,
  artifactType,
  canonicalUrl,
  dek,
  publisherName,
  authorName,
  externalPublishedAt,
  articleStatus,
  sourceFileId,
})
```

Returns 409 on stale version/metadata and 404 across workspace boundaries.

### View-link API

Authenticated creation:

```http
POST /api/workspaces/{workspaceId}/view-links
```

```json
{
  "title": "Q4 launch work",
  "expires_in": "7d",
  "allow_downloads": false,
  "show_external_links": true,
  "passcode": null,
  "items": [
    {
      "resource_kind": "deliverable_item",
      "resource_id": "item-id",
      "resource_version": 3
    }
  ]
}
```

The response contains the full URL once. Listing shares never returns tokens.

Authenticated management:

```http
GET    /api/workspaces/{workspaceId}/view-links
PATCH  /api/workspaces/{workspaceId}/view-links/{shareId}
DELETE /api/workspaces/{workspaceId}/view-links/{shareId}
```

`DELETE` revokes; it does not erase the audit row.

Public access:

```http
GET  /view/{token}
POST /view/{token}/unlock
GET  /view/{token}/files/{shareItemPublicId}
```

The download route resolves only by `(share_id, library_share_items.public_id)`. It never accepts or returns an internal file ID. No public endpoint returns internal IDs beyond opaque route parameters.

### Create-promotion command

```ts
createArticlePromotionDraft(sql, actor, {
  sourceItemId,
  sourceVersion,
  targetDeliverableId?,
  platforms,
  mediaSelection,
  tracking,
  externalId,
}): Promise<PromotionDraftResult>
```

The command is idempotent, creates local draft records only, and writes `promotes` relations. Scheduling remains a separate social plan/direct-send operation.

## Error behavior

| Condition | Expected behavior |
| --- | --- |
| Canonical URL missing | Article card shows Preview/Review, not Read article. |
| Canonical URL invalid | Save refused with field error; stored legacy value is shown as unavailable. |
| External site is down | Handoff still shows the URL; no false unpublished state. |
| Clipboard denied | Selectable URL and “Could not copy” feedback. |
| Zernio target partially failed | Successful links remain; failed targets show Needs attention. |
| Promotion already exists | Return existing draft through idempotency key; do not duplicate. |
| Article version changes | Existing promotions and view links remain pinned to their source version. |
| Share expired/revoked | Generic unavailable page with no workspace details. |
| Share contains removed work | Omit unavailable item; if none remain, show unavailable page. |
| Share passcode repeated failures | Rate limit with generic retry message. |
| Download disabled | File action is absent and direct share download returns 404. |
| Held work selected | Creation refused; public route never resolves it. |
| File scan no longer clean | Public download closes immediately. |
| Social provider unavailable | Article remains usable; promotion card shows provider unavailable only to staff. |
| Search query is too long | Clamp/refuse before SQL; never interpolate raw SQL. |

## Accessibility and responsive behavior

- Cards and filters are fully keyboard operable.
- Status is conveyed by text, not color alone.
- Copy actions announce success in an `aria-live` region.
- Filter controls have visible labels and a Clear all action.
- Touch targets are at least 44 CSS pixels.
- Article hero images have meaningful alt text or an empty alt for decorative fallbacks.
- Mobile uses one card column and a bottom/sticky review action bar that does not cover content.
- Long URLs wrap safely and never force horizontal page scrolling.
- Reduced-motion preferences disable nonessential card transitions.
- Public view pages retain the same readable typography and contrast as the client space.

## Performance requirements

- First Library page: p95 server response under 1 second for a workspace with 1,000 source records.
- Filter/search update: p95 under 750 ms.
- Page size: 24 artifacts; no unbounded source or social query.
- Card thumbnails use lazy loading and existing preview routes.
- Do not fetch full file bodies or article pages to build Library cards.
- Social destination state is read from local reconciled records; opening Library must not call Zernio.
- Independent read-model queries run concurrently.
- Public view page loads only its selected pinned resources.

## Metrics

Record counts without content, tokens, or full URLs:

- Library opened;
- artifact opened by type;
- canonical link opened/copied;
- review started/completed;
- time from delivered to reviewed;
- view link created/opened/revoked;
- view-link download attempted/completed;
- promotion draft created;
- time from article publication to first promotion scheduled;
- promotion outcome by platform;
- Library search with zero results.

## Acceptance criteria

### Library

- [ ] Client members can browse visual artifacts by type without navigating storage folders.
- [ ] Existing released deliverables, built work, and selected files appear through one read model.
- [ ] Held, withdrawn, superseded, deleted, or foreign-client records never appear.
- [ ] Search, filters, sort, and pagination preserve workspace isolation.
- [ ] Existing finished-work and file deep links continue to work.

### Articles and URLs

- [ ] An article card shows headline, excerpt, hero, hostname, author/date when present, and clear status.
- [ ] Read article opens the canonical URL safely.
- [ ] Copy link copies the exact canonical URL and reports success/failure.
- [ ] Existing `link_url` articles work before metadata backfill.
- [ ] Canonical and tracked promotion URLs remain separate.

### Zernio integration

- [ ] Article cards show scheduled/published/failed promotion destinations from local social records.
- [ ] Published targets expose their public URLs.
- [ ] Partial outcomes remain visibly partial.
- [ ] Create social promo creates local drafts and relations without calling Zernio.
- [ ] Promotion drafts include the exact article URL and follow normal approval.
- [ ] Scheduling uses the existing guarded social workflow.
- [ ] Blog publishing, WordPress, Wix, and Pinterest-specific behavior are absent.
- [ ] Existing direct `schedule_social` behavior remains intact.

### View links

- [ ] View links are read-only and use a route distinct from `/share/[token]`.
- [ ] The UI clearly distinguishes Copy view link from Copy upload link.
- [ ] Tokens are random, hash-only at rest, revocable, and optionally expiring/passcode protected.
- [ ] Shares pin exact artifact versions.
- [ ] Public pages expose no internal notes, IDs, repo links, held work, or provider credentials.
- [ ] Download permission defaults off and is enforced server-side.
- [ ] Revoked/expired links and unauthorized downloads fail closed.

### Review and Sources

- [ ] Every item visibly shows approval state.
- [ ] Review progress shows `N of M reviewed`.
- [ ] Change-request fields stay collapsed until chosen.
- [ ] Bulk approval appears after review context and names its scope.
- [ ] Sources support breadcrumbs, search/filter/sort, and Used in links.
- [ ] Client and staff social previews show the same media, copy, and target state inside the matching network frame.
- [ ] Facebook, Instagram, and other destinations are visually distinct, and a carousel shows one slide at a time with count, dots, and previous/next controls.

### Quality

- [ ] Pure derivation, authorization, URL, token, projection, and relation logic has unit coverage.
- [ ] Database tests cover migrations, constraints, workspace isolation, and version pinning.
- [ ] Route/action tests cover the specified 404, 403, 409, and 429 behavior.
- [ ] Accessibility tests cover names, focus, status, and keyboard use.
- [ ] Existing deliverable, file, social, and agent test suites remain green.
- [ ] README and changelog describe shipped behavior only.

## Rollout

1. Ship Library read models and enhanced finished-work cards with no route rename.
2. Enable article metadata and canonical URL cards; read existing `link_url`.
3. Add local social destination projection to artifact cards.
4. Add Library route, filters, search, and Sources tab.
5. Add read-only view links for internal clients behind `LIBRARY_VIEW_LINKS`.
6. Add Create social promo behind `ARTICLE_SOCIAL_PROMO`.
7. Improve collection review and file provenance.
8. Rename navigation only after route analytics and support feedback confirm parity.
9. Remove the nonfunctional composer or expose it only when plan execution is usable.

Feature flags default off for public view links and promotion creation. Read-only Library improvements do not require a flag.

## Open product decisions

1. Should client owners create view links, or staff only for the first release?
2. Should view links support a branded message from the sender?
3. Should one view link allow items from several projects in the same space?
4. When a newer artifact version exists, should updating a share preserve the old URL or issue a new one?
5. Should clients be allowed to create a promotion request without creating the draft?
6. Should article metadata be editable in Handoff or only supplied by agent/repository manifests?

Recommended defaults:

- staff and client owners may create view links;
- support a short presentation title, not a free-form message, in MVP;
- allow several projects only when every item belongs to the same workspace;
- updating selected versions preserves the URL and writes an audit event;
- clients may request promotion later, but only staff create drafts in MVP;
- staff and trusted filing/manifest paths may write article metadata.
