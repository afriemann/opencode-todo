# Proposal

## Why

The opencode TUI's own sidebar sections (e.g. MCP) let the user collapse a long list behind a `▼`/`▶` triangle in the header, showing a compact status summary when collapsed. The Todos sidebar has no such affordance: it always renders every todo when the list is non-empty, which can crowd the sidebar on sessions with many todos. Mirroring the existing MCP sidebar's collapse/expand interaction gives users the same control over vertical space for todos, with no new interaction pattern to learn.

## What Changes

- Add collapse/expand behavior to the Todos sidebar (`TodoSidebar` in `src/tui.tsx`), mirroring opencode's own `SidebarMcp` (`packages/tui/src/feature-plugins/sidebar/mcp.tsx`) pattern exactly:
  - Persist an `{ open: boolean }` view state per plugin instance via `context.storage.store("view", { initial: { open: true } })` — durable across TUI restarts, defaulting to open (expanded).
  - Show a `▼`/`▶` triangle before the bold `Todos` header only when there are more than 2 todos; with 2 or fewer todos the list is always shown expanded and no triangle appears (no point collapsing a list that short).
  - Make the header row clickable (mouse-down) to toggle the collapsed state, only when the toggle affordance is shown (more than 2 todos).
  - When collapsed, append a muted inline summary of non-zero todo counts by status, in the fixed order pending → in_progress → completed → cancelled (e.g. `(2 pending, 1 in progress, 3 done)`), after the bold header label.
  - Gate the existing per-todo `<For>` list rendering behind "2 or fewer todos, or explicitly expanded" — unchanged when not collapsed.
- No changes to the RPC layer, data fetching (`createTodoFeed`), storage layer, or CLI tools — this is purely a `TodoSidebar` rendering/interaction change.

## Capabilities

### Modified Capabilities

- `todo-tui`: Adds a new requirement for collapse/expand behavior in the Todos sidebar header, and modifies the existing "Sidebar renders the focused session's todo list" requirement's rendering condition to account for the collapsed state.

## Impact

- Affected code: `src/tui.tsx` (`TodoSidebar` component only).
- Affected tests: `src/tui.test.ts` (new unit tests for any extracted pure logic, e.g. status-count summary formatting; JSX/triangle rendering itself remains a documented manual/live-capture verification step, consistent with the existing limitation on `TodoSidebar`).
- No new dependencies. No API, schema, or RPC contract changes. No changes to `todo-tools`, `todo-storage`, or `todo-housekeeping` capabilities.
