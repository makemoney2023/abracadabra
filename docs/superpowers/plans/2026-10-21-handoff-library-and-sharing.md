# Handoff Library and sharing implementation plan

> **For agentic workers:** Implement one task at a time. Write the failing test first, confirm the intended failure, and make the smallest complete change. Do not start the next task while the current task is red.

**Goal:** Turn Files and Finished Work into one client-facing Library where people can find, review, open, copy, and safely share completed work, including canonical blog article URLs and the Zernio-backed social posts that promote them.

**Architecture:** Build an authorized Library read model over existing deliverable items, built work, selected clean files, and local social records. Add article metadata, typed artifact relations, and version-pinned read-only view links without replacing source tables or existing routes. Article promotion creates local social drafts only; existing approval and Zernio scheduling paths remain authoritative.

**Tech stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, D1 migrations, R2, existing Handoff authorization/session helpers, and existing Zernio-backed social commands and queries.

**Design:** [`docs/superpowers/specs/2026-10-21-handoff-library-and-sharing-design.md`](../specs/2026-10-21-handoff-library-and-sharing-design.md)

---

## Repository boundary

Implementation is in [`handoff/`](../../../handoff/). The Library is additive to the current client and HQ applications.

Commit as `makemoney2023 <124006256+makemoney2023@users.noreply.github.com>` by passing `GIT_AUTHOR_*` and `GIT_COMMITTER_*` on every commit. Do not change git config.

## Requirements

| ID | Requirement |
| --- | --- |
| HLS-001 | Project released deliverables, built work, and explicitly selected clean files into one authorized Library read model. |
| HLS-002 | Exclude held, withdrawn, superseded, deleted, unreleased, and cross-workspace records before counts, search, and pagination. |
| HLS-003 | Derive stable artifact types, keys, primary statuses, actions, and thumbnails from existing records. |
| HLS-004 | Treat articles as first-class artifacts with safe canonical URLs and compatibility reads from `deliverable_items.link_url`. |
| HLS-005 | Keep approval state separate from external publication state and preserve partial social outcomes. |
| HLS-006 | Show social destination state and public post URLs from local reconciled records without calling Zernio during Library reads. |
| HLS-007 | Preserve `/w/[slug]/work`, current deliverable detail links, file links, and `/w/[slug]/social` during rollout. |
| HLS-008 | Provide search, filters, sorting, stable pagination, URL query state, and useful empty/error states. |
| HLS-009 | Create revocable, expiring, optional-passcode read-only view links on `/view/[token]`, separate from upload links on `/share/[token]`. |
| HLS-010 | Pin every view link to exact artifact versions and default public downloads to off. |
| HLS-011 | Expose no staff notes, internal IDs, repo links, held work, secrets, tokens, or provider internals on public pages. |
| HLS-012 | Let authorized staff create idempotent article-promotion drafts and `promotes` relations without an external write. |
| HLS-013 | Keep normal approval and existing guarded Zernio scheduling mandatory for every promotion. |
| HLS-014 | Improve long collection review with visible per-item status, progress, contextual bulk actions, and accessible feedback. |
| HLS-015 | Improve Sources with breadcrumbs, search/filter/sort, deep links, and provenance to finished artifacts. |
| HLS-016 | Hide or remove the currently nonfunctional publishing composer until it executes a real prepared plan. |
| HLS-017 | Keep client-facing language provider-neutral and product copy short and plain. |
| HLS-018 | Roll out view links and article promotion behind independent default-off feature flags. |

## Global constraints

- Do not publish articles through Zernio.
- Do not add WordPress, Wix, or Pinterest-specific workflows.
- Do not route existing `schedule_social`, staff Post to social, cadence, webhook, cron, or agent-plan behavior through a new Library abstraction.
- Do not make approval silently publish except where the existing explicit cadence behavior already applies.
- Do not reuse `/share/[token]`; it authenticates an upload-capable visitor and retains that exact meaning.
- Authorize the workspace before querying source families. A foreign or unavailable workspace returns 404.
- Public view authorization fails closed on every request, including file download. Public unavailable resources return a generic 404; passcode throttling returns 429.
- Use exact artifact versions in metadata, relations, promotions, and view links.
- Library cards read social state from D1. Opening the Library never calls Zernio.
- Do not fetch external article pages or full R2 file bodies to build cards.
- Add database isolation tests with every new workspace-scoped table.
- Preserve existing `link_url` reads until metadata backfill and parity are verified.
- Use one logical commit per completed task.

## Intended file structure

Names may be adjusted to match nearby conventions, but responsibilities must stay separate.

| Path | Responsibility |
| --- | --- |
| `handoff/src/lib/library-artifacts.ts` | Pure artifact type, key, status, action, and thumbnail projection. |
| `handoff/src/lib/library-queries.ts` | Authorized, paginated Library and filter-count read model. |
| `handoff/src/lib/artifact-metadata.ts` | Validate and write article/type metadata with compatibility behavior. |
| `handoff/src/lib/artifact-relations.ts` | Same-workspace typed provenance and promotion relations. |
| `handoff/src/lib/library-shares.ts` | Token, PBKDF2 passcode, attempt limiting, expiry, revocation, version pinning, and public projection. |
| `handoff/src/lib/article-promotions.ts` | Idempotent local article-to-social draft creation. |
| `handoff/src/components/library/*` | Artifact cards, filters, URL actions, view-link dialog, and public presentation. |
| `handoff/src/app/w/[slug]/library/**` | Signed-in client Library. |
| `handoff/src/app/view/[token]/**` | Public read-only presentation and passcode unlock. |
| `handoff/src/app/api/workspaces/[workspaceId]/view-links/**` | Authenticated view-link management. |

---

### Task 1: Pure Library projection and status model

**Files:**
- Create: `handoff/src/lib/library-artifacts.ts`
- Create: `handoff/src/lib/library-artifacts.test.ts`
- Reuse: `handoff/src/lib/social-queries.ts`
- Reuse: `handoff/src/lib/built-work.ts`
- Reuse: `handoff/src/db/deliverables.ts`

- [ ] **Step 1: Write failing pure projection tests**

Cover HLS-003, HLS-005, and HLS-017.

Test:

- stable keys for deliverable item/version, built work, and file;
- deterministic type derivation for article, social, video, image, website, document, and file;
- allowlisted metadata override only;
- primary status precedence: changes requested, needs attention, needs review, publishing, scheduled, partially published, published, ready, approved, draft;
- partial publication retains successful URLs and failed target state;
- article, website, review, social, and file actions;
- client labels never name Zernio;
- malformed legacy links produce an unavailable action rather than an unsafe URL.

- [ ] **Step 2: Run and confirm the intended failure**

```bash
cd handoff && npx vitest run src/lib/library-artifacts.test.ts
```

- [ ] **Step 3: Implement pure discriminated-union projection**

Keep source rows and projected UI records separate. Do not query D1 or call external services in this module.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 2: Article metadata persistence and safe canonical URLs

**Files:**
- Create: `handoff/migrations/0041_library_artifacts.sql`
- Modify: `handoff/src/db/migration-sql.ts`
- Modify: `handoff/src/db/migrate.ts`
- Modify: `handoff/src/db/migrate.test.ts`
- Modify: `handoff/src/db/isolation.test.ts`
- Modify: `handoff/src/lib/authz.ts`
- Modify: the matching authorization tests
- Create: `handoff/src/lib/artifact-metadata.ts`
- Create: `handoff/src/lib/artifact-metadata.test.ts`

- [ ] **Step 1: Write failing migration and metadata tests**

Cover HLS-002, HLS-004, and HLS-011.

Assert `deliverable_artifact_metadata`, `artifact_relations`, and `library_file_selections` exist with:

- organization and workspace ownership columns and indexes;
- exact `deliverable_id`, `item_id`, and `version`;
- unique metadata row per item/version;
- allowlisted artifact and article statuses;
- optional same-workspace source file;
- unique typed artifact relation;
- non-null relation versions, using `0` only for unversioned sources;
- one auditable active/revoked selection per workspace/file;
- audit actor and timestamps.

Test canonical URL validation:

- accepts HTTP(S) on legacy reads;
- requires HTTPS for production staff writes;
- rejects `javascript:`, `data:`, credentials, malformed URLs, and overlong values;
- preserves path, query, and fragment;
- returns a normalized hostname for display;
- redacts full query strings from activity metadata.

Test selection and relation invariants:

- `library_file.select` allows super-admin and assigned-operator staff, but not client members;
- `view_link.manage` allows super-admin, assigned operators, and client owners;
- `article_promotion.create` allows super-admin and assigned operators only;
- selected files must be clean and belong to the same workspace;
- revocation removes the Library projection without deleting the file;
- reselection inserts a new audit row while the partial unique index permits only one active row;
- polymorphic relation endpoints are resolved transactionally in the same workspace;
- orphan, cross-workspace, and duplicate unversioned relations are refused;
- active relations prevent hard deletion and existing hidden/retired state remains the normal retirement path.

Run migrations twice and verify the second run succeeds.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/db/migrate.test.ts src/db/isolation.test.ts src/lib/artifact-metadata.test.ts
```

- [ ] **Step 3: Add migration and metadata service**

Read canonical URLs in this order:

1. metadata `canonical_url`;
2. existing `deliverable_items.link_url`;
3. no canonical URL.

During compatibility rollout, metadata writes update both fields in one transaction. Return a stale-write conflict when `expectedUpdatedAt` no longer matches.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 3: Authorized Library query service

**Files:**
- Create: `handoff/src/lib/library-queries.ts`
- Create: `handoff/src/lib/library-queries.test.ts`
- Modify: `handoff/src/db/deliverables.ts` only if a bounded scoped query is missing
- Modify: `handoff/src/lib/built-work.ts` only if a bounded scoped query is missing
- Modify: the existing scoped file query only if a bounded selected-file query is missing

- [ ] **Step 1: Write failing read-model tests**

Cover HLS-001, HLS-002, HLS-006, and HLS-008.

Test:

- authorization occurs before source-family reads;
- client members see released work only;
- assigned staff may request held work only through an explicit staff projection;
- withdrawn, superseded, deleted, unreleased, unselected files, and foreign records are excluded before counts;
- source families load independently and merge deterministically;
- social destination chips come from local `social_posts` and target rows;
- no Zernio adapter call occurs;
- bounded search matches title, excerpt, host, campaign/project, filename, and destination display name;
- filters and sort work together;
- cursor ordering remains stable when timestamps tie;
- normalized cursor is `(sort_value, source_family_rank, source_id, source_version)`;
- each family applies a seek predicate and the merge refills until 24 visible rows or exhaustion;
- exact counts are summed from visibility-scoped per-family counts;
- pages dominated by one family, tied values, page-boundary inserts, and filtered counts remain correct;
- page size is capped at 24;
- overlong search is rejected or clamped before SQL.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/lib/library-queries.test.ts
```

- [ ] **Step 3: Implement scoped parallel queries**

Use parameterized SQL. Build exact filter counts from separate already-authorized per-family count queries, never from all workspace records. Avoid an unbounded in-memory merge; each family must use bounded seek queries, fixed family rank, over-fetch, and refill against the normalized cursor.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 4: Enhanced finished-work cards

**Files:**
- Create: `handoff/src/components/library/artifact-card.tsx`
- Create: `handoff/src/components/library/article-card.tsx`
- Create: `handoff/src/components/library/artifact-card.test.tsx`
- Create: `handoff/src/components/library/copy-link-button.tsx`
- Modify: `handoff/src/app/w/[slug]/work/page.tsx`

- [ ] **Step 1: Write failing component tests**

Cover HLS-003 through HLS-006, HLS-014, and HLS-017.

Test:

- article headline, dek, hero fallback, hostname, author/date, status, and destination chips;
- Read article uses a safe new tab;
- Copy link copies the exact canonical URL and announces success;
- clipboard denial leaves a selectable URL and announces failure;
- websites, videos, images, documents, social pieces, and files choose the correct primary action;
- partial destination outcomes remain visible;
- status uses text as well as color;
- card menus are keyboard reachable;
- empty, loading, partial-error, and no-result states use plain copy.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/components/library/artifact-card.test.tsx
```

- [ ] **Step 3: Implement shared cards and upgrade the compatibility list**

Render the current `/w/[slug]/work` page from the Library projection before introducing a route rename. Keep every existing `/w/[slug]/work/[id]` destination valid.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 5: Library route, navigation, filtering, and route compatibility

**Files:**
- Create: `handoff/src/app/w/[slug]/library/page.tsx`
- Create: `handoff/src/components/library/library-browser.tsx`
- Create: `handoff/src/components/library/library-browser.test.tsx`
- Modify: `handoff/src/app/w/[slug]/layout.tsx`
- Modify: `handoff/src/app/w/[slug]/work/page.tsx`
- Modify: the relevant client navigation tests

- [ ] **Step 1: Write failing browser and route tests**

Cover HLS-007, HLS-008, and HLS-017.

Test:

- tabs for All, Articles, Social, Video, Images, Websites, Documents, and Sources;
- filters for status, date, project, platform, and needs action;
- sort options from the design;
- search/filter/sort state serializes to URL query parameters;
- next-page links preserve query state;
- mobile uses one card column and usable 44-pixel controls;
- old Finished Work navigation and deep links continue to resolve;
- `/w/[slug]/social` remains the detailed operations route.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/components/library/library-browser.test.tsx
```

- [ ] **Step 3: Implement the Library browser**

Make Library the preferred navigation label. Keep `/w/[slug]/work` as a compatibility render or redirect that does not break bookmarked collection links.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 6: Local social destination projection

**Files:**
- Modify: `handoff/src/lib/library-queries.ts`
- Modify: `handoff/src/lib/library-queries.test.ts`
- Modify: `handoff/src/lib/social-queries.ts` only to expose a reusable local projection
- Modify: `handoff/src/components/library/article-card.tsx`
- Modify: `handoff/src/components/library/artifact-card.test.tsx`

- [ ] **Step 1: Add failing destination-state tests**

Cover HLS-005 and HLS-006.

Test:

- scheduled, publishing, published, failed, and uncertain targets;
- `social_posts.published_urls` maps to platform-specific public links;
- one failed target plus one successful target becomes partially published;
- client output excludes normalized provider errors;
- staff output includes recovery-safe reason and action;
- opening, searching, or filtering the Library makes zero Zernio requests.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/lib/library-queries.test.ts src/components/library/artifact-card.test.tsx
```

- [ ] **Step 3: Implement a reusable local destination projection**

Do not introduce a second publishing-state algorithm. Reuse the precedence and target interpretation already established in `social-queries.ts`.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 7: Read-only view-link persistence and token service

**Files:**
- Create: `handoff/migrations/0042_library_shares.sql`
- Modify: `handoff/src/db/migration-sql.ts`
- Modify: `handoff/src/db/migrate.ts`
- Modify: `handoff/src/db/migrate.test.ts`
- Modify: `handoff/src/db/isolation.test.ts`
- Create: `handoff/src/lib/library-shares.ts`
- Create: `handoff/src/lib/library-shares.test.ts`

- [ ] **Step 1: Write failing persistence and security tests**

Cover HLS-009 through HLS-011.

Assert `library_shares`, `library_share_items`, `library_share_events`, `library_share_unlock_attempts`, and `library_share_unlock_sessions` support:

- unique SHA-256 token hash, never a raw token;
- expiry, revocation, optional slow passcode hash, title, downloads, and external-link visibility;
- exact resource kind, internal ID, non-null version (`0` for unversioned records), opaque public ID, and presentation order;
- one-workspace ownership and indexed management queries;
- created, opened, downloaded, updated, and revoked audit events without content or tokens.
- atomic attempt windows keyed by share and privacy-preserving IP hash.
- hash-only unlock sessions bound to one share and a 30-minute expiry.

Test:

- at least 256 random bits;
- raw token returned only by creation;
- token hash lookup;
- expiry and revocation;
- same-workspace validation for every selected item;
- held, removed, unclean, foreign, and unavailable resources fail closed;
- versioned PBKDF2-HMAC-SHA-256 with 128-bit salt, 310,000 iterations, 32-byte key, and constant-time verification;
- HMAC-SHA-256 IP hashing with the `HANDOFF_SHARE_HASH_PEPPER` Worker secret and no raw IP persistence;
- five failures in 15 minutes produce a 15-minute 429 block, including concurrent attempts and window reset;
- successful unlock clears attempts, returns a separate 256-bit session token in a `HttpOnly`, `Secure`, `SameSite=Lax` cookie, and stores only its SHA-256 hash;
- unlock cookies fail when forged, used on another share, expired, or replayed after share expiry/revocation;
- downloads default false;
- a later artifact version does not change an existing share;
- updating pinned items writes an audit event.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/db/migrate.test.ts src/db/isolation.test.ts src/lib/library-shares.test.ts
```

- [ ] **Step 3: Implement token and public-projection services**

Use Web Crypto-compatible primitives available in the Worker runtime. Store the passcode algorithm, iteration count, salt, and derived key in a versioned format so parameters can migrate. The view token and unlock-session token are different random values and both are hash-only at rest. Never place a raw token, passcode, or IP address in logs, activity metadata, or listing responses.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 8: View-link management and public presentation

**Files:**
- Create: `handoff/src/app/api/workspaces/[workspaceId]/view-links/route.ts`
- Create: `handoff/src/app/api/workspaces/[workspaceId]/view-links/[shareId]/route.ts`
- Create: `handoff/src/app/api/workspaces/[workspaceId]/view-links/view-links-routes.test.ts`
- Create: `handoff/src/app/view/[token]/page.tsx`
- Create: `handoff/src/app/view/[token]/unlock/route.ts`
- Create: `handoff/src/app/view/[token]/files/[shareItemPublicId]/route.ts`
- Create: `handoff/src/components/library/view-link-dialog.tsx`
- Create: `handoff/src/components/library/public-library-view.tsx`
- Create: `handoff/src/components/library/view-links.test.tsx`
- Modify: the relevant Library and collection pages

- [ ] **Step 1: Write failing route and interaction tests**

Cover HLS-009 through HLS-011 and HLS-018.

Test:

- staff and client owners may create/list/update/revoke; members may not;
- foreign workspace and resource IDs return 404;
- a member who sees the workspace but lacks `view_link.manage` receives 403;
- creation returns the complete URL once;
- listing never returns tokens or passcodes;
- DELETE revokes and preserves audit history;
- expired/revoked/removed-empty shares render one generic unavailable page;
- passcode unlock uses a short-lived, share-bound secure cookie;
- unlock is the explicit `POST /view/[token]/unlock` route and returns 429 for a blocked attempt window;
- forged, cross-share, expired, and revoked-share unlock cookies return the same generic unavailable response;
- public pages set `noindex, nofollow` and restrictive framing/CSP;
- external links respect `show_external_links`;
- file actions are absent when downloads are disabled;
- direct disabled/unclean file download returns 404;
- download resolves only by `(share_id, share_item.public_id)`; an internal file ID or an opaque ID from another share returns 404;
- authorized downloads use a short-lived attachment response;
- public output omits internal IDs, notes, repos, tasks, agents, unpublished versions, and provider errors;
- feature flag off hides creation and returns a stable disabled response without changing `/share/[token]`.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run \
  src/app/api/workspaces/[workspaceId]/view-links/view-links-routes.test.ts \
  src/components/library/view-links.test.tsx
```

- [ ] **Step 3: Implement management and public routes**

Use the labels “Copy view link” and “Copy upload link.” Do not use a generic “Share link.” Approval and comments remain on authenticated client routes.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 9: Article-to-social promotion drafts and relations

**Files:**
- Create: `handoff/migrations/0043_article_promotions.sql`
- Modify: `handoff/src/db/migration-sql.ts`
- Modify: `handoff/src/db/migrate.ts`
- Modify: `handoff/src/db/migrate.test.ts`
- Modify: `handoff/src/db/isolation.test.ts`
- Create: `handoff/src/lib/artifact-relations.ts`
- Create: `handoff/src/lib/artifact-relations.test.ts`
- Create: `handoff/src/lib/article-promotions.ts`
- Create: `handoff/src/lib/article-promotions.test.ts`
- Create: `handoff/src/app/deliverables/[id]/article-promotion-actions.ts`
- Create: `handoff/src/components/library/article-promotion-dialog.tsx`
- Create: `handoff/src/components/library/article-promotion-dialog.test.tsx`
- Modify: `handoff/src/app/deliverables/[id]/page.tsx`

- [ ] **Step 1: Write failing relation and command tests**

Cover HLS-012 and HLS-013.

Test:

- `article_promotion_idempotency` is unique on actor kind/ID/external ID and stores the pinned source plus local response;
- source and target must exist in the same organization/workspace;
- relations pin source and target versions;
- duplicate relations are idempotent;
- only staff can create promotion drafts in MVP;
- source must be an approved or published article with a valid canonical URL;
- platforms exclude WordPress, Wix, and Pinterest;
- local social draft copy contains the exact canonical or explicitly reviewed tracked URL;
- canonical metadata never changes when tracking options are added;
- selected hero/crop media must already belong to the source artifact;
- one `externalId` returns one promotion result;
- without a target, one transaction creates a draft `social_pack` deliverable at version 1 with no published version;
- a supplied target must be a same-workspace draft `social_pack` and uses its current working version;
- each platform creates a pending deliverable item and matching `social_variants` row;
- the draft `social_collections` row points to the target deliverable;
- the idempotency response and version-pinned relations commit with the draft through `Sql.batch`;
- any failed statement rolls back every draft, variant, collection, relation, and idempotency row;
- command creates local draft items and `promotes` relations only;
- no media upload, `sendPieces`, `autoScheduleApproved`, Zernio request, scheduling, or public post occurs;
- normal item approval remains required before existing scheduling accepts the draft;
- client review continues through `/w/[slug]/work/[id]`; approved work later uses the existing staff send or agent prepare/execute paths;
- source-version change does not retarget an old promotion.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run \
  src/lib/artifact-relations.test.ts \
  src/lib/article-promotions.test.ts \
  src/components/library/article-promotion-dialog.test.tsx
```

- [ ] **Step 3: Implement the local draft flow**

Add migration 0043 and register it through the existing migration runner. Build the draft, variants, collection, versioned relations, and `article_promotion_idempotency` response as one `Sql.batch`. Call existing validation and variant normalization where possible. Do not copy the Zernio adapter or invoke `sendPieces` or `autoScheduleApproved`. Show the exact outbound URL and selected media before creation.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 10: Collection review ergonomics

**Files:**
- Modify: `handoff/src/app/w/[slug]/work/[id]/page.tsx`
- Modify: `handoff/src/app/w/[slug]/work/forms.tsx`
- Modify: `handoff/src/app/w/[slug]/work/actions.ts`
- Create: `handoff/src/components/library/collection-review.tsx`
- Create: `handoff/src/components/library/collection-review.test.tsx`
- Modify: `handoff/src/lib/review.ts`
- Modify: `handoff/src/lib/review.test.ts`

- [ ] **Step 1: Write failing review-flow tests**

Cover HLS-005, HLS-014, and HLS-017.

Test:

- collection header shows version, delivered date, and `N of M reviewed`;
- approved, changes-requested, and pending counts remain distinct;
- each item visibly shows approval state;
- article items render as article cards and social items reuse the in-situ preview: Facebook and Instagram frames differ, and a carousel shows one slide with count, dots, and previous/next controls;
- change-request input stays collapsed until chosen;
- per-item approval stays on the item;
- Approve all appears after review context or in a non-obscuring sticky footer;
- bulk action names its exact count and warns about changes-requested items;
- completion/error feedback receives focus or is announced;
- approval alone makes no external publish call;
- explicit existing cadence behavior retains its current wording and behavior.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/components/library/collection-review.test.tsx src/lib/review.test.ts
```

- [ ] **Step 3: Implement the collection review shell**

Preserve action contracts and database transitions. This task changes presentation and accessible interaction, not approval semantics.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 11: Sources, breadcrumbs, and provenance

**Files:**
- Create: `handoff/src/lib/source-provenance.ts`
- Create: `handoff/src/lib/source-provenance.test.ts`
- Create: `handoff/src/components/library/sources-browser.tsx`
- Create: `handoff/src/components/library/sources-browser.test.tsx`
- Create: `handoff/src/app/w/[slug]/sources-actions.ts`
- Create: `handoff/src/app/w/[slug]/sources-actions.test.ts`
- Modify: `handoff/src/app/w/[slug]/page.tsx`
- Modify: `handoff/src/components/folder-files.tsx`
- Modify: `handoff/src/app/w/[slug]/files/[fileId]/page.tsx`

- [ ] **Step 1: Write failing Sources tests**

Cover HLS-002 and HLS-015.

Test:

- folder breadcrumbs and deep links;
- search by filename and filter by type/source/date;
- sort by name, date, and type;
- assigned staff can select/revoke clean same-workspace files through `library_file.select`;
- clients and cross-workspace requests cannot change selection;
- clean/scan state remains visible;
- `source_of` and metadata `source_file_id` produce Used in links;
- artifact-to-file relations produce Delivered as links;
- held, hidden, unclean, foreign, and unselected files never become Library artifacts;
- existing preview, scan, and download restrictions remain.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run \
  src/lib/source-provenance.test.ts \
  src/components/library/sources-browser.test.tsx \
  src/app/w/[slug]/sources-actions.test.ts
```

- [ ] **Step 3: Implement Sources as the file-oriented Library tab**

Keep the current folder tree and file detail routes. Add navigation and provenance rather than replacing safe file behavior.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 12: Staff Files & spaces summary and publishing-composer cleanup

**Files:**
- Modify: `handoff/src/app/clients/[id]/files-tab.tsx`
- Create: `handoff/src/components/library/staff-library-summary.tsx`
- Create: `handoff/src/components/library/staff-library-summary.test.tsx`
- Modify: `handoff/src/app/deliverables/[id]/page.tsx`
- Modify or remove: `handoff/src/components/social/publishing-composer.tsx`
- Modify or remove: `handoff/src/components/social/publishing-composer.test.tsx`
- Create or modify: `handoff/src/app/clients/social-actions.test.ts`
- Create or modify: `handoff/src/app/w/[slug]/work/actions.test.ts`

- [ ] **Step 1: Write failing staff-summary and compatibility tests**

Cover HLS-001, HLS-006, HLS-012, and HLS-016.

Test:

- staff sees recent finished work, counts by type, review-needed count, client Library/Sources links, and recent view-link state;
- held work is clearly staff-only;
- article promotion opens the real local-draft dialog;
- existing functional Post to social form remains reachable;
- the nonfunctional composer is absent unless it is wired to current prepare/execute plan actions;
- direct staff posting through `sendToSocialAction` and existing `schedule_social` still use their established behavior;
- client approval still reaches `autoScheduleApproved` only under the existing explicit cadence setting;
- webhook reconciliation and cron refresh continue to settle local post/target state;
- promotion creation makes no Zernio call and cannot trigger cadence before normal approval.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run \
  src/components/library/staff-library-summary.test.tsx \
  src/app/clients/social-actions.test.ts \
  src/app/w/[slug]/work/actions.test.ts \
  src/lib/social-tools.test.ts \
  src/lib/social-commands.test.ts \
  src/lib/social.test.ts
```

- [ ] **Step 3: Implement summary and remove misleading controls**

Do not replace the working `SendToSocialForm`. If the composer cannot execute a prepared plan end to end, remove it from the page and retain its code only if another real caller exists.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 13: Accessibility, performance, metrics, flags, and documentation

**Files:**
- Modify: `handoff/src/cloudflare-env.d.ts`
- Modify: `handoff/wrangler.hq.jsonc`
- Modify: `handoff/wrangler.jsonc`
- Modify: `handoff/.env.example`
- Create or modify: Library metrics helper and tests following existing analytics conventions
- Modify: `handoff/README.md`
- Modify: `handoff/CHANGELOG.md`
- Modify: root `README.md`

- [ ] **Step 1: Add failing configuration and quality tests**

Cover HLS-008 through HLS-011, HLS-017, and HLS-018.

Verify:

- `LIBRARY_VIEW_LINKS` and `ARTICLE_SOCIAL_PROMO` default off when absent;
- view-link creation and unlock fail closed when `HANDOFF_SHARE_HASH_PEPPER` is absent in production;
- disabling either flag does not disable signed-in Library reads;
- disabling article promotion leaves existing social workflows intact;
- public share pages retain noindex and security headers;
- all controls have accessible names, visible focus, text status, and 44-pixel touch targets;
- copy and mutation feedback uses an `aria-live` region;
- reduced motion removes nonessential transitions;
- URLs wrap without horizontal overflow;
- card thumbnails lazy-load;
- no query loads file bytes or external article bodies;
- metrics exclude content, tokens, passcodes, and complete URLs.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run \
  src/lib/library-artifacts.test.ts \
  src/lib/library-queries.test.ts \
  src/lib/library-shares.test.ts \
  src/components/library
```

- [ ] **Step 3: Add flags, metrics, and truthful documentation**

Document:

- Library and Sources routes;
- canonical versus destination versus view links;
- upload-link distinction;
- feature flags and rollback;
- article promotion boundary;
- view-link security and public download behavior;
- `HANDOFF_SHARE_HASH_PEPPER` as a Worker secret that must not be committed or exposed to the browser;
- no blog publishing through Zernio.

Add a dated changelog entry only for behavior actually shipped.

- [ ] **Step 4: Re-run quality tests**

Expected: pass.

---

## Final verification

Run focused suites while implementing, then the full gates:

```bash
cd handoff && npm test
cd handoff && npm run typecheck:agent
cd handoff && npx tsc --noEmit
cd handoff && npm run lint
cd handoff && npm run build
```

Perform manual browser verification with one staff account, one client owner, one client member, and one signed-out session:

1. Open a workspace with an article, website, social collection, video, image, document, and source files.
2. Verify Library search, filters, sort, pagination, empty states, and query-string deep links on desktop and mobile.
3. Open and copy an article canonical URL; confirm the exact stored URL is used.
4. Confirm published social destination links appear from local state with no Zernio request on page load.
5. Confirm partial social publication shows successful and failed targets together.
6. Open old Finished Work, collection, file, and Social links and verify they still work.
7. Create a view link with downloads off, then test expiry, revocation, passcode failure/rate limiting, hidden external links, and exact version pinning.
8. Attempt a direct public file download while disabled and after changing scan state; verify both fail closed.
9. Inspect the public page source and network payloads for internal IDs, staff notes, repo links, provider details, tokens, and unpublished data.
10. Create an article social-promotion draft; verify no external post exists and normal approval remains required.
11. Schedule the approved promotion through the existing test Zernio profile and confirm destination outcomes flow back to the article.
12. Verify upload links still use `/share/[token]` and still allow the existing upload workflow.
13. Use keyboard-only navigation, screen-reader announcements, reduced motion, and a narrow mobile viewport.

## Rollout

1. Deploy Task 1–4 read-model and card improvements with no route rename.
2. Backfill article metadata in a dry report, review invalid/duplicate URLs, then write accepted rows.
3. Deploy local social destination projection.
4. Add Library navigation while retaining `/w/[slug]/work`.
5. Deploy view-link tables and code with `LIBRARY_VIEW_LINKS=off`.
6. Enable view links for internal staff, then one client owner, then all allowed workspaces.
7. Deploy promotion code with `ARTICLE_SOCIAL_PROMO=off`.
8. Enable promotion creation for internal staff and verify that creation produces no Zernio traffic.
9. Enable promotion for all authorized staff after approval and destination reconciliation tests pass.
10. Ship review, Sources, and staff summary improvements.
11. Consider a later navigation cleanup only after route analytics and support feedback confirm parity.

Rollback is flag-first:

- turn off `LIBRARY_VIEW_LINKS` to stop creating and opening public view links;
- turn off `ARTICLE_SOCIAL_PROMO` to stop new promotion drafts;
- preserve additive rows and audit events;
- keep signed-in Library reads, `/w/[slug]/work`, `/share/[token]`, and existing social operations running;
- do not reverse migrations while rows are referenced.

## Requirements traceability

| Requirement | Tasks |
| --- | --- |
| HLS-001–003 | 1, 3, 4, 5, 12 |
| HLS-004 | 1, 2, 4 |
| HLS-005–006 | 1, 3, 4, 6, 10 |
| HLS-007–008 | 3, 5, 13 |
| HLS-009–011 | 7, 8, 13 |
| HLS-012–013 | 9, 12, 13 |
| HLS-014 | 4, 10 |
| HLS-015 | 11 |
| HLS-016 | 12 |
| HLS-017–018 | 1, 4, 5, 8, 13 |

## Post-plan review checklist

- [ ] Every Library source family authorizes and filters visibility before counts or projection.
- [ ] Article metadata reads old `link_url` values until parity and backfill are complete.
- [ ] Approval and publication remain separate everywhere.
- [ ] Library reads use local social state and never call Zernio.
- [ ] Promotion creation creates only local drafts and exact versioned relations.
- [ ] Existing direct social, cadence, webhook, cron, and plan behavior remains covered by regression tests.
- [ ] `/view/[token]` and `/share/[token]` have different code, labels, permissions, and tests.
- [ ] Public tokens are hash-only at rest and absent from logs/list responses.
- [ ] Public views fail closed for held, removed, expired, revoked, foreign, unclean, or download-disabled resources.
- [ ] Existing Finished Work, file, and Social deep links remain valid.
- [ ] Client copy does not name Zernio.
- [ ] Blog publishing and WordPress, Wix, and Pinterest-specific work remain absent.
- [ ] Tests, type checks, lint, build, browser verification, README, and changelog are complete before rollout.
