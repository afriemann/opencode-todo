# Design

## Context

See `proposal.md` for motivation. This design covers only `TodoSidebar` in `src/tui.tsx`,
mirroring `SidebarMcp` (`packages/tui/src/feature-plugins/sidebar/mcp.tsx`) exactly. No changes
to `createTodoFeed`, the RPC layer, `todo-storage`, or `todo-housekeeping`.

## Goals / Non-Goals

**Goals:**

- Add a per-plugin persisted collapse/expand toggle to the Todos header, gated at >2 items,
  matching `SidebarMcp`'s threshold, storage shape, and error handling exactly.
- Extract the collapsed-state summary formatting as a pure, unit-testable function, following the
  existing `createTodoFeed` extraction discipline.

**Non-Goals:**

- No change to `createTodoFeed`, RPC schemas, or the inline-error requirement's scope (still
  RPC-failure-only).
- No per-session collapse state — this is an intentional, precedent-matching global toggle (see
  Decisions).
- No automated coverage of JSX triangle rendering / click wiring — remains manual/live-capture,
  same as the rest of `TodoSidebar` today.

## Decisions

### D1 — Storage scoping: global (per-plugin), not per-session

`context.storage.store(key, { initial })` persists under `plugin.<pluginId>.<key>`
(`packages/tui/src/plugin/api.tsx:171`). This plugin's id is `opencode-todo-tui`
(`Plugin.define({ id: "opencode-todo-tui", ... })`), distinct from MCP's `opencode.sidebar.mcp` —
no key collision is possible between the two plugins' `"view"` keys.

The stored `{ open: boolean }` is **not** keyed by `sessionID`: it is a single switch shared across
every session the TUI shows, for the lifetime of the plugin's storage. This is the same behavior
`SidebarMcp` already has (its `store("view", ...)` call also ignores `sessionID`), so this design
does not introduce a new state-scoping pattern — it reuses the one already shipping in opencode's
own sidebar. This is an intentional, confirmed-consistent-with-precedent choice, not an oversight:
a user who collapses "Todos" expects it to stay collapsed when they switch sessions, exactly as
"MCP" does today.

### D2 — Component structure and gating conditions

`TodoSidebar` gains one `storage.store` call and three new gating expressions, all read from a new
`view` signal/updater pair, following `SidebarMcp`'s shape 1:1:

```ts
const [view, updateView] = props.context.storage.store("view", {
  initial: { open: true },
});
```

Render-tree changes inside the existing `<Show when={feed.todos().length > 0}>` block:

- **Triangle visibility**: `feed.todos().length > 2` — shows `▼` (open) / `▶` (closed) before the
  bold `Todos` label. At ≤2 items: no triangle, per the locked UX decision.
- **Header click-to-toggle**: `onMouseDown` on the header row, only takes effect when
  `feed.todos().length > 2` (mirrors `SidebarMcp`'s `if (list().length <= 2) return` early-out
  inside the handler, rather than conditionally attaching the handler — same approach, same
  reason: the row is always rendered, only the effect of clicking it is gated).
- **Collapsed summary visibility**: `<Show when={!view.open}>` right after the `<b>Todos</b>`
  label, rendering the muted inline summary text.
- **List visibility** (existing `<For>` block): its gate changes from unconditional (whenever the
  outer `Show` passes) to `feed.todos().length <= 2 || view.open` — unchanged in effect when the
  list is short or expanded, newly hidden when collapsed and long.

No new `box`/`Show` nesting levels beyond what `SidebarMcp` already uses — the existing outer
`<box>` becomes the header+list container, matching MCP's structure.

### D3 — Extracted pure function: `formatCollapsedSummary`

Following the `createTodoFeed` precedent (kept out of JSX so it's testable without `@opentui`),
extract the status-count summary formatting as a standalone pure function:

```ts
function formatCollapsedSummary(todos: readonly TodoItem[]): string;
```

- **Input**: the full todo list (the function computes its own per-status counts internally,
  keeping the call site trivial and the counting logic covered by the same tests as the
  formatting — there is exactly one reasonable way to count, so splitting counting into a second
  function would add an interface without adding testable value, YAGNI).
- **Output**: a string in the exact shape `"(2 pending, 1 in progress, 3 done)"` — parenthesized,
  comma-separated, fixed order `pending → in_progress → completed → cancelled`, only non-zero
  counts included, using the literal labels `"pending"`, `"in progress"`, `"done"`, `"cancelled"`
  (not the raw status enum names — `completed` renders as `"done"`). No singular/plural branching:
  unlike MCP's `error`/`errors`, none of these four labels change form with count, so the function
  is a straight-line count → label → filter → join, no pluralization helper needed.
- **All-zero-counts branch**: unreachable and requires no special case. This function is only ever
  called when the collapsed summary is shown, which is only reached inside the outer
  `<Show when={feed.todos().length > 0}>` — so `todos` is never empty when this function runs, and
  at least one status count is always non-zero. The signature returns a string unconditionally;
  callers do not need to handle an empty-result case.
- **Call site**: inside the `<Show when={!view.open}>` block, wrapping the result in the muted
  `<span>` immediately after `<b>Todos</b>`, e.g. `{formatCollapsedSummary(feed.todos())}`.

### D4 — Storage-write error handling

Mirror `SidebarMcp` exactly — no new error-handling pattern:

```ts
onMouseDown={() => {
  if (feed.todos().length <= 2) return;
  void updateView((draft) => {
    draft.open = !draft.open;
  }).catch((error) => console.error("Failed to persist Todos sidebar state", error));
}}
```

A storage-write failure is logged to the console and otherwise swallowed — it is **not** surfaced
as an inline UI error. The existing "Sidebar degrades to an inline error on RPC failure"
requirement in `openspec/specs/todo-tui/spec.md` is scoped to RPC failures (`createTodoFeed`'s
`client.list`/`events.on` path) only; this design does not extend, narrow, or otherwise touch that
requirement's scope. The toggle's mutation and the RPC feed are entirely separate failure domains.

## Testability / Verification Split

- **Unit-testable (add to `src/tui.test.ts`)**: `formatCollapsedSummary` — pure function, no
  `@opentui` renderer needed. Cover: single non-zero status, multiple non-zero statuses in fixed
  order, all four statuses present, and the "done" label mapping for `completed`. Follows the
  existing `fakeClient()`/`sampleTodo()` fixture style already in the file.
- **Manual/live-capture only**: the JSX triangle glyph, the click-to-toggle wiring
  (`onMouseDown`), and the `<Show>` gating of the `<For>` list against real `view.open` state.
  This is the same limitation the rest of `TodoSidebar` already has today (per the archived
  change's tasks.md task 6.5) — no `@opentui` renderer is available in the unit-test environment,
  so this design does not attempt to close that gap, only states it explicitly rather than leaving
  it implicit.

## Risks / Trade-offs

- **[Risk]** A user might expect per-session collapse state (collapsed in session A, expanded in
  session B) → **Mitigation**: none needed; this matches `SidebarMcp`'s existing, shipped behavior
  in the same sidebar, so the inconsistency (if any) is pre-existing product behavior, not a new
  regression introduced by this change.
- **[Risk]** Triangle/click-wiring regressions are only caught by manual verification → **Mitigation**:
  documented explicitly here and in tasks.md as a live-capture verification step, consistent with
  the existing, accepted limitation on the rest of `TodoSidebar`.

## Open Questions

None — all points raised in proposal review are resolved above (storage scoping, summary-function
contract, error handling, verification split).
