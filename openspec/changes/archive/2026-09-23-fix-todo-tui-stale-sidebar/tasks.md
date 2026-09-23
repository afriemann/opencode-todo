# Tasks

## 1. Failing tests (red step)

- [x] 1.1 Add a failing test `"safety-net interval re-fetches even without a changed event"` to
  `src/tui.test.ts` that advances a fake/mock clock past the reconciliation interval with no
  `emit()` call, and asserts `listCalls.length` increased; confirm it fails against current code.
- [x] 1.2 Add a failing test `"safety-net interval is cleared on session change / dispose"` that
  asserts no further `list()` calls occur from a stale interval after the feed's session changes
  or its root is disposed; confirm it fails or is not yet meaningful against current code.

## 2. Implementation (green step)

- [x] 2.1 In `src/tui.tsx`, add a 30-second `setInterval` fallback refresh inside
  `createTodoFeed`'s existing `createEffect`, alongside the `changed` event subscription, cleaned
  up via `onCleanup(() => clearInterval(...))` with the same lifecycle as the event subscription
  dispose. Verify both new tests from section 1 now pass.
- [x] 2.2 Run the full existing `src/tui.test.ts` suite and confirm all previously passing tests
  remain green (no regression in event-driven behaviour or session-change tracking).

## 3. Spec sync and verification

- [x] 3.1 Confirm the delta spec at `specs/todo-tui/spec.md` in this change matches what was
  built (interval duration, coexistence with the event path) — `openspec validate
  fix-todo-tui-stale-sidebar` passes.
- [x] 3.2 Run the project's full test suite and linters; fix any failures before review.
