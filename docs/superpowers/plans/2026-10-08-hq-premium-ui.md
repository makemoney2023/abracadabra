# Handoff HQ Premium UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the staff dashboard at `hq.abra-ca-dabra.app` feel premium. One
shell, one set of tokens, one table, one drawer, one empty state. Every page
uses them. Nothing changes in the data model.

**Architecture:** The HQ app is the `handoff/` Next.js 16 App Router project
deployed as the `handoff-hq` Worker. This plan adds a small design system in
`handoff/src/components/` on top of the existing shadcn-style primitives, a
few pure helpers in `handoff/src/lib/`, and then rebuilds each page on those
parts. Server components keep doing the reads. Client components only own
local UI state (drawer open, palette open, density). Server actions keep their
signatures and gain a `{ ok, message | error }` result for toasts.

**Tech Stack:** Next.js 16.3.8, React 19.2.8, Tailwind 4, `radix-ui` 1.7,
`lucide-react`, `class-variance-authority`, `tw-animate-css`, Vitest. New
packages: `cmdk`, `sonner`, `react-markdown`, `remark-gfm`. OpenNext on
Cloudflare Workers with D1 and R2.

**Design:** `docs/superpowers/specs/2026-10-08-hq-premium-ui-design.md` in the
operations repository. Requirements HQU-001 through HQU-064.

---

## Repository boundary

The working copy of this plan is the [`handoff/`](../../../handoff/) app in
this repository. It does not share a package, cookie, or database with the
operations site. The marketing site, the Readiness Check, and the client-facing
Handoff pages (`/share/[token]`, `/invites/[inviteId]`, `/w/[slug]` as seen by
a client) are out of scope except where this plan names them.

Staff pages are gated by `requireHqStaffPage` and `requireSuperAdminPage` in
`src/lib/current.ts`. This plan does not loosen those gates. New route
handlers (`/api/hq/palette`) use the same gates.

Before adding App Router pages, route handlers, `loading.tsx`, or `error.tsx`
files, read the current guide in `handoff/node_modules/next/dist/docs/`.

## Global constraints

- No new environment variables. No new Cloudflare bindings. No new tables.
- No password, token, or signed URL is written to a file, a test, a commit
  message, or a pull request. Login tests use made-up values.
- Every status color comes from a token in `globals.css`. After Phase 1 no
  component names a status hex directly (HQU-001).
- Every page renders inside `PageFrame`. No page sets its own `max-w` or
  `py-16` (HQU-003, HQU-005).
- Every list of records is a `DataTable` or a `Timeline`. Every empty list is
  an `EmptyState` (HQU-064).
- Pure helpers get a colocated `*.test.ts` first, in the node environment.
  UI is verified with `npm run lint`, `npm run build`, and a deploy to
  `handoff-hq` followed by a screenshot pass.
- Server actions keep their existing database writes. Only the return value
  and the form wrapper change (HQU-021).
- Copy follows the Handoff voice. Short sentences. Say "space", "storage
  limit", "admin", "delete". Blank cells stay blank (HQU-063).
- Keep `npm test` green at every commit. Do not delete an existing test.
- Use one logical commit per task.
- Commit as `makemoney2023 <124006256+makemoney2023@users.noreply.github.com>`
  using per-command author environment variables. Do not change git config.

## Environment contract

```text
No new variables.
Deploy: npm run deploy:hq   (in handoff/)
New packages: cmdk, sonner, react-markdown, remark-gfm
```

Local dev needs `npm ci` in `handoff/`. `next dev` works without Wrangler for
the UI work in this plan because every page already falls back to
`.data/handoff.db` when the Worker context is absent.

## File structure

| Path | Responsibility |
|---|---|
| `src/app/globals.css` | Status tokens, density variables, motion rules (HQU-001, HQU-006, HQU-016) |
| `src/components/ui/table.tsx` | Table primitive |
| `src/components/ui/tabs.tsx` | Tabs primitive |
| `src/components/ui/dialog.tsx` | Dialog primitive |
| `src/components/ui/dropdown-menu.tsx` | Dropdown menu primitive |
| `src/components/ui/select.tsx` | Select primitive |
| `src/components/ui/popover.tsx` | Popover primitive |
| `src/components/ui/breadcrumb.tsx` | Breadcrumb primitive |
| `src/components/ui/toggle-group.tsx` | Toggle group primitive |
| `src/components/ui/scroll-area.tsx` | Scroll area primitive |
| `src/components/page-frame.tsx` | Title, kicker, description, actions, width (HQU-005) |
| `src/components/metric.tsx`, `metric-strip.tsx` | Metric values with Tektur numbers |
| `src/components/status-badge.tsx`, `status-dot.tsx` | Status display from tokens |
| `src/components/empty-state.tsx`, `error-state.tsx` | Empty and error blocks (HQU-020, HQU-023) |
| `src/components/data-table.tsx` | Server-rendered table with `?sort=`, sticky header, row links |
| `src/components/timeline.tsx` | Vertical activity list |
| `src/components/external-link.tsx` | ↗ link with sr-only "opens in new tab" |
| `src/components/form-drawer.tsx` | Sheet wrapper for Add/Edit forms |
| `src/components/markdown.tsx` | react-markdown, no raw HTML |
| `src/components/command-palette.tsx` | ⌘K palette on `cmdk` (HQU-014) |
| `src/components/toaster.tsx` | sonner mount (HQU-021) |
| `src/components/action-form.tsx` | Form wrapper that toasts action results and shows pending state (HQU-024) |
| `src/components/context-bar.tsx` | Breadcrumb + actions bar and its React context (HQU-013) |
| `src/components/keyboard-shortcuts.tsx` | `g` chords, `/`, `?`, `n` (HQU-015) |
| `src/components/density-toggle.tsx` | Density switch and inline boot script (HQU-016) |
| `src/components/user-menu.tsx` | Sidebar footer menu (HQU-018) |
| `src/lib/status-token.ts` | `statusToken(domain, value)` (HQU-009) |
| `src/lib/format.ts` | `formatCount`, `formatRelative`, `formatMoney`, `initials` (HQU-010) |
| `src/lib/action-result.ts` | `ActionResult` type and `ok()` / `fail()` helpers (HQU-021) |
| `src/lib/client-rows.ts` | `clientRows(orgs, work, plans)` (HQU-037) |
| `src/lib/schema-report.ts` | `stripAnswerPrefix(text)` added (HQU-035) |
| `src/app/staff-links.ts` | `STUDIO_NAV_GROUPS` and derived `STUDIO_NAV` (HQU-011) |
| `src/app/breadcrumbs.ts` | `breadcrumbsFor(pathname, labels)` (HQU-013) |
| `src/app/staff-shell.tsx`, `staff-nav.tsx` | Grouped nav, wordmark, context bar, footer, palette, toaster |
| `src/app/api/hq/palette/route.ts` | Staff-only `{ clients: [{ id, name }] }` |
| `src/db/crm.ts` | `navCounts(sql, caller, now)` added (HQU-017) |
| `src/app/work/query.ts` | `workCounts(tasks, now)` added (HQU-042) |
| `src/app/projects/page.tsx` | New `/projects` index (HQU-048) |
| `src/app/clients/[id]/*-tab.tsx` | Client 360 tabs (HQU-040) |
| `src/app/settings/layout.tsx` | Settings tabs (HQU-058) |
| `src/app/**/loading.tsx`, `error.tsx` | Route states (HQU-022, HQU-023) |

---

## Phase 1 — Foundations

### Task 1: Install packages and add tokens

**Files:**
- Modify: `handoff/package.json`, `handoff/package-lock.json`
- Modify: `handoff/src/app/globals.css`

- [ ] **Step 1: Install**

```bash
cd handoff
npm install cmdk sonner react-markdown remark-gfm
```

- [ ] **Step 2: Add status tokens**

In `:root` add `--status-late #ff4b24`, `--status-blocked #f2b84b`,
`--status-waiting #8debf2`, `--status-active #c6ffb3`,
`--status-complete #aaa49a`, `--status-neutral #2a2926`, and a `-fg` pair for
each (dark ink on the bright ones, `--foreground` on `neutral`). Map each in
`@theme inline` as `--color-status-*` so `bg-status-late` and
`text-status-late-fg` work (HQU-001).

- [ ] **Step 3: Add density and motion rules**

Add `--row-h: 2.5rem` and `--cell-py: 0.5rem` under `:root`, and
`html[data-density="compact"] { --row-h: 2rem; --cell-py: 0.25rem; }`
(HQU-016). Add a `@media (prefers-reduced-motion: reduce)` block that sets
`transition-duration` and `animation-duration` to `0.01ms` for everything
(HQU-006). Change `.studio-kicker` color to `var(--muted-foreground)`
(HQU-002).

- [ ] **Step 4: Build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git commit -m "Add HQ status tokens, density variables, and UI packages."
```

### Task 2: Pure helpers — format and status tokens

**Files:**
- Create: `handoff/src/lib/format.ts`, `handoff/src/lib/format.test.ts`
- Create: `handoff/src/lib/status-token.ts`,
  `handoff/src/lib/status-token.test.ts`
- Create: `handoff/src/lib/action-result.ts`,
  `handoff/src/lib/action-result.test.ts`
- Modify: `handoff/src/app/activity-time.tsx`

**Produces:**

```ts
export function formatCount(n: number): string;          // 0 → "0", 1240 → "1,240"
export function formatRelative(date: Date | string, now: Date): string; // "2h", "3d", "Mar 4"
export function formatMoney(cents: number): string;      // 125000 → "$1,250"
export function initials(name: string): string;          // "Ada Lovelace" → "AL"

export type StatusTone = "late" | "blocked" | "waiting" | "active" | "complete" | "neutral";
export type StatusDomain = "task" | "project" | "health" | "deliverable" | "deal" | "schema" | "lead" | "github";
export function statusToken(domain: StatusDomain, value: string): { tone: StatusTone; label: string };

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };
export function ok(message: string): ActionResult;
export function fail(error: string): ActionResult;
```

- [ ] **Step 1: Write failing tests**

`format.test.ts`:
- `formatRelative` returns `now` for under a minute, `5m`, `2h`, `3d`, and
  `Mar 4` past seven days, and `Mar 4, 2025` in another year
- `formatRelative` accepts an ISO string
- `formatMoney(0)` is `$0`; `formatMoney(99)` is `$0.99`; `formatMoney(125000)`
  is `$1,250`
- `initials("ada")` is `A`; `initials("")` is `?`; three words give two letters

`status-token.test.ts`:
- every value in `TASK_STATUS_LABEL`, `PROJECT_STATUS_LABEL`, `HEALTH_LABEL`,
  `DELIVERABLE_STATUS_LABEL`, and `DEAL_STAGES` maps to a tone and its label
- `statusToken("task", "late")` is `late`; `"blocked"` is `blocked`;
  `"done"` is `complete`
- `statusToken("schema", "pass")` is `active`; `"fail"` is `late`
- `statusToken("github", "connected")` is `active`; `"disconnected"` is
  `neutral`
- an unknown value returns `neutral` with the raw value as label

`action-result.test.ts`: `ok()` and `fail()` shape.

- [ ] **Step 2: Run, implement, re-run**

```bash
npx vitest run src/lib/format src/lib/status-token src/lib/action-result
```

Import the existing label maps from `src/db/crm.ts` and friends so labels
stay single-sourced. Replace the date math in `activity-time.tsx` with
`formatRelative`.

- [ ] **Step 3: Commit**

```bash
git commit -m "Add format, status token, and action result helpers for HQ."
```

### Task 3: Radix primitives

**Files:**
- Create: `handoff/src/components/ui/table.tsx`, `tabs.tsx`, `dialog.tsx`,
  `dropdown-menu.tsx`, `select.tsx`, `popover.tsx`, `breadcrumb.tsx`,
  `toggle-group.tsx`, `scroll-area.tsx`

- [ ] **Step 1: Add each primitive**

Follow the style of `sheet.tsx` and `tooltip.tsx`: import from `radix-ui`,
export named parts, use `cn`, size classes from `--row-h` and `--cell-py`
where rows exist. `Table` header cells use Plex Mono `text-[11px] uppercase
tracking-wide` and `sticky top-0` (HQU-004). Focus rings use `ring-ring`
(HQU-062). All enter/exit animation uses `tw-animate-css` at 150–200 ms.

- [ ] **Step 2: Lint and build**

```bash
npm run lint
npm run build
```

- [ ] **Step 3: Commit**

```bash
git commit -m "Add table, tabs, dialog, menu, select, popover, breadcrumb, toggle, and scroll primitives."
```

### Task 4: Composed components

**Files:**
- Create: `handoff/src/components/page-frame.tsx`, `metric.tsx`,
  `metric-strip.tsx`, `status-badge.tsx`, `status-dot.tsx`,
  `empty-state.tsx`, `error-state.tsx`, `data-table.tsx`, `timeline.tsx`,
  `external-link.tsx`, `form-drawer.tsx`, `markdown.tsx`, `toaster.tsx`,
  `action-form.tsx`
- Create: `handoff/src/components/data-table-sort.ts`,
  `handoff/src/components/data-table-sort.test.ts`

**Produces:**

```ts
// page-frame.tsx (server)
export function PageFrame(props: {
  title: string; kicker?: string; description?: string;
  actions?: React.ReactNode; width?: "narrow" | "default" | "wide";
  children: React.ReactNode;
}): JSX.Element;

// data-table.tsx (server)
export type Column<Row> = {
  key: string; header: string; sortable?: boolean;
  align?: "left" | "right"; width?: string;
  cell: (row: Row) => React.ReactNode;
};
export function DataTable<Row>(props: {
  columns: Column<Row>[]; rows: Row[]; rowKey: (row: Row) => string;
  rowHref?: (row: Row) => string; sort?: string; basePath?: string;
  groups?: { label: string; rows: Row[] }[]; empty: React.ReactNode;
}): JSX.Element;

// data-table-sort.ts (pure)
export function parseSort(sort: string | undefined): { key: string; dir: "asc" | "desc" } | null;
export function nextSort(current: string | undefined, key: string): string;
export function sortRows<Row>(rows: Row[], sort: string | undefined, get: (row: Row, key: string) => string | number | null): Row[];
```

- [ ] **Step 1: Write failing tests for sorting**

- `parseSort("name")` is asc; `"-name"` is desc; `undefined` is null
- `nextSort(undefined, "name")` is `name`; `nextSort("name", "name")` is
  `-name`; `nextSort("-name", "name")` is `""`
- `sortRows` sorts strings case-insensitively, numbers numerically, and puts
  `null` last in both directions

- [ ] **Step 2: Implement the components**

- `PageFrame` renders `py-6 lg:py-8`, width per HQU-005, h1 in
  `font-heading text-2xl lg:text-3xl`, kicker in mono, actions right-aligned,
  and wraps children in `space-y-6`.
- `Metric` shows a mono label and a Tektur `tabular-nums` value with an
  optional tone and href. `MetricStrip` lays out 3–5 metrics in a grid.
- `StatusBadge` and `StatusDot` take `{ domain, value }`, call
  `statusToken`, and render `bg-status-{tone}` classes with an sr-only label
  (HQU-062).
- `EmptyState` takes `icon`, `title`, `body`, and one `action`.
- `ErrorState` takes `title`, `detail`, and `onRetry` or `href`.
- `DataTable` renders `Table`, sticky header, header links that use
  `nextSort` against `basePath`, a whole-row link via an absolutely
  positioned anchor in the first cell, group header rows with
  `sticky top-[var(--row-h)]`, and `empty` when there are no rows. Rows are
  `h-[var(--row-h)]`. Mobile stacks cells with `data-label` (HQU-019).
- `Timeline` takes `items: { id, at, title, body?, by?, href? }[]` and
  renders a left rail with dots and `formatRelative`.
- `ExternalLink` renders ↗ and sr-only "opens in new tab".
- `FormDrawer` is a client component wrapping `Sheet` with `trigger`,
  `title`, `description`, and `children`. It closes when a child form
  reports `{ ok: true }`.
- `Markdown` uses `react-markdown` with `remark-gfm`, no raw HTML, links
  through `ExternalLink`.
- `Toaster` mounts sonner once with the HQ theme and `aria-live="polite"`.
- `ActionForm` is a client component that takes a server action returning
  `ActionResult`, uses `useActionState`, shows field errors, disables the
  submit with a spinner via `useFormStatus`, toasts the result, and calls
  `onSuccess` (HQU-021, HQU-024).

- [ ] **Step 3: Test, lint, build**

```bash
npx vitest run src/components
npm run lint
npm run build
```

- [ ] **Step 4: Commit**

```bash
git commit -m "Add HQ page frame, data table, timeline, drawer, states, and toasts."
```

---

## Phase 2 — Shell

### Task 5: Grouped navigation and single wordmark

**Files:**
- Modify: `handoff/src/app/staff-links.ts`, `staff-links.test.ts`
- Modify: `handoff/src/app/staff-nav.tsx`, `staff-shell.tsx`

- [ ] **Step 1: Write failing tests**

- `STUDIO_NAV_GROUPS` labels are exactly Pulse, Pipeline, Delivery, Records,
  Automation, System in that order
- Delivery contains `/work` then `/projects`; System contains
  `/settings/github`
- `STUDIO_NAV` is the flat concatenation and keeps every href unique
- every href in `STUDIO_NAV` has an icon in `staff-nav.tsx` (export the
  `ICONS` keys for the test)

- [ ] **Step 2: Implement**

Define `STUDIO_NAV_GROUPS` per HQU-011 and derive `STUDIO_NAV`. Render one
`SidebarGroup` per group with a mono `SidebarGroupLabel`. Add `FolderKanban`
for `/projects`. Replace the header link with the wordmark "Handoff" in mono
cyan plus "HQ" in muted mono. Remove the duplicate `<span>Handoff</span>` from
the inset header (HQU-012).

- [ ] **Step 3: Test and build**

```bash
npm test
npm run build
```

- [ ] **Step 4: Commit**

```bash
git commit -m "Group HQ navigation and show one wordmark."
```

### Task 6: Breadcrumbs and context bar

**Files:**
- Create: `handoff/src/app/breadcrumbs.ts`, `breadcrumbs.test.ts`
- Create: `handoff/src/components/context-bar.tsx`
- Modify: `handoff/src/app/staff-shell.tsx`

**Produces:**

```ts
export function breadcrumbsFor(
  pathname: string,
  labels: Record<string, string>,
): { label: string; href?: string }[];
```

- [ ] **Step 1: Write failing tests**

- `/` → `[Today]`
- `/clients` → `[Clients]`
- `/clients/abc` with `{ "/clients/abc": "Acme" }` → `[Clients → /clients, Acme]`
- `/clients/abc` with no label → `[Clients, …]`
- `/admin/held` → `[Spaces → /spaces, Held files]`; `/w/east` with a label →
  `[Spaces → /spaces, East space]` (HQU-061)
- `/settings/github` → `[Settings, GitHub]`
- the last crumb never has an href

- [ ] **Step 2: Implement**

`ContextBar` is a client component. It exposes `ContextBarProvider`,
`useContextBar()`, and `SetContextLabel({ path, label })` so a record page
can register its name and actions. It renders `SidebarTrigger`, the
`Breadcrumb`, a right slot for actions, and a ⌘K button. Replace the inset
`<header>` in `staff-shell.tsx` with it and make it `sticky top-0` on mobile
(HQU-013, HQU-019).

- [ ] **Step 3: Test and build, then commit**

```bash
npm test
npm run build
git commit -m "Add HQ breadcrumbs and a context bar."
```

### Task 7: Command palette and shortcuts

**Files:**
- Create: `handoff/src/app/api/hq/palette/route.ts`
- Create: `handoff/src/components/command-palette.tsx`,
  `keyboard-shortcuts.tsx`
- Create: `handoff/src/components/palette-items.ts`, `palette-items.test.ts`
- Modify: `handoff/src/app/staff-shell.tsx`

**Produces:**

```ts
export function paletteItems(input: {
  nav: readonly { label: string; href: string }[];
  recent: { label: string; href: string }[];
  clients: { id: string; name: string }[];
  actions: { label: string; run: string }[];
}): { group: "Go to" | "Recent" | "Clients" | "Actions"; label: string; href?: string; run?: string }[];
export function pushRecent(list: { label: string; href: string }[], item: { label: string; href: string }): { label: string; href: string }[]; // dedupe, max 8
```

- [ ] **Step 1: Write failing tests**

- `pushRecent` moves a repeat to the front and caps at 8
- `paletteItems` orders groups Go to, Recent, Clients, Actions and skips
  empty groups
- client hrefs are `/clients/{id}`

- [ ] **Step 2: Implement the route**

`GET /api/hq/palette` calls the staff gate, runs `listOrganizations` scoped
to the caller, and returns `{ clients: [{ id, name }] }`. Non-staff gets 404.

- [ ] **Step 3: Implement the palette and shortcuts**

`CommandPalette` opens on ⌘K / Ctrl+K, traps focus, loads clients once per
open, reads recent from `sessionStorage` key `hq:recent:v1`, and shows
actions from `useContextBar()` (HQU-014). `KeyboardShortcuts` handles
`g t`, `g l`, `g c`, `g w`, `g h`, `g s`, `/` (focus the page search when
present), `?` (shortcut sheet), and `n` (first context action) and ignores
keys while an input is focused (HQU-015). Mount both in `staff-shell.tsx`.

- [ ] **Step 4: Test, lint, build, commit**

```bash
npm test
npm run lint
npm run build
git commit -m "Add the HQ command palette and keyboard shortcuts."
```

### Task 8: Density, nav counts, and the user menu

**Files:**
- Create: `handoff/src/components/density-toggle.tsx`, `user-menu.tsx`
- Modify: `handoff/src/db/crm.ts`, `handoff/src/db/crm.test.ts`
- Modify: `handoff/src/app/layout.tsx`, `staff-shell.tsx`, `staff-nav.tsx`

**Produces:**

```ts
export async function navCounts(
  sql: Sql, caller: Caller, now: Date,
): Promise<{ needsYou: number; leads: number; work: number }>;
```

- [ ] **Step 1: Write failing tests**

In `crm.test.ts` on the in-memory migration: seed one late task, one blocked
task, one open lead; `navCounts` returns `needsYou: 2`, `work: 2`,
`leads: 1`; a caller outside the org sees zeros.

- [ ] **Step 2: Implement**

- `navCounts` reuses the `listWork` predicates. `StaffShell` calls it once
  with `cache()` and passes counts to `StaffNav`, which renders a
  `SidebarMenuBadge` only when a count is above zero (HQU-017).
- `DensityToggle` writes `localStorage` `hq:density:v1` and sets
  `data-density` on `<html>`. Add the inline boot script to `layout.tsx` so
  the attribute exists before hydration (HQU-016).
- `UserMenu` sits in `SidebarFooter`: initials avatar from `initials()`,
  name, email, role, and a `DropdownMenu` with Density, Shortcuts, Sign out
  (HQU-018).

- [ ] **Step 3: Test, build, commit**

```bash
npm test
npm run build
git commit -m "Add nav counts, density toggle, and the HQ user menu."
```

### Task 9: Loading and error states for every route

**Files:**
- Create: `loading.tsx` and `error.tsx` under `src/app/`, `leads/`,
  `schema/`, `clients/`, `clients/[id]/`, `work/`, `projects/`, `chat/`,
  `swarm/`, `admin/`, `settings/`

- [ ] **Step 1: Add the files**

Each `loading.tsx` renders `PageFrame` with a `Skeleton` title and the shape
of that page's main table or strip (HQU-022). Each `error.tsx` is a client
component rendering `ErrorState` with `reset()` and never prints the error
message raw to the screen (HQU-023).

- [ ] **Step 2: Build and commit**

```bash
npm run build
git commit -m "Add loading and error states to HQ routes."
```

---

## Phase 3 — Today

### Task 10: Rebuild Today

**Files:**
- Modify: `handoff/src/app/today-screen.tsx`, `hq-home.tsx`
- Create: `handoff/src/app/today-view.ts`, `today-view.test.ts`

**Produces:**

```ts
export function todayMetrics(board: TodayBoard): { label: string; value: number; tone: StatusTone; href: string }[];
export function needsYou(board: TodayBoard, max?: number): TodayItem[]; // default 8
export function timelineFilter(items: TodayItem[], filter: "all" | "clients" | "leads" | "agent"): TodayItem[];
export function greeting(now: Date, name?: string): string;
```

- [ ] **Step 1: Write failing tests**

- metrics are Needs you, Late, Blocked, Due this week, Active clients in
  that order with hrefs into `/work` filters and `/clients`
- `needsYou` returns at most 8, late before blocked before waiting
- `timelineFilter("agent")` keeps only agent items
- `greeting` says Good morning / afternoon / evening and includes the first
  name when given

- [ ] **Step 2: Implement**

`TodayScreen` renders `PageFrame` default width with the greeting as title,
`MetricStrip`, a Needs you `DataTable` (max 8, "View all" to `/work`),
then a two-column layout: `Timeline` with a `ToggleGroup`
All/Clients/Leads/Agent on the left, and a rail with Pipeline, Clients at
risk, and Agent runs on the right. Empty states per HQU-020
(HQU-025 through HQU-028).

- [ ] **Step 3: Test, build, commit**

```bash
npm test
npm run build
git commit -m "Rebuild HQ Today with metrics, a needs-you table, and a timeline."
```

---

## Phase 4 — Clients and Client 360

### Task 11: Clients list

**Files:**
- Create: `handoff/src/lib/client-rows.ts`, `client-rows.test.ts`
- Modify: `handoff/src/app/clients/page.tsx`, `clients/new/page.tsx`

- [ ] **Step 1: Write failing tests**

`clientRows(orgs, work, plans)` returns one row per org with `kind`,
`health`, `owner`, `openWork` count, `nextStep` from the plan, and
`lastActivity`; a `q` filter matches name case-insensitively; sort by
`openWork` descending puts the busiest first (HQU-037).

- [ ] **Step 2: Implement**

`/clients` renders `PageFrame` default with a search `Input` bound to `?q=`,
a `DataTable` with Client, Kind, Health (`StatusDot`), Owner, Open work,
Next step, Last activity, `?sort=`, row link to `/clients/{id}`, and a New
client `FormDrawer` wrapping `client-form.tsx` in `ActionForm`. `/clients/new`
stays as a narrow page for deep links (HQU-036).

- [ ] **Step 3: Test, build, commit**

```bash
npm test
npm run build
git commit -m "Rebuild the HQ clients list as a sortable table with a drawer."
```

### Task 12: Client 360 tabs

**Files:**
- Create: `handoff/src/app/clients/[id]/overview-tab.tsx`, `work-tab.tsx`,
  `threads-tab.tsx`, `files-tab.tsx`, `repos-tab.tsx`, `activity-tab.tsx`,
  `settings-tab.tsx`
- Create: `handoff/src/app/clients/[id]/tabs.ts`, `tabs.test.ts`
- Modify: `handoff/src/app/clients/[id]/page.tsx` and its form files

- [ ] **Step 1: Write failing tests**

`CLIENT_TABS` is Overview, Work, Threads, Files & spaces, Repos, Activity,
Settings; `activeTab(searchParams.tab)` falls back to `overview` for an
unknown value.

- [ ] **Step 2: Split the page**

Move each section of the 440-line page into its tab file. `page.tsx` loads
data, registers the client name with `SetContextLabel`, renders `PageFrame`
wide with actions Message, New task, Link space, and a More
`DropdownMenu`, then `Tabs` bound to `?tab=`. The page stays under 200
lines. Each Add/Edit form moves into a `FormDrawer` + `ActionForm`. Server
actions in `activity-forms.tsx`, `repo-forms.tsx`, `thread-forms.tsx`,
`link-space-form.tsx` return `ActionResult` (HQU-038 through HQU-041).

- [ ] **Step 3: Test, lint, build, commit**

```bash
npm test
npm run lint
npm run build
git commit -m "Split HQ Client 360 into tabs with drawers and toasts."
```

---

## Phase 5 — Chat

### Task 13: Chat two-pane layout

**Files:**
- Modify: `handoff/src/app/chat/page.tsx`, `chat-panel.tsx`
- Modify: `handoff/src/lib/hq-chat-playbook.ts` and its test

- [ ] **Step 1: Write failing test**

`starterPrompts()` returns exactly three prompts, each under 80 characters.

- [ ] **Step 2: Implement**

Left pane: `ScrollArea` list of conversations with `formatRelative`. Right
pane: messages through `Markdown`, tool-call rows collapsed by default,
agent messages with an avatar on the left and staff messages right-aligned,
three starter prompts on an empty thread, a sticky composer that grows to
six lines, Enter sends, Shift+Enter breaks, a pending state with Stop
(HQU-049 through HQU-052).

- [ ] **Step 3: Test, build, commit**

```bash
npm test
npm run build
git commit -m "Rebuild HQ Chat with a conversation list, Markdown, and a sticky composer."
```

---

## Phase 6 — Leads

### Task 14: Leads list and board

**Files:**
- Create: `handoff/src/app/leads/view.ts`, `view.test.ts`
- Modify: `handoff/src/app/leads/page.tsx`, `board.tsx`, `lead-form.tsx`

- [ ] **Step 1: Write failing tests**

- `stageCounts(deals)` returns a count per `DEAL_STAGES` entry including zero
- `leadsView(searchParams.view)` is `list` by default and `board` only for
  `board`
- `filterDeals(deals, { stage, owner, q })` applies each filter

- [ ] **Step 2: Implement**

`PageFrame` wide. Toolbar: `ToggleGroup` of stages with counts, owner
`Select`, search `Input`, and a List/Board `ToggleGroup` bound to `?view=`.
List is a `DataTable` with Company, Contact, Stage (`StatusBadge`), Score,
Next step, Owner, Updated and a row link. Board sits in a horizontal
`ScrollArea`; each card has a `DropdownMenu` with stage moves that call the
existing stage action and toast. New lead is a `FormDrawer` (HQU-029
through HQU-032).

- [ ] **Step 3: Test, build, commit**

```bash
npm test
npm run build
git commit -m "Rebuild HQ Leads with filters, a sortable list, and a board view."
```

---

## Phase 7 — Work and Projects

### Task 15: Work

**Files:**
- Modify: `handoff/src/app/work/query.ts`, `query.test.ts`, `page.tsx`

- [ ] **Step 1: Write failing tests**

`workCounts(tasks, now)` returns `{ all, late, thisWeek, blocked }`; a task
due yesterday counts as late and not this week; `workHref` drops a
`density` key if present (HQU-042).

- [ ] **Step 2: Implement**

`PageFrame` default. `ToggleGroup` All/Late/This week/Blocked with counts.
A "Group by" `Select` bound to `?group=`. One grouped `DataTable` with
sticky group headers and columns `StatusDot`, Task, Client, Project, Owner,
Due, Actions. Row actions (Done, Snooze) are `ActionForm` buttons with
optimistic state. Remove `?density=` (HQU-043, HQU-044).

- [ ] **Step 3: Test, build, commit**

```bash
npm test
npm run build
git commit -m "Rebuild HQ Work as one grouped table with counted filters."
```

### Task 16: Projects index and project page

**Files:**
- Create: `handoff/src/app/projects/page.tsx`
- Create: `handoff/src/app/projects/rows.ts`, `rows.test.ts`
- Modify: `handoff/src/app/projects/[id]/page.tsx`, `forms.tsx`
- Modify: `handoff/src/app/deliverables/[id]/page.tsx`, `forms.tsx`

- [ ] **Step 1: Write failing tests**

`projectRows(projects, tasks)` yields Client, Project, Status, Health, Due,
Open tasks; sorting by Due puts undated projects last.

- [ ] **Step 2: Implement**

`/projects` is a `DataTable` with those columns and a row link. The project
page is two columns: milestones as a `Timeline` on the left, status and
`StatusDot` by health on the right, with Post update, Add milestone, and
Add task in `FormDrawer`s. The deliverable page uses `fileLabel()` for `alt`
text, shows feedback as a `Timeline`, and keeps an inline reply form
(HQU-045 through HQU-048).

- [ ] **Step 3: Test, build, commit**

```bash
npm test
npm run build
git commit -m "Add the HQ projects index and rebuild project and deliverable pages."
```

---

## Phase 8 — Schema

### Task 17: Schema

**Files:**
- Modify: `handoff/src/lib/schema-report.ts`, `schema-report.test.ts`
- Modify: `handoff/src/app/schema/page.tsx`, `schema-form.tsx`

- [ ] **Step 1: Write failing tests**

`stripAnswerPrefix("PASS: all good")` is `{ flag: "pass", text: "all good" }`;
`"FAIL - missing FAQ"` is `fail`; plain text returns `{ flag: null, text }`
(HQU-035).

- [ ] **Step 2: Implement**

`PageFrame` wide. Remove `.studio-panel`. A hero `Metric` for the latest
result, a `DataTable` history with Site, Checked, Result (`StatusBadge`
from `statusToken("schema", flag)`), Issues, Report (`ExternalLink`), and
Run a check in a `FormDrawer` (HQU-033, HQU-034).

- [ ] **Step 3: Test, build, commit**

```bash
npm test
npm run build
git commit -m "Rebuild HQ Schema with a result metric and a history table."
```

---

## Phase 9 — Spaces, Settings, entry, and auth

### Task 18: Spaces

**Files:**
- Modify: `handoff/src/app/admin/page.tsx`, `admin/held/page.tsx`,
  `admin/staff/page.tsx`, `admin/templates/page.tsx`,
  `new-workspace-form.tsx`, `staff-form.tsx`
- Create: `handoff/src/app/admin/layout.tsx`

- [ ] **Step 1: Implement**

The layout renders `PageFrame` titled "Spaces" with `Tabs` Spaces, Held
files, Staff, Templates linking to `/admin/*`. The Spaces tab is a
`DataTable` with Space, Client, Owner, Files, Storage used, Last upload,
Open. Staff and New space forms move into `FormDrawer`s. `/w/[slug]`
registers `Spaces / {space name}` with `SetContextLabel` (HQU-055,
HQU-056, HQU-061).

- [ ] **Step 2: Build and commit**

```bash
npm run build
git commit -m "Rebuild HQ Spaces with tabs and a storage table."
```

### Task 19: Settings and GitHub

**Files:**
- Create: `handoff/src/app/settings/layout.tsx`,
  `settings/shortcuts/page.tsx`, `settings/appearance/page.tsx`
- Modify: `handoff/src/app/settings/github/page.tsx`

- [ ] **Step 1: Implement**

The settings layout renders `PageFrame` narrow with `Tabs` GitHub,
Shortcuts, Appearance. GitHub shows an `EmptyState` "Connect GitHub" when
disconnected, otherwise a connection card with `StatusDot` and a repos
`DataTable`; failures render `ErrorState`. Shortcuts lists the keys from
Task 7. Appearance hosts `DensityToggle`. Nav keeps `/settings/github`
(HQU-057, HQU-058).

- [ ] **Step 2: Build and commit**

```bash
npm run build
git commit -m "Add HQ settings tabs and rebuild the GitHub page."
```

### Task 20: Entry and login

**Files:**
- Modify: `handoff/src/app/hq-home.tsx`, `login/page.tsx`,
  `sign-in-form.tsx`, `sign-in-action.ts`, `sign-in-action.test.ts`

- [ ] **Step 1: Write failing test**

`signIn` returns `{ ok: false, error }` with a field name for an empty
username and never includes the submitted password in the result. Use
made-up values only.

- [ ] **Step 2: Implement**

A signed-in non-staff user sees an `EmptyState` titled "This account is not
on the HQ staff list" with Sign out and a link to the client portal. Login
uses `PageFrame` narrow, `ActionForm`, and field-level errors. No log line
prints a password (HQU-059, HQU-060).

- [ ] **Step 3: Test, build, commit**

```bash
npm test
npm run build
git commit -m "Rebuild HQ entry and login states."
```

---

## Phase 10 — Swarm

### Task 21: Swarm frame

**Files:**
- Modify: `handoff/src/app/swarm/page.tsx`
- Create: `handoff/src/app/swarm/swarm-frame.tsx`

- [ ] **Step 1: Implement**

`SwarmFrame` is a client component: a toolbar with `StatusDot` driven by
the iframe `load` and `error` events, `ExternalLink` to `SWARM_ORIGIN`, a
Focus button that hides the sidebar and context bar until Escape, a
`Skeleton` while loading, and `ErrorState` with Retry on failure (HQU-053,
HQU-054).

- [ ] **Step 2: Build and commit**

```bash
npm run build
git commit -m "Add status, focus mode, and error handling to the HQ Swarm frame."
```

---

## Phase 11 — Polish and acceptance

### Task 22: Mobile and accessibility sweep

**Files:**
- Modify: any component found wanting

- [ ] **Step 1: Walk every page at 390 px and 1440 px**

Confirm the sidebar is a `Sheet` on mobile, the context bar is sticky,
tables stack, and drawers are full width (HQU-019). Confirm every icon
button has `aria-label`, every status has an sr-only label, toasts are
`aria-live="polite"`, external links announce "opens in new tab", images
have alt text, the palette traps focus, and text meets AA on `#070706`
(HQU-062).

- [ ] **Step 2: Grep for leftovers**

```bash
cd handoff
rg -n "py-16|max-w-(xl|2xl|3xl|4xl|5xl|6xl)" src/app --glob '!**/page-frame.tsx'
rg -n "#ff4b24|#f2b84b|#8debf2|#c6ffb3|#aaa49a" src --glob '!**/globals.css'
rg -n "No score yet" src
```

Each command prints nothing.

- [ ] **Step 3: Commit**

```bash
git commit -m "Finish HQ mobile and accessibility sweep."
```

### Task 23: Acceptance

**Files:**
- Modify: `README.md` if any fact changed

- [ ] **Step 1: Run the gates**

```bash
cd handoff
npm test
npm run lint
npm run build
npm run deploy:hq
```

- [ ] **Step 2: Keyboard walkthrough on the deployed site**

Today → `g l` → New lead drawer → `g c` → a client → each Client 360 tab →
`g w` → `g h`. Use ⌘K once from each page. Record a screenshot of each page
at desktop and mobile width and keep them out of the repository.

- [ ] **Step 3: Commit any fix**

```bash
git commit -m "Fix HQ issues found in acceptance."
```

## Done when

Every item in HQU-064 passes on `hq.abra-ca-dabra.app`: no `py-16`, no
page-level `max-w`, no hard-coded status color; "Handoff" appears once and
a breadcrumb appears on every page; the nav is grouped with counts; ⌘K
works everywhere; Today, Leads, Clients, Work, Projects, Schema, Spaces, and
GitHub use `DataTable` or `Timeline` with an `EmptyState`; every Add/Edit
form is a drawer with a toast; Chat renders Markdown with a conversation
list; Swarm shows loading, error, and focus states; `npm test`,
`npm run lint`, and `npm run build` pass in `handoff/`; and the keyboard
walkthrough in Task 23 completes without a mouse. The marketing site and
the client-facing Handoff pages are unchanged.
