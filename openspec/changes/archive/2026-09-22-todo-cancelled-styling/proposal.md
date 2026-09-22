# Proposal

## Why

The sidebar currently renders every todo item's content in the same base text color regardless of
status. Cancelled ("skipped") items look identical in text weight/color to active ones, making it
hard to tell at a glance which items were intentionally skipped versus still pending or done.

## What Changes

- Cancelled todo items render their content in the muted/gray theme color (matching the existing
  gray used for the cancelled status glyph) instead of the base text color.
- Cancelled todo items render their content with a strikethrough text attribute.
- No change to any other status's rendering, to data flow, or to RPC usage.

## Capabilities

### Modified Capabilities

- `todo-tui`: adds a requirement describing how cancelled todo items are styled for visual
  distinction.

## Impact

- `src/tui.tsx`: the todo-content `<text>` element's `fg`/`attributes` props become conditional on
  `todo.status`; adds an import of `TextAttributes` from `@opentui/core`.
- No API, schema, or RPC changes. No new dependencies.
