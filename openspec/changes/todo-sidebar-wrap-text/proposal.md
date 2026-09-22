# Proposal

## Why

The sidebar's todo content currently renders on a single line (`wrapMode="none"`) with `truncate`
enabled, so any item longer than the sidebar's width is hard-cut mid-word and replaced with a
trailing ellipsis (see the reported screenshot showing entries like "Set up worktree ... for this
change"). This makes many items unreadable at a glance, defeating the sidebar's purpose of showing
an agent's plan.

## What Changes

- Todo item text in the sidebar wraps at word boundaries across up to 2 lines instead of being cut
  to a single line.
- If content still doesn't fit within 2 lines, it is truncated with an ellipsis on the 2nd line
  (unchanged fallback behavior for pathologically long items).
- No change to data flow, RPC usage, or any other sidebar behavior.

## Capabilities

### Modified Capabilities

- `todo-tui`: adds a requirement describing how todo item text wraps/truncates for readability.

## Impact

- `src/tui.tsx`: the todo-content `<text>` element's `wrapMode`/`truncate`/`maxHeight` props change.
- No API, schema, or RPC changes. No new dependencies.
