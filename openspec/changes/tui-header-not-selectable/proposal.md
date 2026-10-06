# Proposal

## Why

The Todos sidebar header is a click target for collapse/expand, but its text is selectable like any
other terminal text, so clicking or dragging across it highlights the label and triangle instead of
reading as a plain control.

## What Changes

- The Todos header (collapse/expand triangle and the "Todos" label with its collapsed summary) is
  rendered non-selectable.
- Todo item rows stay selectable. Click-to-toggle behaviour is unchanged.

## Capabilities

### New Capabilities

### Modified Capabilities

- `todo-tui`: the requirement "Sidebar supports collapsing and expanding the todo list" gains a
  scenario stating that header text is not selectable.

## Impact

- `src/tui.tsx`: `selectable={false}` on the two header `<text>` elements.
- `openspec/specs/todo-tui/spec.md` (via archive).
