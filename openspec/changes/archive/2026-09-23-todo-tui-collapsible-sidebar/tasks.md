# Tasks

## 1. Extracted logic (red-step tests first)

- [x] 1.1 Add failing unit tests in `src/tui.test.ts` for `formatCollapsedSummary(todos)`: single non-zero status, multiple non-zero statuses in fixed order (pending → in_progress → completed → cancelled), all four statuses present, and the `completed` → `"done"` label mapping — verify the tests fail (function does not exist yet)
- [x] 1.2 Implement `formatCollapsedSummary` in `src/tui.tsx` per `design.md` D3 and verify all tests from 1.1 pass

## 2. `TodoSidebar` collapse/expand rendering

- [x] 2.1 Add the `context.storage.store("view", { initial: { open: true } })` call inside `TodoSidebar` per `design.md` D2
- [x] 2.2 Add the `▼`/`▶` triangle before the `Todos` header label, gated on `feed.todos().length > 2`, and verify by reading the diff that the gating expression matches `design.md` D2 exactly
- [x] 2.3 Wire `onMouseDown` on the header row to toggle `view.open` (only when `feed.todos().length > 2`), with the storage-write failure caught and logged per `design.md` D4, and verify by reading the diff that it matches `SidebarMcp`'s handler shape
- [x] 2.4 Render the collapsed summary (`formatCollapsedSummary(feed.todos())`) in a muted inline span after `<b>Todos</b>`, shown only when `!view.open`
- [x] 2.5 Change the existing `<For>` item-list gate to `feed.todos().length <= 2 || view.open` and verify by reading the diff that item rendering is unaffected when the list is short or expanded

## 3. Verification

- [x] 3.1 Run the full test suite (`bun test` or the project's configured test runner) and linters, and verify all pass with no suppressed failures — note: 5 pre-existing `createTodoFeed` failures were confirmed present on `main` as well (unrelated to this change, out of scope; flagged to the user) — all 4 new `formatCollapsedSummary` tests and the rest of the suite pass; `eslint` and `tsc --noEmit` are clean
- [ ] 3.2 Manually verify the rendered triangle, collapsed summary text, and click-to-toggle behavior against a real terminal per the documented manual/live-capture limitation (`design.md` Testability/Verification Split), and record the outcome
