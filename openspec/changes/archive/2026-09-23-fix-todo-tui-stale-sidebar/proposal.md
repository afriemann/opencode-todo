# Proposal

## Why

The `todo-tui` sidebar updates exclusively via a live `changed` RPC event pushed
from the headless server plugin (`src/index.ts`) to the TUI plugin
(`src/tui.tsx`). Per opencode's own RPC documentation, such event subscriptions
are "live only" — a disconnected subscriber misses events permanently, with no
buffering, replay, or automatic resubscription. Users observed the sidebar
frozen at an early, partially-completed revision of a todo list while many
subsequent `todowrite`/`todoread` calls — including a full replacement with an
unrelated new list — never reached the sidebar. This is consistent with the
event subscription silently dying at some point and never recovering.

Investigation confirmed there is no alternative bridge available: opencode's
built-in reactive `context.data` store is a closed set of host-native domains
(session, project, mcp, etc.) that plugins cannot extend, and the TUI-local
`context.storage` API does not bridge the headless-plugin-to-TUI-plugin
boundary that our custom todo data must cross. The RPC event bridge is the
only mechanism available for this data flow, so this fix must live within it.

## What Changes

- Add a bounded, infrequent (30-second) safety-net reconciliation refetch to
  `createTodoFeed` in `src/tui.tsx`, running alongside — not replacing — the
  existing event-driven refresh. If the `changed` event stream silently stops
  delivering, the sidebar recovers within one interval instead of staying
  stale indefinitely.
- Amend the `todo-tui` spec's "Sidebar updates without polling" requirement to
  explicitly permit this bounded reconciliation fallback, distinguishing it
  from the tight-loop polling the requirement was written to forbid.

## Capabilities

### Modified Capabilities
- `todo-tui`: the "Sidebar updates without polling" requirement changes to
  explicitly allow an infrequent (30s) reconciliation fallback in addition to
  the event-driven update; a new scenario covers recovery from a missed change
  notification via the safety net.

## Impact

- `src/tui.tsx` — `createTodoFeed` gains a `setInterval`-based fallback
  refresh, cleaned up identically to the existing event subscription.
- `src/tui.test.ts` — two new test cases covering the safety-net interval's
  trigger and cleanup behaviour.
- `openspec/specs/todo-tui/spec.md` — one requirement's body and scenario set
  updated via this change's delta spec.
- No change to the RPC schema, the SQLite store, or any other requirement in
  `todo-tui`.
