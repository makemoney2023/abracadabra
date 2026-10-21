# Agent-managed social publishing

Status: Draft for review

## Executive summary

**Feature:** Agent-managed social publishing  
**Feature ID:** AMSP  
**Surfaces:** Handoff HQ, client space, Grok Bot agent API, Zernio  
**Builds on:** [Social publishing through Zernio](2026-10-21-social-publishing-design.md)
**Implementation:** [Agent-managed social publishing implementation plan](../plans/2026-10-21-agent-managed-social-publishing.md)

Finished social work should move from review to publication without becoming a second administrative project. Staff and clients see the same piece, media, copy, target accounts, approval state, and publishing state. Grok Bot teammates can inspect that state, prepare platform variants, place approved work into safe publishing slots, recover routine failures, and report results.

The agent is not a privileged shortcut. UI actions, HQ chat tools, and Grok agent API calls all use one social command layer, one policy evaluator, one preflight validator, and one audit trail. Public or destructive actions require the same content approval and authorization regardless of caller.

## Problem

The current implementation connects accounts and publishes through Zernio, but the workflow is split:

- finished work is reviewed on the deliverable page;
- accounts, calendar, cadence, and errors live on the Social tab;
- bulk scheduling is one long form;
- “all pieces” can include ineligible work and then skip it;
- one global post-type override can be applied to unlike pieces;
- the calendar is a grouped list rather than an operating surface;
- failures are mixed into history;
- HQ chat can list and schedule, while Grok Bot client agents have no social API;
- social mutations in `social.ts` explicitly require a staff caller.

The result is technically capable but operationally fragmented. An agent cannot safely take over the repetitive coordination because it cannot inspect readiness, preview the exact batch, manage cadence, reschedule, cancel, or resolve account issues through its existing client-scoped token.

## Goals

1. Present one understandable lifecycle from finished work to published post.
2. Keep caption, media, platform variants, destination accounts, schedule, and outcome together.
3. Make “schedule all” mean “schedule all eligible work in this reviewed snapshot.”
4. Give Grok Bot lead and hire agents a complete, client-scoped social action surface.
5. Let agents execute routine reversible work within policy while requiring confirmation for public, destructive, or account-security actions.
6. Make every planned action previewable, idempotent, attributable, and recoverable.
7. Preserve the existing Zernio profile-per-client model, webhook reconciliation, cron fallback, and client approval gate.
8. Close the loop from publication outcome to attention queue and, later, performance recommendations.

## Non-goals

- Blog article publishing.
- Pinterest-specific options or Pinterest-first workflows.
- Storing social-network passwords or OAuth tokens in Handoff.
- Letting an agent complete OAuth on a human’s behalf.
- Letting an agent bypass client approval.
- Replacing Zernio’s network adapters.
- Building a comments or DM inbox before an owner and response policy exist.
- Letting a model construct arbitrary Zernio requests.

WordPress, Wix, and Pinterest must not appear in this social workflow while they are out of scope. Existing cached connections may remain in storage but are excluded from eligible social targets and connection prompts.

## Principles

### One piece, one lifecycle

Every social piece has one visible state:

`Draft → Internal review → Client review → Approved → Ready → Scheduled → Publishing → Published`

Exceptions branch to `Needs attention`. Requested changes return the piece to editing without erasing prior schedules or outcomes.

Approval state and publishing state remain separate fields. “Approved” means the client accepted the content. “Scheduled” means a specific version is queued for specific accounts.

### One command layer

The server owns social rules. React actions, HQ chat, Grok REST routes, auto-schedule, and future automation call the same commands:

- inspect readiness;
- build a publishing plan;
- execute a plan;
- save a platform variant;
- move or cancel a post;
- manage cadence;
- create a connection link or disconnect an account;
- retry a recoverable failure.

No adapter receives permission to call Zernio directly.

### Prepare, preview, execute

Any multi-piece or externally visible action has two stages:

1. **Prepare:** resolve exact piece versions and account IDs, run preflight, choose slots, and return a human-readable plan plus a stable plan hash.
2. **Execute:** submit the plan ID and hash. The server rejects changed, expired, or already-executed plans.

“Select all” is resolved during preparation. Empty arrays never mean “all” on the new API.

### Agents act inside policy

An agent may take action, but its authority is explicit:

- assigned client only;
- lead or hire role;
- action capability;
- content approval;
- optional client publishing policy;
- exact prepared plan;
- confirmation when required.

The model never decides whether it has permission. The server returns `allowed`, `confirmation_required`, or `denied` with reasons.

## Actors

| Actor | Responsibilities |
| --- | --- |
| Client member | Reviews media and copy, requests changes, approves content. |
| Client owner | Client member actions plus account connection and client publishing preferences. |
| Staff | Manages accounts, variants, schedules, errors, cadence, and client communication. |
| Grok lead agent | Coordinates the client’s publishing operation within the client’s agent policy. |
| Grok hire agent | Prepares variants and schedules approved work when assigned; cannot manage account security or standing policy. |
| System | Auto-schedules approved work, receives webhooks, reconciles due posts, and raises attention items. |

## Authorization model

### Capabilities

Each agent assignment receives effective capabilities derived from role and optional overrides:

- `social.read`
- `social.variant.write`
- `social.draft`
- `social.schedule`
- `social.publish_now`
- `social.schedule.manage`
- `social.cadence.manage`
- `social.account.connect`
- `social.account.disconnect`
- `social.failure.retry`
- `social.analytics.read`

Default role policy:

| Action | Lead | Hire | Confirmation |
| --- | --- | --- | --- |
| Read accounts, work, posts, plans, cadence, attention | Yes | Yes | No |
| Save platform copy/options | Yes | Yes | No |
| Save Zernio drafts | Yes | Yes | No |
| Prepare a schedule | Yes | Yes | No |
| Schedule approved work | Yes | Yes | Policy-dependent |
| Reschedule a future post | Yes | Yes | Policy-dependent |
| Cancel a draft or future post | Yes | Yes | Yes |
| Post now | Yes | Optional override | Always |
| Retry an unchanged failed target | Yes | Yes | Policy-dependent |
| Change standing cadence | Yes | No | Yes |
| Create an OAuth connection link | Yes | No | Yes; human completes OAuth |
| Disconnect an account | Yes | No | Always |

“Confirmation” means an approval record tied to the exact plan or command. It can come from an HQ approval card or an authorized client/staff UI confirmation. A chat sentence is not a confirmation token.

### Client publishing policy

Each client has an agent publishing policy:

- `observe`: read and recommend only;
- `draft`: may create drafts and variants;
- `schedule_approved`: may schedule approved work within cadence without per-batch confirmation;
- `managed`: may also reschedule and retry unchanged failures within cadence.

Default is `draft`. `publish_now`, account disconnect, and cadence changes still require confirmation in every policy.

Client Services configures the policy. Grok agents can read it but cannot raise their own authority.

## Target user experience

### Finished-work collection

A deliverable containing social pieces is presented as a collection rather than a form followed by a separate scheduler.

The collection header shows:

- campaign or collection name;
- client;
- date range and time zone;
- target channels;
- `N approved · N needs changes · N unscheduled`;
- `Send for review`;
- `Schedule approved`.

Each piece is a visual card with:

- image, carousel strip, or video poster;
- title and caption excerpt;
- format badge;
- target-platform chips;
- client approval state;
- publishing state and scheduled time;
- preflight warnings;
- primary action for the current state.

Carousels show ordered slides and support explicit reordering. Video cards show duration, aspect ratio, poster, and safe-area state. Static cards show available crops. Reels and Shorts use a vertical preview.

### Approval-to-schedule

From the review surface, an authorized user can:

- `Approve`;
- `Approve and use recommended schedule`;
- `Request changes`;
- `Edit platform variants`.

Approval does not silently publish. If auto-schedule is enabled and allowed, the confirmation text says exactly which cadence will be used.

### Publishing composer

The composer has four steps:

1. **Content:** selected eligible pieces. “Select all eligible” is the primary bulk control.
2. **Destinations:** connected accounts and target-level compatibility.
3. **Timing:** draft, post now, exact schedule, or next cadence slots.
4. **Review:** exact piece/account/time rows, warnings, confirmation requirement, and final action.

The default post type is automatic per piece and platform. Overrides are per piece or per target, never one global coercion across a mixed selection.

The review step states, for example:

> Schedule 6 posts to 3 accounts from Oct 24–28 in America/Toronto.

It lists incompatible and omitted targets before execution. No server-side skip is presented as success without being shown in the prepared plan.

### Social operations page

The client Social tab becomes an operations view:

1. **Needs attention:** failed posts, disconnected accounts, rejected media, missing required data.
2. **Calendar:** week by default, with month and agenda alternatives.
3. **Ready queue:** approved unscheduled pieces.
4. **Accounts:** connected accounts and health.
5. **Publishing cadence:** standing slots and next available times.
6. **History:** drafts, published posts, cancellations, and audit trail.

Calendar events show thumbnail, platform chips, status, and time. Filters include account, platform, collection, and status. Moving an event produces a prepared change and confirmation when policy requires it.

### Publishing cadence

“Auto-schedule” is renamed “Publishing cadence.” It contains:

- account set;
- client-local time zone;
- weekday/time slot grid;
- next five open slots;
- minimum gap;
- maximum posts per account per day;
- blackout dates;
- optional weekend/holiday exclusion;
- queue ordering: campaign order, approval time, or manual priority.

The UI explains:

> When the client approves a piece, place it in the next available slot.

### Client space

Clients see a simpler experience:

- visual work cards;
- media and caption together;
- platform previews;
- approve, approve with recommended schedule, or request changes;
- read-only upcoming calendar by default;
- account-health and reconnect actions for owners.

Zernio is not named in client-facing copy.

## Grok agent experience

### Agent workflow

A Grok agent asked to “schedule all approved social work for Acme next week” must:

1. Resolve Acme through its assignment.
2. Read the client’s agent publishing policy and cadence.
3. List ready pieces and accounts.
4. Call preflight for the selected snapshot.
5. Prepare a plan using next available cadence slots.
6. Summarize exact posts, targets, times, and blocked rows.
7. If `allowed`, execute with the plan ID and hash.
8. If `confirmation_required`, create/present the approval request and stop.
9. Re-read plan outcome and report successes and attention items.

The agent must not interpret an empty list as all, schedule an unapproved version, substitute a post type, or silently omit a failed target.

### Agent REST API

All routes are served from `hq.abra-ca-dabra.app` and authenticate with the existing `caw_…` Bearer token.

#### Read resources

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/agent-social/overview?client=` | Policy, account health, counts, next slots, attention summary. |
| `GET` | `/api/agent-social/accounts?client=` | Connected eligible social accounts. |
| `GET` | `/api/agent-social/pieces?client=&deliverable_id=&state=` | Media metadata, version, approval, publishing state, eligibility. |
| `GET` | `/api/agent-social/posts?client=&status=&from=&to=&limit=` | Scheduled, published, failed, draft, and cancelled posts. |
| `GET` | `/api/agent-social/cadence?client=` | Cadence and next available slots. |
| `GET` | `/api/agent-social/attention?client=` | Actionable failures and account issues. |
| `GET` | `/api/agent-social/plans/{planId}` | Prepared plan and execution outcome. |

#### Prepare and execute

`POST /api/agent-social/plans`

```json
{
  "external_id": "grok-run-123:publish-plan",
  "client": "org-id-or-domain",
  "selection": {
    "mode": "eligible",
    "deliverable_id": "deliverable-id",
    "item_ids": ["item-1", "item-2"],
    "account_ids": ["account-1", "account-2"]
  },
  "timing": {
    "mode": "cadence",
    "timezone": "America/Toronto"
  },
  "overrides": []
}
```

`selection.mode` is `explicit` or `eligible`. `eligible` still carries the resolved IDs returned by the pieces endpoint; it is not an instruction to query an unbounded future set.

The response includes:

```json
{
  "plan_id": "plan-id",
  "plan_hash": "sha256",
  "expires_at": "2026-10-21T19:00:00Z",
  "authorization": "allowed",
  "summary": "6 posts to 3 accounts",
  "rows": [],
  "blocked": [],
  "warnings": []
}
```

`POST /api/agent-social/plans/{planId}/execute`

```json
{
  "external_id": "grok-run-123:publish-execute",
  "plan_hash": "sha256",
  "confirmation_token": null
}
```

Execution returns one outcome per planned piece and target. Repeating the same `external_id` returns the original result with `duplicate: true`.

#### Other mutations

| Method | Route | Purpose |
| --- | --- | --- |
| `PATCH` | `/api/agent-social/pieces/{itemId}/variants` | Save per-platform caption/options with expected version. |
| `POST` | `/api/agent-social/posts/{postId}/move-plan` | Prepare a reschedule. |
| `POST` | `/api/agent-social/posts/{postId}/cancel-plan` | Prepare cancellation. |
| `POST` | `/api/agent-social/attention/{id}/retry-plan` | Prepare unchanged retry. |
| `PUT` | `/api/agent-social/cadence-plan` | Prepare standing cadence change; lead only. |
| `POST` | `/api/agent-social/connect-plan` | Prepare an OAuth link; lead only. |
| `POST` | `/api/agent-social/disconnect-plan` | Prepare account disconnect; lead only. |

Every mutation uses the same plan/confirmation/idempotency machinery. A connection-plan execution returns a short-lived URL for the human. It never returns network credentials.

### HQ chat tools

HQ chat receives parity tools backed by the same command layer:

- `social_overview`
- `list_social_pieces`
- `prepare_social_publish`
- `execute_social_plan`
- `save_social_variant`
- `prepare_social_move`
- `prepare_social_cancel`
- `prepare_social_retry`
- `get_social_cadence`
- `prepare_social_cadence`
- `prepare_social_connect`
- `prepare_social_disconnect`

Existing `list_social_accounts`, `list_social_posts`, and `schedule_social` stay during migration, then are deprecated after all callers use plans.

## Domain model

### Existing records retained

- `social_profiles`
- `social_accounts`
- `social_posts`
- `social_piece_settings`
- `social_webhook_events`
- `social_autopost`

### New records

#### `social_collections`

Groups finished pieces into one publishing context.

| Field | Meaning |
| --- | --- |
| `id` | Collection ID. |
| `organization_id` | Client owner. |
| `deliverable_id` | Source deliverable when applicable. |
| `name` | Human label. |
| `goal` | Optional campaign goal. |
| `starts_at`, `ends_at` | Optional operating window. |
| `timezone` | Client-local zone. |
| `status` | `draft`, `review`, `active`, `complete`, `archived`. |
| `created_at`, `updated_at` | Audit times. |

#### `social_variants`

First-class target variants replace opaque per-network JSON over time.

| Field | Meaning |
| --- | --- |
| `id` | Variant ID. |
| `item_id`, `version` | Exact source version. |
| `platform` | Target platform. |
| `caption`, `first_comment`, `title`, `tags_json` | Publish fields. |
| `post_type` | Optional target override. |
| `options_json` | Validated platform options only. |
| `revision` | Optimistic concurrency integer. |
| `updated_by_kind`, `updated_by_id`, `updated_at` | Audit. |

#### `social_publish_plans`

Immutable prepared intent.

| Field | Meaning |
| --- | --- |
| `id` | Plan ID. |
| `organization_id` | Client. |
| `actor_kind`, `actor_id` | Staff, agent, client, or system. |
| `request_json` | Normalized selection and timing. |
| `rows_json` | Exact item version, target, type, and instant rows. |
| `blocked_json`, `warnings_json` | Preflight result. |
| `plan_hash` | Hash over normalized immutable fields. |
| `authorization` | `allowed`, `confirmation_required`, `denied`. |
| `expires_at` | Execution deadline. |
| `executed_at`, `result_json` | One-shot outcome. |
| `created_at` | Audit. |

#### `social_action_idempotency`

| Field | Meaning |
| --- | --- |
| `actor_kind`, `actor_id`, `external_id` | Unique request identity. |
| `action` | Prepared or executed command. |
| `resource_id` | Plan/post/account when available. |
| `response_json` | Exact first response. |
| `created_at` | Audit. |

Unique key: `(actor_kind, actor_id, external_id)`.

#### `social_agent_policies`

| Field | Meaning |
| --- | --- |
| `organization_id` | Client. |
| `mode` | `observe`, `draft`, `schedule_approved`, `managed`. |
| `capabilities_json` | Optional explicit grants/revocations. |
| `updated_by`, `updated_at` | Staff audit. |

#### `social_attention_items`

Materialized actionable issue, deduped by source and target:

- disconnected account;
- upload failure;
- rejected post;
- missing target requirement;
- stale plan;
- webhook/cron disagreement.

Status is `open`, `in_progress`, `resolved`, or `dismissed`. Each type has a constrained recovery action.

## Publishing state derivation

The service derives display state rather than adding one overloaded status:

- **Draft:** source piece is not approved.
- **Client review:** deliverable is visible for review and piece is pending.
- **Approved:** piece status is approved.
- **Ready:** approved, has at least one compatible active target, no live post covering every intended target.
- **Scheduled:** at least one future social post exists.
- **Publishing:** Zernio status is sending.
- **Published:** all intended targets are published.
- **Needs attention:** any intended target failed or account authorization is invalid.

Partial publication is both `Published` and `Needs attention`; the UI shows the successful links and failed targets.

## Preflight contract

Preflight runs per piece version and account. Each row returns:

- eligibility and reason;
- resolved post type;
- media count and kinds;
- platform constraints;
- required fields;
- duplicate/live-post check;
- approval requirement;
- chosen schedule instant;
- cadence conflict;
- warnings;
- normalized platform options.

Preflight uses `planTarget` as a starting point but must not perform uploads or external writes.

Blocked rows never enter the execution set. The plan preserves them so humans and agents can explain the omission before execution.

## Confirmation and approval records

Confirmation records contain:

- plan ID and hash;
- approver identity and kind;
- authorized action;
- expiry;
- optional note;
- created and used times.

A token is single-use and cannot authorize a changed plan. Account disconnect and post-now confirmations expire after 15 minutes. Schedule/cadence confirmations expire with the plan.

## Idempotency and concurrency

- Every agent mutation requires `external_id`.
- UI and HQ chat mutations generate an idempotency key.
- A repeated key returns the first status and body.
- Plan execution is one-shot.
- Variant, cadence, move, and cancel commands include expected revision or `updated_at`.
- A changed source piece version invalidates an unexecuted plan.
- A changed account state invalidates affected rows.
- Existing duplicate protection on `(item_id, version, live account targets)` remains as defense in depth.

## Audit and activity

Every mutation writes an activity with:

- actor kind and ID;
- client;
- action;
- plan ID;
- affected item/version/account/post IDs;
- confirmation ID when used;
- outcome;
- `via`: `hq_ui`, `client_ui`, `hq_chat`, `grok_agent`, or `system`.

Required kinds include:

- `social.plan.prepared`
- `social.plan.executed`
- `social.variant.updated`
- `social.post.moved`
- `social.post.cancelled`
- `social.post.retried`
- `social.cadence.updated`
- `social.account.connect_requested`
- `social.account.disconnected`
- `social.attention.resolved`

Do not place captions, tokens, or full request bodies in the activity feed.

## Error behavior

| Condition | Response |
| --- | --- |
| Missing/invalid agent token | `401 unauthorized` |
| Agent not assigned to client | `403 forbidden` |
| Capability or role denied | `403 forbidden` with stable reason code |
| Resource not in client | `404 missing` |
| Unapproved work for schedule/post-now | Blocked preflight row |
| Plan changed or expired | `409 stale_plan` |
| Revision changed | `409 conflict` |
| Confirmation absent/expired | `409 confirmation_required` |
| Zernio not configured | `503 social_provider_unavailable` |
| Zernio timeout after local row created | `202 uncertain`; attention item and reconcile job |
| Duplicate external ID | Original response with `duplicate: true` |
| Rate limited | `429 retry_after` without executing additional rows |

Bulk execution is not represented as one boolean. It returns `succeeded`, `failed`, `uncertain`, and `not_attempted` rows.

## Security requirements

- Zernio credentials remain Worker secrets.
- OAuth URLs are short-lived and redirect only to allowlisted HQ/client origins.
- Client, deliverable, item, post, account, plan, and attention ownership are checked server-side.
- Agents cannot provide arbitrary media URLs; media must resolve from the piece’s approved R2 files.
- Platform options are schema-validated and allowlisted.
- Captions and metadata retain existing size limits.
- Post-now, disconnect, cancellation, and cadence changes use confirmation policy.
- Rate limits apply per agent and client.
- Agent policy changes are staff-only.
- Prompt text and client content are treated as data, never authorization.

## Observability

Record metrics for:

- prepared plans;
- plan conversion to execution;
- blocked rows by reason;
- time from approval to schedule;
- publish success by platform;
- uncertain outcomes;
- open attention age;
- agent actions by capability and confirmation rate;
- duplicate requests prevented;
- OAuth reconnect frequency.

Never include captions, media, API keys, or confirmation tokens in logs.

## Phase 4 results

After Zernio analytics are available, published target rows receive snapshots. Grok agents may:

- read per-post and per-account results;
- summarize performance;
- compare format/platform outcomes;
- recommend a next content brief;
- prepare an evergreen reuse plan.

An agent cannot automatically republish based only on performance. Reuse creates a new piece/version and follows normal approval and publishing policy.

## Acceptance criteria

### Workflow and UI

- [ ] Finished-work cards show media, approval, target, schedule, and publishing state together.
- [ ] “Select all eligible” excludes unapproved and incompatible rows before submission.
- [ ] The final review lists every exact target and time.
- [ ] Mixed pieces default to per-piece/per-target post types.
- [ ] Needs-attention issues appear above the calendar with a recovery action.
- [ ] Week calendar and ready queue operate from the same data as agent reads.
- [ ] Client approval can offer a recommended schedule without silently publishing.
- [ ] WordPress, Wix, and Pinterest do not appear as social targets.

### Grok agents

- [ ] Any assigned agent can read the client’s social overview.
- [ ] Lead/hire capability differences are enforced server-side.
- [ ] Agents can save variants, create drafts, prepare schedules, and execute authorized schedules.
- [ ] Lead agents can prepare account and cadence changes.
- [ ] Agents can prepare move, cancel, and retry actions.
- [ ] Post now and disconnect cannot execute without exact confirmation.
- [ ] No agent can publish an unapproved piece.
- [ ] Every mutation is idempotent and attributed to the agent.
- [ ] Agents receive structured blocked and partial outcomes.
- [ ] Agents can complete the documented “schedule all approved work” flow without staff translating IDs manually.

### Reliability

- [ ] A stale piece, account, cadence, or plan cannot execute.
- [ ] Retries do not duplicate public posts.
- [ ] Uncertain provider outcomes create an attention item and reconcile.
- [ ] Webhook and cron updates resolve the same target-level outcome records.
- [ ] Existing staff and client posting behavior remains functional during migration.
- [ ] Tests cover authorization, confirmation, idempotency, concurrency, preflight, and partial provider failure.

## Rollout

1. Ship the shared command layer and read-only agent API behind `SOCIAL_AGENT_ACTIONS`.
2. Enable plan preparation for staff, HQ chat, and selected Grok lead agents.
3. Enable draft and confirmed schedule execution for an internal client.
4. Enable `schedule_approved` policy per client.
5. Move UI scheduling to plans.
6. Deprecate empty-list-means-all and the direct `schedule_social` mutation.
7. Enable managed reschedule/retry only after audit and attention metrics are stable.
8. Add analytics-driven recommendations after publishing operations are stable.

## Open product decisions

1. Should client owners be allowed to grant `schedule_approved`, or must Client Services do it?
2. Should hires receive `social.schedule` by default or only through an explicit capability override?
3. How long should prepared schedule plans remain valid: 15, 30, or 60 minutes?
4. Which holiday calendar, if any, controls “skip holidays”?
5. Does “Approve and use recommended schedule” require a second confirmation when the cadence changes between review and execution?

Recommended defaults: Client Services grants policy; hires can prepare but need an explicit schedule grant; plans expire in 30 minutes; holidays are omitted until a locale source is chosen; changed cadence invalidates the recommendation and requires review.
