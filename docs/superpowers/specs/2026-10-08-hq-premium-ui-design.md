# Handoff HQ — Premium UI Design Specification

**Date:** 2026-10-08
**Product:** Handoff HQ (staff dashboard at `hq.abra-ca-dabra.app`)
**Status:** Proposed, implementation-ready
**Requirements:** HQU-001 through HQU-064
**Lives in:** [`handoff/`](../../../handoff/) in this repository, deployed as
the `handoff-hq` Cloudflare Worker (`npm run deploy:hq`). Shares D1 and R2
with the client-facing `handoff` Worker.

## Executive summary

HQ is where the studio runs the day. Staff open it to see what needs them,
move leads, check clients, push work, talk to the agent, and watch the swarm.
Today the screens are honest and functional but they read like a scaffold:
every page is a narrow column of same-weight cards, every form is always
open, every list is a stack of boxes with no scanning aids, and the shell
says "Handoff" three times. Nothing tells the eye where to look first.

This spec turns HQ into a premium operations console without changing what
it does. The dark studio look stays. The changes are in hierarchy, density,
information design, feedback, and polish.

```text
staff signs in
  → shell: grouped nav with live counts, breadcrumb context bar, ⌘K palette
  → Today: metric strip, "Needs you" queue, then feed
  → Pipeline: Leads table or board with collapsed add form; Schema results list
  → Delivery: Work table with status color and counts; Project two-column
  → Records: Clients table with health + next step; Client 360 with tabs
  → Automation: Chat with thread list + rendered Markdown; Swarm focus mode
  → System: GitHub connection with real actions; Spaces as named list
```

No new business capability is introduced. Every data query, server action,
and permission check that exists today keeps working. The work is in
`handoff/src/app/*` pages, `handoff/src/components/ui/*` primitives, and
`handoff/src/app/globals.css` tokens.

## Current state

Two audit passes were made against the live HQ on 2026-10-08 as `admin`.
Findings, grouped by severity.

### Shell and navigation

- Nine flat links under one "Studio" label. No grouping, no counts, no
  visual separation between daily pulse, pipeline, records, and system.
- The word "Handoff" appears in the sidebar header, again in the inset
  header, and a third time inside workspace pages (`/w/[slug]`). The inset
  header carries no page context.
- Nav label says "Spaces" but the page title says "Staff tools".
- "Swarm" renders an iframe to a separate origin with no loading state, no
  error state, no way to open it in a new tab, and no focus mode.
- No command palette, no keyboard shortcuts, no global search.

### Layout and typography

- Every page uses `py-16` top padding and a `max-w-3xl` (or `2xl`, `xl`,
  `5xl`, `6xl`) column with no shared scale. The first useful row sits far
  below the fold on a laptop.
- Headings all use Tektur at `text-4xl`. Card titles, kickers, and labels
  compete at similar weights. Numbers use proportional figures so columns
  do not line up.
- Orange (`--primary`) marks primary buttons, destructive buttons, kickers,
  and active filters at once. Cyan marks the brand link only. There are no
  semantic colors for late, blocked, waiting, or complete.
- `.studio-panel` and `.studio-kicker` exist but only Schema uses them.

### Pages

- **Today** is an activity dump. "Needs you" is one card among many. There
  is no metric strip, no count of late or blocked items, and the feed has
  no time grouping.
- **Leads** shows the add-lead form fully expanded above the list. Filters
  are hand-styled native inputs and a text-link view toggle. Cards repeat
  the company name, show placeholder lines like "No score yet." and
  "No next step.", and the board view clips horizontally.
- **Schema** uses a different visual language from every other page. The
  results history is a row of truncated text links. The raw `NEEDS_US`
  prefix leaks into answer text.
- **Clients** is a plain list of names with no search, sort, health, next
  step, owner, or last activity.
- **Client 360** (`/clients/[id]`, 440 lines) stacks around fifteen cards
  in a `max-w-2xl` column with every form inline and always open.
- **Work** has two rows of filter buttons with no counts. Rows have no
  status color. Grouping is a second button row.
- **Project** is a single-column stack. Forms hide at the bottom of cards.
  Status updates show no health color.
- **Deliverable** images render with `alt=""`.
- **Chat** is a single scrolling pane with no thread list, no rendered
  Markdown, and no empty state guidance.
- **Spaces** (`/admin`) lists staff by email only, titles itself "Staff
  tools", and links across hosts with no indicator.
- **GitHub settings** shows "not connected" with no action and an error
  state with no retry.
- `HqHome` leaves a signed-in non-staff user with no path forward.

### Components

Eleven primitives exist: badge, button, card, input, label, separator,
sheet, sidebar, skeleton, textarea, tooltip. Missing for a console of this
size: table, tabs, dialog, dropdown-menu, select, popover, breadcrumb,
segmented control, toast, command palette, metric, status dot, empty state,
page header.

## Goals

- Make the first screen of every page answer "what needs me" in under two
  seconds.
- One visual system: a single page frame, one heading scale, one status
  color scale, one density scale.
- Replace stacked cards with purpose-built tables, timelines, metric strips,
  and drawers where the data is tabular, sequential, numeric, or secondary.
- Collapse every "Add" and "Edit" form behind a button, sheet, or dialog.
- Give every async action visible feedback and every list a real empty,
  loading, and error state.
- Reach keyboard users: command palette, shortcuts, focus rings, live
  regions, alt text.
- Keep every existing route, server action, query, and permission check.

## Non-goals

- No change to the marketing site, Readiness Check, or the client-facing
  Handoff portal beyond the links that cross into HQ.
- No new data model, migration, or server action unless a requirement names
  one explicitly (HQU-017 nav counts, HQU-041 client health use existing
  queries).
- No light theme.
- No new third-party UI framework. shadcn-style primitives built on the
  existing `radix-ui` package only. Small focused packages are allowed where
  named (`cmdk`, `sonner`, `react-markdown`).
- No redesign of the Swarm orchestrator itself; only the HQ frame around it.

## Terms

| Term | Meaning |
|---|---|
| Shell | `StaffShell`: sidebar, context bar, and content area wrapped around every HQ page. |
| Context bar | The slim top bar inside the content area. Replaces the second "Handoff" label. Holds breadcrumb, page actions, and ⌘K trigger. |
| Page frame | `PageFrame`: the shared outer element that sets width, padding, and header slot for a page. |
| Metric strip | A row of 3–5 `Metric` tiles with a label, a tabular number, and an optional delta or link. |
| Status token | A CSS variable and matching badge/dot style for `late`, `blocked`, `waiting`, `active`, `complete`, `neutral`. |
| Drawer | A `Sheet` opened from the right that holds a form or a detail view without leaving the list. |
| Palette | The ⌘K command palette. Navigates, searches records, and runs page actions. |
| Density | A user toggle between `comfortable` (default) and `compact` row heights. |

## Design system

### Tokens

**HQU-001.** Add semantic status tokens to `globals.css` under `:root` and
expose them through `@theme inline`:

| Token | Use | Value |
|---|---|---|
| `--status-late` | Overdue, failed, needs rescue | `#ff4b24` (existing primary red-orange) |
| `--status-blocked` | Blocked, waiting on someone outside | `#f2b84b` |
| `--status-waiting` | Waiting on us, in review | `#8debf2` (existing optic) |
| `--status-active` | In progress, healthy | `#c6ffb3` (existing phosphor) |
| `--status-complete` | Done, shipped, archived | `#aaa49a` (existing muted-fg) |
| `--status-neutral` | Not started, unknown | `#2a2926` (existing border) |

Each token has a `-fg` pair for text on filled badges. No page may hard-code
a hex color for a status after this change.

**HQU-002.** Orange (`--primary`) is reserved for the single primary action
on a page and for `late`. Cyan (`--optic`) marks selected, current, and
context. Phosphor marks healthy and complete-recently. Kickers
(`.studio-kicker`) switch from orange to `--muted-foreground`.

**HQU-003.** Add a spacing contract: page top padding `py-8` on `lg+`,
`py-6` below; section gap `gap-6`; card internal padding `p-4`; row height
`h-10` comfortable, `h-8` compact. Remove every `py-16`.

**HQU-004.** Typography scale. Tektur (`font-heading`) is used only for the
page `h1` (`text-2xl lg:text-3xl`) and for metric values. Section headings
use Plex Sans `text-sm font-medium tracking-tight`. Kickers and table
headers use Plex Mono `text-[11px] uppercase tracking-wide`. All numbers in
tables, metrics, and counts use `tabular-nums`.

**HQU-005.** Page widths. Three sizes only, set by `PageFrame`:
`narrow` (`max-w-2xl`: login, new client, settings), `default`
(`max-w-5xl`: Today, Clients, Work, Project, Deliverable, Chat, Spaces),
`wide` (`max-w-[1400px]`: Leads, Schema, Client 360, Swarm). No page sets
its own `max-w`.

**HQU-006.** Motion. All transitions 150–200 ms, `ease-out`. Honor
`prefers-reduced-motion: reduce` by disabling transforms and
`tw-animate-css` entrances globally.

### Shared components

**HQU-007.** Add these primitives to `handoff/src/components/ui/`, built on
the installed `radix-ui` package in the same style as the existing files:
`table`, `tabs`, `dialog`, `dropdown-menu`, `select`, `popover`,
`breadcrumb`, `toggle-group` (segmented control), `scroll-area`.

**HQU-008.** Add these composed components to `handoff/src/components/`:

| Component | Purpose |
|---|---|
| `page-frame.tsx` | Width, padding, header slot (`title`, `kicker`, `description`, `actions`). |
| `metric.tsx` + `metric-strip.tsx` | Label, tabular value, optional delta and href. |
| `status-badge.tsx` + `status-dot.tsx` | Render any domain status via `statusToken()` (HQU-009). |
| `empty-state.tsx` | Icon, one-line title, one-line hint, one primary action. |
| `error-state.tsx` | Title, detail, `Retry` action (form or link). |
| `data-table.tsx` | Header row, sortable columns via `?sort=`, sticky header, row link, empty slot. Server-rendered; no client table library. |
| `timeline.tsx` | Vertical list grouped by day with a status dot per item. |
| `external-link.tsx` | Anchor with `↗` icon, `target="_blank"`, `rel="noreferrer"`. |
| `form-drawer.tsx` | `Sheet` wrapper with title, description, and footer slot for Save/Cancel. |
| `markdown.tsx` | Renders agent output with `react-markdown`; code, lists, links, tables; no raw HTML. |
| `command-palette.tsx` | ⌘K palette using `cmdk` (HQU-014). |
| `toaster.tsx` | `sonner` host mounted once in `StaffShell` (HQU-021). |

**HQU-009.** Add `handoff/src/lib/status-token.ts` exporting
`statusToken(domain, value)` that maps every existing status enum to a
token in HQU-001. Domains: task (`TASK_STATUS_LABEL` keys), project
(`PROJECT_STATUS_LABEL`), health (`HEALTH_LABEL`), deliverable
(`DELIVERABLE_STATUS_LABEL`), deal stage (`DEAL_STAGES`), schema check
result, lead stage, GitHub connection. Pure, tested, no React.

**HQU-010.** Add `handoff/src/lib/format.ts` with `formatCount(n)`,
`formatRelative(date, now)` (`2h`, `3d`, `Mar 4`), `formatMoney(cents)`,
and `initials(name)`. Pure, tested. `activity-time.tsx` keeps its client
hydration role but calls `formatRelative`.

## Shell

**HQU-011.** Nav is grouped. `STUDIO_NAV` in `staff-links.ts` becomes
`STUDIO_NAV_GROUPS`, an ordered array of `{ label, items }`:

| Group | Items |
|---|---|
| Pulse | Today `/` |
| Pipeline | Leads `/leads`, Schema `/schema` |
| Delivery | Work `/work`, Projects `/projects` |
| Records | Clients `/clients`, Spaces `/spaces` |
| Automation | Chat `/chat`, Swarm `/swarm` |
| System | GitHub `/settings/github` |

A flat `STUDIO_NAV` export remains, derived from the groups, so existing
tests and consumers keep working. `/projects` is a new index page
(HQU-048). `navIsActive` is unchanged.

**HQU-012.** Sidebar header shows the wordmark once: "Handoff" in mono
cyan, with "HQ" in muted mono beside it. The inset header's duplicate
"Handoff" span is removed.

**HQU-013.** The inset header becomes the context bar: `SidebarTrigger`,
then `Breadcrumb` built by `breadcrumbsFor(pathname, labels)` in a new
pure module `handoff/src/app/breadcrumbs.ts`, then a right-aligned slot for
page actions and the ⌘K button. Breadcrumb trail examples:
`Clients / Strong Foam`, `Delivery / Work`, `Projects / Site rebuild /
Deliverable`. Record names are passed in by the page via a
`ContextBar` context so the pure builder never fetches.

**HQU-014.** Command palette. ⌘K / Ctrl+K opens a `cmdk` palette with
sections: Go to (every nav item), Recent (last 8 records visited, stored
in `sessionStorage`), Clients (fuzzy over client names loaded once per
session from a small JSON route `/api/hq/palette`), Actions (page-specific
actions registered through context: New lead, New client, Run schema
check, New task). Enter navigates or fires the action. Escape closes.

**HQU-015.** Keyboard shortcuts, active when focus is not in an input:
`g t` Today, `g l` Leads, `g c` Clients, `g w` Work, `g h` Chat, `g s`
Swarm, `/` focus page search, `?` show shortcut sheet, `n` open the page's
primary "New" drawer when one exists.

**HQU-016.** Density toggle in the sidebar footer. Persists to
`localStorage` key `hq:density:v1`. Sets `data-density` on `<html>` before
hydration through an inline script so there is no flicker. Tables, lists,
and timelines read it.

**HQU-017.** Nav badges. Today shows a count of "Needs you" items; Work
shows late count; Leads shows new leads in the last 7 days. Counts come
from one new query `navCounts(sql, caller, now)` in `src/db/crm.ts` that
runs in `StaffShell` (server) and is cached per request. A badge renders
only when the count is greater than zero.

**HQU-018.** Sidebar footer shows the signed-in person: initials avatar,
name or email, role label, and a `DropdownMenu` with Density, Shortcuts,
Sign out.

**HQU-019.** Mobile. Below `md`, the sidebar is a `Sheet`. The context bar
stays sticky. Tables collapse to stacked rows with the first two columns
visible and the rest behind a disclosure. Drawers are full-width.

## Feedback and states

**HQU-020.** Every list has an `EmptyState` with one specific next action.
Copy table:

| List | Title | Action |
|---|---|---|
| Needs you | Nothing needs you | Link to Work |
| Leads | No leads yet | New lead |
| Work (filtered) | Nothing late | Clear filter |
| Clients | No clients yet | New client |
| Chat | Ask about any client, lead, or task | Three starter prompts |
| Schema results | No checks yet | Run a check |
| GitHub repos | Not connected | Connect GitHub |

**HQU-021.** Server actions report completion. Each form action returns
`{ ok: true, message }` or `{ ok: false, error }`; the client wrapper
shows a `sonner` toast and, on error, keeps the drawer open with the error
text next to the field. No action redirects silently.

**HQU-022.** Loading. Every HQ route gets a `loading.tsx` rendering the
`PageFrame` with the real heading and `Skeleton` rows that match the
final layout height.

**HQU-023.** Error. Every HQ route group gets an `error.tsx` rendering
`ErrorState` with a Retry button that calls `reset()`.

**HQU-024.** Pending. Buttons inside forms show a spinner and disable while
`useFormStatus().pending` is true. Row-level actions use optimistic state
where safe (mark task done, move deal stage).

## Pages

### Today (`/`)

**HQU-025.** `PageFrame` default width. Header kicker shows the date and
day; title is a greeting with first name; actions: New lead, New task,
⌘K.

**HQU-026.** Metric strip: Needs you, Late, Blocked, Due this week, Active
clients. Each metric links to the filtered Work or Clients page.
Computed from the existing `TodayBoard` plus `listWork` counts; no new
tables.

**HQU-027.** "Needs you" is a full-width section above the fold with
`StatusDot`, title, client, age (`formatRelative`), and one inline action
per row. Max 8 rows, then "View all" to Work.

**HQU-028.** Below, a two-column layout on `lg+`: left `Timeline` of
activity grouped by Today / Yesterday / Earlier with a type filter
(`ToggleGroup`: All, Clients, Leads, Agent); right rail with Pipeline
summary (deals by stage, tabular), Clients at risk (health not healthy),
and Agent runs (last 5 with status).

### Leads (`/leads`)

**HQU-029.** Add-lead form moves into a `FormDrawer` opened by a
primary "New lead" button and the `n` shortcut. The list is the first
thing on the page.

**HQU-030.** Filters are a `ToggleGroup` by stage with counts, a `Select`
for owner, and a search `Input`. View toggle (List / Board) is a
`ToggleGroup` with icons, persisted in the URL `?view=`.

**HQU-031.** List view is a `DataTable`: Company, Contact, Stage
(`StatusBadge`), Score (tabular, blank when none), Next step (blank when
none), Owner (initials), Updated (`formatRelative`). Row click opens the
lead. No "No score yet." or "No next step." text anywhere.

**HQU-032.** Board view scrolls horizontally inside a `ScrollArea` with
fixed-width columns, a count per column header, and compact cards: company,
contact, score chip, age. Drag is out of scope; stage moves use the
existing stage action from a row `DropdownMenu`.

### Schema (`/schema`)

**HQU-033.** Schema adopts `PageFrame` wide and the shared heading scale.
`.studio-panel` is removed from the page; the gradient treatment moves to
a single hero `Metric` for the latest result only.

**HQU-034.** Results history is a `DataTable`: Site, Checked
(`formatRelative`), Result (`StatusBadge` from schema token), Issues
(tabular count), Report (link). The run form is a `FormDrawer`.

**HQU-035.** `stripAnswerPrefix(text)` in `src/lib/schema-report.ts`
removes machine prefixes such as `NEEDS_US` and returns `{ flag, text }`.
The page renders the flag as a `StatusBadge` and the clean text as prose.
Pure, tested.

### Clients (`/clients`)

**HQU-036.** `DataTable`: Client, Kind (`OrgKind` badge), Health
(`StatusDot` + label), Owner, Open work (tabular), Next step, Last
activity. Search input filters by name server-side via `?q=`. Sort via
`?sort=`. "New client" is a primary button that opens the existing
`/clients/new` form in a `FormDrawer`.

**HQU-037.** Health and next step come from existing `client-plan` and
`listWork` data joined in a new pure helper
`clientRows(orgs, work, plans)` in `src/lib/client-rows.ts`. Tested.

### Client 360 (`/clients/[id]`)

**HQU-038.** `PageFrame` wide. Header: client name, kind badge, health
dot, owner avatars; actions: Message, New task, Link space, More
(`DropdownMenu` with Edit, Archive).

**HQU-039.** Body is `Tabs`: Overview, Work, Threads, Files & spaces,
Repos, Activity, Settings. The active tab lives in `?tab=` so links deep-
link. Each tab renders only its cards.

**HQU-040.** Overview tab is two columns on `lg+`: left Plan and Next
steps and Recent activity; right rail with Contacts, Spaces, Repos,
Deals. Every "Add" form on the page (activity, repo, thread, link space,
edit client) moves into a `FormDrawer` opened by a button in the relevant
card header.

**HQU-041.** The page stays under 200 lines by splitting into
`clients/[id]/overview-tab.tsx`, `work-tab.tsx`, `threads-tab.tsx`,
`files-tab.tsx`, `repos-tab.tsx`, `activity-tab.tsx`, `settings-tab.tsx`.
No logic changes.

### Work (`/work`)

**HQU-042.** Filters are one `ToggleGroup` with counts: All (n), Late (n),
This week (n), Blocked (n). Grouping is a `Select` labelled "Group by".
Counts come from `workCounts(tasks, now)` in `src/app/work/query.ts`.
Tested.

**HQU-043.** Rows render in a `DataTable` grouped by the chosen key with a
sticky group header showing name and count. Columns: `StatusDot`, Task,
Client, Project, Owner, Due (`formatRelative`, red when late), Actions
(Done via optimistic action, Open).

**HQU-044.** `?density=` is not used; density follows HQU-016.

### Projects

**HQU-045.** Project page is two columns on `lg+`: left Milestones
(`Timeline` with status dots), Tasks (`DataTable`), Deliverables
(`DataTable`); right rail with Status (health dot + label + latest
update), Repos (activity summary), Audience, People.

**HQU-046.** Status updates show `StatusDot` by health. "Post update" and
"Add milestone" and "Add task" are `FormDrawer`s.

**HQU-047.** Deliverable page: media grid renders `alt` from the file label
(`fileLabel()` already exists); feedback list is a `Timeline`; feedback
form is inline at the bottom (the one place a form stays inline, because
it is the page's purpose).

**HQU-048.** New `/projects` index page: `DataTable` of projects across
clients with Client, Project, Status, Health, Due, Open tasks. Uses
existing project list queries. Added to nav under Delivery (HQU-011).

### Chat (`/chat`)

**HQU-049.** Two-pane layout on `lg+`: left `ScrollArea` of conversations
(title, client, `formatRelative`), with New chat at top; right the active
thread. Below `lg`, the list is a `Sheet`.

**HQU-050.** Messages render through `Markdown`. Tool calls render as a
collapsed row with tool name and a `StatusDot`, expanding to show inputs
and outputs in mono. Agent messages show the agent avatar; staff messages
align right.

**HQU-051.** Empty thread shows three starter prompts from
`hq-chat-playbook` as buttons that prefill the composer.

**HQU-052.** Composer is sticky at the bottom, `Textarea` that grows to 6
lines, Enter sends, Shift+Enter newline, a pending state while the agent
replies, and a visible "Stop" when streaming.

### Swarm (`/swarm`)

**HQU-053.** The iframe sits in a `PageFrame` wide with a thin toolbar:
title, connection state (`StatusDot` driven by `load`/`error` events),
Focus mode toggle, Open in new tab (`ExternalLink`). Focus mode hides the
sidebar and context bar and fills the viewport; Escape exits.

**HQU-054.** While loading, a `Skeleton` covers the frame. On error, an
`ErrorState` with Retry (reloads the iframe) and Open in new tab.

### Spaces (`/spaces`, served by `/admin`)

**HQU-055.** Page title becomes "Spaces". Sub-navigation (`Tabs`): Spaces,
Held files, Staff, Templates mapping to the existing `/admin/*` routes.

**HQU-056.** Spaces tab is a `DataTable`: Space, Client, Owner, Files
(tabular), Storage used, Last upload, Open (`ExternalLink` to the client
host). Staff tab shows initials avatar, name when known, email, role
badge, and the existing staff form in a `FormDrawer`. New workspace form
moves into a `FormDrawer`.

### GitHub (`/settings/github`)

**HQU-057.** Not connected: `EmptyState` with a primary "Connect GitHub"
button that starts the existing install flow. Connected: connection card
with org, installation, repo count, and a `DataTable` of repos with
client link and last activity. Error: `ErrorState` with Retry.

**HQU-058.** A `/settings` layout with `Tabs`: GitHub, Shortcuts (read-
only list of HQU-015), Appearance (density). Nav item stays
`/settings/github`.

### Entry and auth

**HQU-059.** `HqHome` for a signed-in non-staff person shows an
`EmptyState`: "This account is not on the HQ staff list", with Sign out
and a link to the client portal host.

**HQU-060.** Login page uses `PageFrame` narrow, the wordmark once, and
field-level errors. Passwords and tokens are never logged or echoed.

**HQU-061.** Workspace pages under HQ (`/w/[slug]`) drop their own
wordmark and use the context bar breadcrumb `Spaces / {space name}`.

## Accessibility

**HQU-062.** Every interactive element has a visible focus ring using
`--ring`. Icon-only buttons have `aria-label`. Status is never color-only:
every `StatusDot` has a `sr-only` label or an adjacent text label.
Toasts use `aria-live="polite"`. External links carry the `↗` icon and
"opens in new tab" in `sr-only`. Images have meaningful `alt`. The
command palette traps focus and returns it on close. Contrast meets WCAG
AA on the canvas color for all tokens in HQU-001.

## Copy

**HQU-063.** Short grade-5 sentences. Say "space", "storage limit",
"admin", "delete". Empty states state what is true, then what to do. No
placeholder text that describes an absence ("No score yet.") in table
cells; leave the cell blank.

## Environment

No new environment variables. `/api/hq/palette` (HQU-014) is a staff-only
route behind `requireHqStaffPage()` semantics returning
`{ clients: [{ id, name }] }`. New packages: `cmdk`, `sonner`,
`react-markdown` (and `remark-gfm`). No new Cloudflare bindings.

## Acceptance

**HQU-064.** Done when all of the following are true on the deployed
`handoff-hq` Worker:

- No HQ page uses `py-16`, sets its own `max-w`, or hard-codes a status
  color.
- "Handoff" renders once in the shell. Every page shows a breadcrumb.
- Nav is grouped per HQU-011 and shows counts per HQU-017.
- ⌘K opens the palette on every HQ page and navigates to each nav item.
- Today, Leads, Clients, Work, Projects, Schema, Spaces, GitHub all render
  a `DataTable` or `Timeline` for their primary list, with an `EmptyState`
  when empty.
- Every Add/Edit form on Leads, Clients, Client 360, Projects, Spaces, and
  Schema opens in a drawer or dialog and reports success or error with a
  toast.
- Chat renders Markdown and lists conversations.
- Swarm shows loading, error, focus mode, and open-in-new-tab.
- `npm test`, `npm run lint`, and `npm run build` pass in `handoff/`.
- Keyboard-only walkthrough of Today → Leads → New lead drawer → Clients →
  Client 360 tabs → Work → Chat completes without a mouse.
