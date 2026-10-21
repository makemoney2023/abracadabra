# Agent-managed social publishing implementation plan

> **For agentic workers:** Implement task-by-task. Write the failing test first, confirm the intended failure, then make the smallest complete change. Do not start the next task while the current test is red.

**Goal:** Make finished social work a single, visual, approval-gated workflow that staff, clients, HQ chat, and assigned Grok agents can safely prepare, schedule, publish, reschedule, cancel, and recover through Zernio.

**Architecture:** Extract the existing staff-only Zernio behavior into a shared social command layer. Every UI, chat, agent API, cadence job, and webhook uses that layer. External actions use immutable prepare-preview-execute plans with policy evaluation, exact confirmation, idempotency, optimistic concurrency, and target-level outcomes.

**Tech stack:** Next.js 16, React 19, TypeScript, Vitest, D1 migrations applied by `migrate`, R2 media, Cloudflare Workers, Zernio REST API, existing `caw_…` Grok-agent bearer authentication.

**Design:** [`docs/superpowers/specs/2026-10-21-agent-managed-social-publishing-design.md`](../specs/2026-10-21-agent-managed-social-publishing-design.md)

---

## Repository boundary

Implementation is in [`handoff/`](../../../handoff/). Keep `ZERNIO_API_KEY` and `ZERNIO_WEBHOOK_SECRET` as Worker secrets. Never place them in source, migrations, test fixtures, logs, activities, plan JSON, or API responses.

Commit as `makemoney2023 <124006256+makemoney2023@users.noreply.github.com>` by passing `GIT_AUTHOR_*` and `GIT_COMMITTER_*` on each commit. Do not change git config.

## Requirements

| ID | Requirement |
| --- | --- |
| AMSP-001 | Show media, copy, approval, destinations, schedule, and publishing state together. |
| AMSP-002 | Preserve separate content-approval and publishing states in one visible lifecycle. |
| AMSP-003 | Resolve “select all eligible” to an exact reviewed snapshot; an empty list never means all. |
| AMSP-004 | Resolve post type per piece and target for static, carousel, video, Reel, and YouTube Short. |
| AMSP-005 | Run per-piece-version/per-account preflight without external writes. |
| AMSP-006 | Prepare an immutable, expiring plan with exact rows, blocked rows, warnings, authorization, and hash. |
| AMSP-007 | Reject stale, changed, expired, or previously executed plans. |
| AMSP-008 | Require exact confirmation for post-now, disconnect, cancellation, and cadence changes according to policy. |
| AMSP-009 | Make every mutation idempotent and every mutable resource revision-aware. |
| AMSP-010 | Enforce client assignment, lead/hire capability, and client agent policy on the server. |
| AMSP-011 | Never allow an agent, UI, chat tool, or automation to schedule unapproved work. |
| AMSP-012 | Give assigned Grok agents complete read access to social overview, accounts, pieces, posts, cadence, plans, and attention. |
| AMSP-013 | Let authorized Grok agents save variants, prepare/execute drafts and schedules, and manage future posts. |
| AMSP-014 | Let lead agents prepare cadence and account actions; OAuth remains a human-completed step. |
| AMSP-015 | Return target-level success, failure, uncertainty, blocked, and not-attempted results. |
| AMSP-016 | Materialize actionable provider/account failures and constrained recovery actions. |
| AMSP-017 | Reconcile webhook, cron, and uncertain execution through the same target-level state. |
| AMSP-018 | Give HQ chat the same plan-based capabilities as the Grok REST API. |
| AMSP-019 | Provide a four-step publishing composer with a final exact review. |
| AMSP-020 | Provide a week calendar, ready queue, needs-attention queue, account health, cadence, and history. |
| AMSP-021 | Give clients visual approval, requested-changes, recommended-schedule, and upcoming-calendar surfaces. |
| AMSP-022 | Keep blog publishing, WordPress, Wix, and Pinterest-specific workflows out of scope. |
| AMSP-023 | Record actor, client, affected resources, confirmation, outcome, and channel for every mutation without sensitive content. |
| AMSP-024 | Roll out agent writes behind `SOCIAL_AGENT_ACTIONS` without breaking existing staff/client behavior. |
| AMSP-025 | After operations stabilize, expose target-level analytics to staff, clients, and agents for reporting and new-brief recommendations without automatic republication. |

## Intended file structure

Names may be adjusted to match nearby conventions, but responsibilities must remain separate.

| Path | Responsibility |
| --- | --- |
| `handoff/migrations/0039_social_agent_plans.sql` | Collections, variants, plans, idempotency, policy, attention, confirmation, and target outcomes. |
| `handoff/src/lib/social-actor.ts` | Shared staff, client, agent, and system actor shape. |
| `handoff/src/lib/social-policy.ts` | Pure capability and confirmation evaluation. |
| `handoff/src/lib/social-preflight.ts` | Pure target-level compatibility, approval, duplicate, type, and timing decisions. |
| `handoff/src/lib/social-plans.ts` | Normalize, hash, persist, load, invalidate, and execute immutable plans. |
| `handoff/src/lib/social-commands.ts` | Shared application commands; the only layer allowed to invoke the Zernio adapter. |
| `handoff/src/lib/social-attention.ts` | Open, dedupe, resolve, dismiss, and retry constrained attention items. |
| `handoff/src/lib/social-queries.ts` | UI/chat/agent read models for overview, pieces, calendar, cadence, and history. |
| `handoff/src/lib/social-variants.ts` | First-class variants and bridge from existing `social_piece_settings`. |
| `handoff/src/app/api/agent-social/**/route.ts` | Client-assigned Grok read and plan APIs. |
| `handoff/src/app/clients/[id]/social-tab.tsx` | Staff operations shell. |
| `handoff/src/app/clients/social-forms.tsx` | Composer, cadence, account, move/cancel/retry forms. |
| `handoff/src/app/deliverables/[id]/**` | Media-first finished-work collection and approval-to-schedule entry. |
| `handoff/src/app/w/[slug]/**` | Client visual review, account health, and upcoming calendar. |
| `handoff/src/lib/hq-tools.ts` | Plan-based HQ chat tools. |

## Global constraints

- Existing profile-per-client, R2 media, webhook, cron, and Zernio adapter behavior remain.
- Only `social-commands.ts` may coordinate external social writes; routes and React actions cannot call Zernio directly.
- All ownership checks occur server-side for organization, deliverable, item, account, post, plan, and attention IDs.
- Media comes only from approved piece versions in R2. Agent-provided media URLs are rejected.
- Platform options are schema-validated and allowlisted.
- TikTok remains draft-first where its consent requirements prevent direct publication.
- Public and destructive actions cannot be inferred from prompt text.
- Partial provider results are stored and returned per target, never flattened to one success boolean.
- Existing direct staff actions remain as adapters during migration, then are removed only after parity tests pass.

---

### Task 1: Persistence and migration

**Files:**
- Create: `handoff/migrations/0039_social_agent_plans.sql`
- Modify: `handoff/src/db/migration-sql.ts`
- Modify: `handoff/src/db/migrate.ts`
- Test: `handoff/src/db/migrate.test.ts`

- [ ] **Step 1: Write the failing migration tests**

Cover AMSP-006, AMSP-008, AMSP-009, AMSP-016, and AMSP-017.

After `migrate`, assert these tables and key constraints exist:

- `social_collections`
- `social_variants`, unique on source item/version/platform
- `social_publish_plans`, including immutable request/rows/hash, authorization, expiry, execution, and result fields
- `social_action_idempotency`, unique on actor kind/actor ID/external ID
- `social_agent_policies`, unique per organization
- `social_confirmations`, bound to plan ID/hash/action with single-use fields
- `social_attention_items`, deduped by organization/source kind/source ID/target
- `social_post_targets`, one outcome per local post/account target

Run `migrate` twice and assert the second run succeeds.

- [ ] **Step 2: Run and confirm the intended failure**

```bash
cd handoff && npx vitest run src/db/migrate.test.ts
```

- [ ] **Step 3: Add the migration and migrate step**

Use foreign keys where existing D1 patterns support them, indexed organization/status/time fields for operating queries, and JSON text columns only for immutable snapshots or provider-specific allowlisted data.

- [ ] **Step 4: Re-run the migration test**

Expected: pass.

### Task 2: Shared actor and policy evaluator

**Files:**
- Create: `handoff/src/lib/social-actor.ts`
- Create: `handoff/src/lib/social-policy.ts`
- Create: `handoff/src/lib/social-policy.test.ts`
- Modify: `handoff/src/lib/agent-work-filing.ts`

- [ ] **Step 1: Write failing policy tests**

Cover AMSP-008, AMSP-010, AMSP-011, and AMSP-014.

Test:

- staff, client owner, client member, lead agent, hire agent, and system actors;
- client assignment is mandatory for agents;
- `observe`, `draft`, `schedule_approved`, and `managed` policies;
- role defaults plus explicit capability grant/revoke;
- hire cannot manage cadence, connect, or disconnect by default;
- post-now and disconnect always require confirmation;
- cancel and cadence change require confirmation;
- scheduling an unapproved piece is denied regardless of actor or policy;
- an agent cannot increase its own client policy.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/lib/social-policy.test.ts
```

- [ ] **Step 3: Implement pure policy evaluation**

Return a structured result:

```ts
{ authorization: "allowed" | "confirmation_required" | "denied", reasonCode, capabilities }
```

Reuse the existing agent-token and assignment resolution rather than introducing another bearer-token parser.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 3: Target-level preflight

**Files:**
- Create: `handoff/src/lib/social-preflight.ts`
- Create: `handoff/src/lib/social-preflight.test.ts`
- Modify: `handoff/src/lib/social-plan.ts`
- Modify: `handoff/src/lib/social-plan.test.ts`

- [ ] **Step 1: Write failing preflight tests**

Cover AMSP-003, AMSP-004, AMSP-005, AMSP-011, AMSP-015, and AMSP-022.

Include:

- static image, ordered carousel, landscape/square video, Reel, and YouTube Short;
- mixed selections resolving types independently per target;
- approved, unapproved, stale-version, incompatible-media, disconnected-account, missing-field, duplicate-live-post, and cadence-conflict rows;
- YouTube title/tags and first-comment validation;
- TikTok draft behavior;
- exclusion of WordPress, Wix, and Pinterest targets;
- no R2 upload or Zernio call during preflight;
- explicit IDs required for both `explicit` and `eligible` selection modes.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/lib/social-preflight.test.ts src/lib/social-plan.test.ts
```

- [ ] **Step 3: Implement pure row planning**

Return exact executable, blocked, and warning rows. Each row carries item ID/version, account ID/platform, resolved type, media summary, normalized options, and schedule instant.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 4: Immutable plan preparation and staleness

**Files:**
- Create: `handoff/src/lib/social-plans.ts`
- Create: `handoff/src/lib/social-plans.test.ts`
- Create: `handoff/src/lib/social-commands.ts`

- [ ] **Step 1: Write failing plan tests**

Cover AMSP-003, AMSP-006, AMSP-007, AMSP-009, and AMSP-023.

Assert:

- normalization produces the same hash for semantically identical input;
- changed item version, account state, cadence revision, target row, or actor changes the hash;
- “eligible” plans persist the exact resolved IDs;
- blocked rows remain visible but never enter execution rows;
- default expiry is 30 minutes;
- denied plans cannot execute;
- expired or mismatched hash returns `409 stale_plan`;
- preparation records a redacted `social.plan.prepared` activity.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/lib/social-plans.test.ts
```

- [ ] **Step 3: Implement prepare and validate commands**

Canonicalize only immutable, authorization-relevant fields before SHA-256 hashing. Recheck source version and account/cadence revisions immediately before execution.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 5: Confirmation, idempotency, and execution

**Files:**
- Modify: `handoff/src/lib/social-plans.ts`
- Modify: `handoff/src/lib/social-commands.ts`
- Create: `handoff/src/lib/social-commands.test.ts`
- Modify: `handoff/src/lib/social.ts`
- Modify: `handoff/src/lib/social.test.ts`

- [ ] **Step 1: Write failing command tests**

Cover AMSP-007, AMSP-008, AMSP-009, AMSP-011, AMSP-015, and AMSP-023.

Test:

- confirmation token is single-use, unexpired, and bound to exact plan/hash/action;
- repeated actor/external ID returns the original response with `duplicate: true`;
- concurrent execution claims one plan once;
- rows execute independently and return `succeeded`, `failed`, `uncertain`, and `not_attempted`;
- no unapproved or changed item reaches media upload;
- provider timeout after local creation returns `202 uncertain`;
- one target failure does not erase successful target links;
- activities identify actor, route, resources, confirmation, and outcome without captions or tokens.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/lib/social-commands.test.ts src/lib/social.test.ts
```

- [ ] **Step 3: Move orchestration behind the command layer**

Keep low-level Zernio request/upload helpers in `social.ts`, but remove staff-only authorization from adapter-level functions. Authorization belongs to the command layer and must be required by every caller.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 6: Grok read API

**Files:**
- Create: `handoff/src/lib/social-queries.ts`
- Create: `handoff/src/lib/social-queries.test.ts`
- Create: `handoff/src/app/api/agent-social/overview/route.ts`
- Create: `handoff/src/app/api/agent-social/accounts/route.ts`
- Create: `handoff/src/app/api/agent-social/pieces/route.ts`
- Create: `handoff/src/app/api/agent-social/posts/route.ts`
- Create: `handoff/src/app/api/agent-social/cadence/route.ts`
- Create: `handoff/src/app/api/agent-social/attention/route.ts`
- Create: `handoff/src/app/api/agent-social/plans/[planId]/route.ts`
- Create: `handoff/src/app/api/agent-social/agent-social-routes.test.ts`

- [ ] **Step 1: Write failing route-contract tests**

Cover AMSP-010 and AMSP-012.

Test valid token, missing token, invalid token, unassigned client, cross-client resource, lead, hire, pagination, date filtering, and feature flag off. Verify responses omit secrets, raw R2 credentials, and full provider payloads.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/lib/social-queries.test.ts src/app/api/agent-social/agent-social-routes.test.ts
```

- [ ] **Step 3: Implement client-scoped read models and routes**

Follow the existing `/api/agent-contacts` authentication and assignment pattern. Overview must include policy, account health, ready count, scheduled count, attention count, and next cadence slots.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 7: Grok plan and mutation API

**Files:**
- Create: `handoff/src/app/api/agent-social/plans/route.ts`
- Create: `handoff/src/app/api/agent-social/plans/[planId]/execute/route.ts`
- Create: `handoff/src/app/api/agent-social/pieces/[itemId]/variants/route.ts`
- Create: `handoff/src/app/api/agent-social/posts/[postId]/move-plan/route.ts`
- Create: `handoff/src/app/api/agent-social/posts/[postId]/cancel-plan/route.ts`
- Create: `handoff/src/app/api/agent-social/attention/[attentionId]/retry-plan/route.ts`
- Create: `handoff/src/app/api/agent-social/cadence-plan/route.ts`
- Create: `handoff/src/app/api/agent-social/connect-plan/route.ts`
- Create: `handoff/src/app/api/agent-social/disconnect-plan/route.ts`
- Modify: `handoff/src/app/api/agent-social/agent-social-routes.test.ts`

- [ ] **Step 1: Write failing mutation-contract tests**

Cover AMSP-003, AMSP-008 through AMSP-015, and AMSP-024.

Test:

- `external_id` is required;
- no route accepts empty IDs as all;
- plan response includes exact rows, blocked rows, hash, expiry, and authorization;
- execute requires matching hash and confirmation where applicable;
- cross-client IDs return `404`;
- lead/hire/policy differences return stable reason codes;
- connection execution returns a short-lived human OAuth URL, never credentials;
- disconnect and post-now cannot execute without confirmation;
- feature flag off denies agent writes while reads remain available.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/app/api/agent-social/agent-social-routes.test.ts
```

- [ ] **Step 3: Implement thin routes**

Routes parse and validate input, resolve actor/client assignment, call shared commands, and map domain errors to the specified HTTP contract. They contain no Zernio-specific branching.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 8: First-class platform variants

**Files:**
- Create: `handoff/src/lib/social-variants.ts`
- Create: `handoff/src/lib/social-variants.test.ts`
- Modify: `handoff/src/lib/social.ts`
- Modify: `handoff/src/app/clients/social-actions.ts`
- Modify: `handoff/src/app/clients/social-forms.tsx`

- [ ] **Step 1: Write failing variant tests**

Cover AMSP-001, AMSP-004, AMSP-009, and AMSP-013.

Assert:

- current `social_piece_settings` reads bridge into a variant when no first-class row exists;
- a saved variant records exact item version, platform, revision, actor, and allowed options;
- stale revision returns conflict;
- source-version change leaves the old variant auditable but not eligible for the new version;
- unsupported platform fields are rejected;
- carousel order and video/Short/Reel target metadata survive the bridge.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/lib/social-variants.test.ts
```

- [ ] **Step 3: Implement dual-read/single-write migration**

Read first-class variants first and fall back to existing settings. Write only first-class variants after the feature flag is enabled. Do not destroy old settings until production parity is verified.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 9: Attention queue, retry, and reconciliation

**Files:**
- Create: `handoff/src/lib/social-attention.ts`
- Create: `handoff/src/lib/social-attention.test.ts`
- Modify: `handoff/src/lib/social.ts`
- Modify: `handoff/src/worker/index.ts`
- Modify: `handoff/src/app/api/zernio/webhook/route.ts`

- [ ] **Step 1: Write failing attention tests**

Cover AMSP-015 through AMSP-017.

Test dedupe and recovery for disconnected account, upload failure, rejected target, missing requirement, stale plan, and uncertain provider outcome. Verify:

- webhook and cron settle the same `social_post_targets` row;
- success resolves matching attention;
- uncertain rows remain open until reconciliation;
- retry-plan is available only for unchanged recoverable targets;
- retry cannot create a second live public post;
- unsupported recovery returns a stable denied reason.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/lib/social-attention.test.ts src/lib/social.test.ts
```

- [ ] **Step 3: Implement target reconciliation and constrained recovery**

Materialize attention from state changes, not page rendering. Keep provider event payloads out of attention and activity records.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 10: HQ chat parity

**Files:**
- Modify: `handoff/src/lib/social-tools.ts`
- Create or modify: `handoff/src/lib/social-tools.test.ts`
- Modify: `handoff/src/lib/hq-tool-names.ts`
- Modify: `handoff/src/lib/hq-tools.ts`
- Modify: `handoff/src/lib/hq-tools.test.ts`
- Modify: `handoff/src/agent/hq-chat.ts`
- Modify: `handoff/src/lib/hq-chat-playbook.ts`
- Modify: `handoff/src/lib/hq-chat-playbook.test.ts`

- [ ] **Step 1: Write failing parity tests**

Cover AMSP-008, AMSP-011, AMSP-018, and AMSP-023.

Test the tools named in the design:

- read overview, pieces, posts, and cadence;
- prepare publish, move, cancel, retry, cadence, connect, and disconnect;
- execute exact plan with approval-card confirmation;
- explain blocked and partial rows;
- never treat empty arrays as all;
- never call the old direct scheduler for a new request.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/lib/social-tools.test.ts src/lib/hq-tools.test.ts src/lib/hq-chat-playbook.test.ts
```

- [ ] **Step 3: Implement plan-backed tools**

Keep `list_social_accounts`, `list_social_posts`, and `schedule_social` only as migration aliases. Mark direct scheduling deprecated in tool descriptions and route it through plan preparation and execution.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 11: Finished-work collection and lifecycle

**Files:**
- Modify: `handoff/src/app/deliverables/[id]/page.tsx`
- Modify: the existing deliverable item/card component used by that page
- Create: `handoff/src/components/social/social-piece-card.tsx`
- Create: `handoff/src/components/social/social-piece-card.test.tsx`
- Modify: `handoff/src/lib/social-queries.ts`

- [ ] **Step 1: Write failing component tests**

Cover AMSP-001, AMSP-002, AMSP-004, and AMSP-021.

Test:

- static preview and crop availability;
- ordered carousel slides;
- video poster, duration, aspect ratio, and safe-area status;
- vertical Reel/Short preview;
- caption excerpt, target chips, approval, publishing state, schedule, warnings, and next action;
- partial publication shows published links and needs-attention targets;
- requested changes do not erase prior outcomes.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/components/social/social-piece-card.test.tsx
```

- [ ] **Step 3: Implement media-first cards and collection summary**

The collection header shows approved, needs-changes, and unscheduled counts with `Send for review` and `Schedule approved`. Reuse real R2-backed media metadata; do not add mock production data.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 12: Guided publishing composer

**Files:**
- Create: `handoff/src/components/social/publishing-composer.tsx`
- Create: `handoff/src/components/social/publishing-composer.test.tsx`
- Modify: `handoff/src/app/clients/social-actions.ts`
- Modify: `handoff/src/app/clients/social-forms.tsx`

- [ ] **Step 1: Write failing interaction tests**

Cover AMSP-003 through AMSP-006, AMSP-008, AMSP-015, and AMSP-019.

Test the four steps:

1. exact content selection and `Select all eligible`;
2. destinations with compatibility;
3. draft, now, exact time, and cadence timing;
4. final exact rows, blocked rows, warnings, authorization, and confirmation.

Mixed content must retain target-level types. The execute control is unavailable until a current prepared plan exists. Editing any prior step invalidates the plan and returns to review.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/components/social/publishing-composer.test.tsx
```

- [ ] **Step 3: Implement the composer against shared plan actions**

Show what will not publish before execution. Do not label a partial operation as wholly successful.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 13: Social operations view

**Files:**
- Modify: `handoff/src/app/clients/[id]/social-tab.tsx`
- Create: `handoff/src/components/social/social-week-calendar.tsx`
- Create: `handoff/src/components/social/social-ready-queue.tsx`
- Create: `handoff/src/components/social/social-attention-queue.tsx`
- Create: `handoff/src/components/social/social-operations.test.tsx`
- Modify: `handoff/src/lib/social-queries.ts`

- [ ] **Step 1: Write failing operations tests**

Cover AMSP-016 and AMSP-020.

Test:

- needs-attention appears first and offers only valid recovery;
- week is default with month/agenda alternatives;
- calendar filters account, platform, collection, and status;
- cards show thumbnail, platform, state, and client-local time;
- ready queue and calendar use the same query state as agent endpoints;
- move, cancel, and retry open a plan review rather than mutating directly;
- account health, cadence, and history remain reachable.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/components/social/social-operations.test.tsx
```

- [ ] **Step 3: Implement the operations layout**

Keep the page useful at narrow widths with agenda fallback. Preserve current account connect/disconnect functionality through the shared command path.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 14: Publishing cadence and agent policy settings

**Files:**
- Modify: `handoff/src/lib/social-autopost.ts`
- Modify: `handoff/src/lib/social-autopost.test.ts`
- Modify: `handoff/src/app/clients/social-actions.ts`
- Modify: `handoff/src/app/clients/social-forms.tsx`
- Create: `handoff/src/components/social/publishing-cadence.test.tsx`

- [ ] **Step 1: Write failing cadence tests**

Cover AMSP-008, AMSP-010, AMSP-014, and AMSP-020.

Test account set, time zone, weekday/time slots, next five open slots, minimum gap, daily account cap, blackout dates, weekend exclusion, and queue ordering. Verify:

- auto-schedule uses the same plan commands;
- changed cadence invalidates a prepared recommendation;
- hire agents cannot change standing cadence;
- agent policy defaults to `draft`;
- only staff can grant policy in the initial rollout;
- policy and cadence changes record redacted activities.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/lib/social-autopost.test.ts src/components/social/publishing-cadence.test.tsx
```

- [ ] **Step 3: Implement “Publishing cadence”**

Replace “Auto-schedule” wording and show the sentence: “When the client approves a piece, place it in the next available slot.” Do not implement holiday skipping until a locale source is selected.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 15: Client review and recommended scheduling

**Files:**
- Modify: the client deliverable review components under `handoff/src/app/w/[slug]/`
- Modify: the client Social route under `handoff/src/app/w/[slug]/`
- Create: `handoff/src/components/social/client-social-review.test.tsx`
- Modify: `handoff/src/lib/review.ts`
- Modify: `handoff/src/lib/review.test.ts`

- [ ] **Step 1: Write failing client-flow tests**

Cover AMSP-001, AMSP-002, AMSP-011, and AMSP-021.

Test:

- media and caption remain together;
- platform preview and target state are understandable without naming Zernio;
- approve, approve with recommended schedule, and request changes;
- recommended schedule shows cadence and exact preview before execution;
- cadence change between preview and confirmation invalidates the plan;
- client owner can reconnect accounts, while non-owner cannot;
- upcoming calendar is read-only by default.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/components/social/client-social-review.test.tsx src/lib/review.test.ts
```

- [ ] **Step 3: Implement the seamless approval handoff**

Approval alone must not silently publish. If an existing client setting authorizes automatic placement, the approval control must say which cadence will be used.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

### Task 16: Feature flag, documentation, and rollout adapters

**Files:**
- Modify: `handoff/src/agent/env.d.ts`
- Modify: `handoff/wrangler.hq.jsonc`
- Modify: `handoff/wrangler.jsonc`
- Modify: `handoff/.env.example` or the repository’s current environment example
- Modify: `handoff/README.md`
- Modify: `handoff/CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-10-21-social-publishing-design.md`
- Modify: `docs/hq-agent-spec.md`

- [ ] **Step 1: Add configuration and compatibility tests**

Cover AMSP-018, AMSP-022, and AMSP-024.

Verify:

- `SOCIAL_AGENT_ACTIONS` defaults off when absent;
- reads remain available when writes are off;
- existing staff/client actions still work through compatibility adapters;
- legacy `schedule_social` produces a plan, not a direct provider mutation;
- disallowed networks do not appear in eligible targets or connection prompts.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/lib/social-tools.test.ts src/lib/social-commands.test.ts src/app/api/agent-social/agent-social-routes.test.ts
```

- [ ] **Step 3: Add flag wiring and truthful docs**

Document the Grok workflow, API routes, policy modes, confirmation behavior, secret names, rollout steps, and rollback. Add a dated changelog entry with touchpoints and verification.

- [ ] **Step 4: Re-run the compatibility tests**

Expected: pass.

### Task 17: Post-stability analytics and recommendation loop

**Dependency:** Complete only after Tasks 1–16 are live and publish-success, attention-age, and reconciliation metrics are stable.

**Files:**
- Create: `handoff/migrations/0040_social_analytics.sql`
- Modify: `handoff/src/db/migration-sql.ts`
- Modify: `handoff/src/db/migrate.ts`
- Create: `handoff/src/lib/social-analytics.ts`
- Create: `handoff/src/lib/social-analytics.test.ts`
- Create: `handoff/src/app/api/agent-social/analytics/route.ts`
- Modify: `handoff/src/lib/social-tools.ts`
- Modify: `handoff/src/lib/hq-tools.ts`
- Modify: `handoff/src/app/clients/[id]/social-tab.tsx`

- [ ] **Step 1: Write failing analytics tests**

Cover AMSP-010, AMSP-012, and AMSP-025.

Test:

- snapshots attach to exact published target rows and preserve provider/source time;
- repeated pulls upsert the same snapshot period;
- client assignment and `social.analytics.read` are required;
- agents can summarize post/account/format performance and prepare a new content brief recommendation;
- performance cannot directly republish or revive an old piece;
- evergreen reuse creates a new source version and returns to normal review and approval;
- analytics logs and API responses omit provider credentials and unsupported raw payload fields.

- [ ] **Step 2: Run and confirm failure**

```bash
cd handoff && npx vitest run src/lib/social-analytics.test.ts src/app/api/agent-social/agent-social-routes.test.ts
```

- [ ] **Step 3: Implement snapshots and read-only recommendations**

Add staff/client summaries and agent/HQ read tools. Keep brief creation separate from publishing plans so a recommendation cannot become a public post without normal content approval.

- [ ] **Step 4: Re-run the tests**

Expected: pass.

---

## Final verification

Run focused tests first:

```bash
cd handoff && npx vitest run \
  src/db/migrate.test.ts \
  src/lib/social-policy.test.ts \
  src/lib/social-preflight.test.ts \
  src/lib/social-plan.test.ts \
  src/lib/social-plans.test.ts \
  src/lib/social-commands.test.ts \
  src/lib/social-variants.test.ts \
  src/lib/social-attention.test.ts \
  src/lib/social-queries.test.ts \
  src/lib/social-tools.test.ts \
  src/lib/social-autopost.test.ts \
  src/lib/social.test.ts \
  src/lib/hq-tools.test.ts \
  src/lib/hq-chat-playbook.test.ts \
  src/lib/review.test.ts \
  src/app/api/agent-social/agent-social-routes.test.ts
```

Run the full gates:

```bash
cd handoff && npm test
cd handoff && npm run typecheck:agent
cd handoff && npx tsc --noEmit
cd handoff && npm run lint
cd handoff && npm run build
```

Perform manual integration with a non-production Zernio profile:

1. Connect test Instagram, Facebook, LinkedIn, TikTok, and YouTube accounts through a human OAuth session.
2. Create approved static, carousel, video, Reel, and Short pieces with real R2 files.
3. As staff, prepare “all eligible,” inspect every target/time, and schedule.
4. As a hire token, verify reads and variant preparation, then verify policy-limited scheduling.
5. As a lead token, prepare cadence, reconnect, move, cancel, retry, and post-now actions.
6. Confirm post-now and disconnect cannot execute without the exact confirmation.
7. Repeat each `external_id` and verify no duplicate public post.
8. Force one provider timeout and one rejected target; verify uncertainty, attention, and reconciliation.
9. Confirm successful target links remain visible beside the failed target.
10. Confirm WordPress, Wix, and Pinterest do not appear.

Deploy in this order after all gates pass:

1. Apply migration through the HQ worker’s existing migrate-on-request path.
2. Deploy `handoff-hq` and `handoff-agent` with `SOCIAL_AGENT_ACTIONS=0`.
3. Verify existing staff and client posting.
4. Enable read-only agent endpoints.
5. Enable prepare for internal lead agents.
6. Enable confirmed execution for one internal client.
7. Grant `schedule_approved` client by client.
8. Enable managed reschedule/retry only after attention and audit metrics are stable.

Rollback is flag-first: disable `SOCIAL_AGENT_ACTIONS`, preserve all plan/audit/target rows, and keep compatibility adapters operating. Do not reverse the migration while rows are in use.

## Requirements traceability

| Requirement | Tasks |
| --- | --- |
| AMSP-001–002 | 8, 11, 15 |
| AMSP-003–007 | 3, 4, 5, 7, 12 |
| AMSP-008–011 | 2, 5, 7, 10, 14, 15 |
| AMSP-012–014 | 6, 7, 8, 14 |
| AMSP-015–017 | 5, 9, 12, 13 |
| AMSP-018 | 10, 16 |
| AMSP-019–021 | 11, 12, 13, 14, 15 |
| AMSP-022 | 3, 16 |
| AMSP-023 | 4, 5, 10, 14 |
| AMSP-024 | 7, 16 |
| AMSP-025 | 17 |

## Post-plan review checklist

- [ ] Every social write path reaches the shared command layer.
- [ ] Every Grok route performs token, assignment, client ownership, capability, policy, approval, plan, and confirmation checks as applicable.
- [ ] UI, HQ chat, Grok REST, cadence automation, webhook, and cron agree on target-level state.
- [ ] “Select all eligible” is a fixed reviewed snapshot.
- [ ] Static, carousel, video, Reel, and Short are tested independently and in mixed batches.
- [ ] No route or tool can bypass client approval.
- [ ] OAuth remains human-completed.
- [ ] No secret, caption, confirmation token, or full provider payload is logged.
- [ ] Blog publishing and Pinterest-specific workflows remain absent.
- [ ] Tests, type checks, lint, build, manual Zernio integration, docs, and changelog are complete before rollout.
