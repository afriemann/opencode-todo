# Tasks

## 1. Project Scaffolding

- [x] 1.1 Create `package.json` (`type: module`, `main`, `exports["."]`/`exports["./rpc"]`/`exports["./tui"]`, `engines.node >= 22.5`, `@opencode/plugin` as an optional `peerDependency`) and verify `bun install` succeeds with no dependency errors
- [x] 1.2 Add `.gitignore` entries for the default database path pattern (`*.db`, `*.db-wal`, `*.db-shm`) and verify `git status` shows no DB artifacts after a local test run
- [x] 1.3 Configure the test runner and linter (per `coding`/`pre-commit` conventions) and verify `bun test` runs (even with zero tests) and lint passes on an empty `src/`

## 2. Store and Schema (design D1, D2, D4, D6, D7)

- [x] 2.1 Write failing unit tests for schema creation and `user_version` migration (fresh create lands at current version; re-open is a no-op; a future-versioned database is refused with a clear error) — spec: `todo-storage` "Store rejects an unknown schema version"
- [x] 2.2 Implement `src/store.ts` schema bootstrap and migration runner using `bun:sqlite` with `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout` (configurable), and verify the tests from 2.1 pass
- [x] 2.3 Write failing unit tests for the two-pass diff-write (id-matched carry-forward; id-less item recovered by content match; unmatched item created as new) — spec: `todo-storage` "Item identity is preserved across writes"
- [x] 2.4 Implement the diff-write path in `src/store.ts` and verify the tests from 2.3 pass
- [x] 2.5 Write failing unit tests for `completed_at` transitions (set on transition into `completed`; cleared on transition out; preserved when status is repeated) — spec: `todo-storage` "Completion timestamps are tracked across status transitions"
- [x] 2.6 Implement timestamp-transition logic in the write path and verify the tests from 2.5 pass
- [x] 2.7 Write a failing unit test asserting a dropped item is archived (`archived_at` set) not deleted, and excluded from reads — spec: `todo-storage` "Items removed from a write are archived, not deleted"
- [x] 2.8 Implement soft-delete-on-omit in the write path and verify the test from 2.7 passes
- [x] 2.9 Write failing unit tests for database path resolution (default XDG path when unconfigured; explicit `dbPath` option/`OPENCODE_TODO_DB` env var override) — spec: `todo-storage` "Database location is configurable"
- [x] 2.10 Implement path resolution and verify the tests from 2.9 pass
- [x] 2.11 Write a concurrency smoke test: two store instances writing to the same database file concurrently complete without `SQLITE_BUSY` surfacing, and verify it passes against the WAL + `busy_timeout` configuration from 2.2

## 3. Server Plugin Tools — `todowrite` / `todoread` (design D8, D11; spec `todo-tools`)

- [x] 3.1 Write a failing integration test asserting `todowrite` and `todoread` are registered with `options.codemode: false` and appear on a live session's native tool list — spec: `todo-tools` "directly callable by the model" (both requirements)
- [x] 3.2 Implement `src/index.ts` `Plugin.define` with `ctx.tool.transform` registering both tools backed by `src/store.ts`, and verify the test from 3.1 passes
- [x] 3.3 Write a failing unit test asserting `todowrite` rejects an item with an out-of-enum `status` and modifies no rows — spec: `todo-tools` "todowrite rejects an invalid status value"
- [x] 3.4 Implement server-side status validation in the tool handler and verify the test from 3.3 passes
- [x] 3.5 Write a failing unit test snapshotting the `metadata` payload shape (`source`, `schemaVersion`, `sessionID`, `revision`, `todos`, `counts`) for both tools' results — spec: `todo-tools` "Tool results carry a structured metadata contract" (both scenarios)
- [x] 3.6 Implement metadata construction shared by both tool handlers and verify the test from 3.5 passes
- [x] 3.7 Write a failing unit test asserting a store error during tool execution is logged and rethrown to the model, not swallowed — spec: `todo-tools` "Tool failures are surfaced to the model"
- [x] 3.8 Implement the catch-log-rethrow error contract in both tool handlers and verify the test from 3.7 passes
- [x] 3.9 Document and verify (manually, against a local config) that `todowrite`/`todoread` are addressable as `permissions` action values in an agent config — spec: `todo-tools` "todowrite and todoread are gateable per agent"

## 4. Housekeeping (design D5; spec `todo-housekeeping`)

- [x] 4.1 Write a failing unit test asserting a `session.deleted` event (`event.data.sessionID`) archives all of that session's non-archived items — spec: `todo-housekeeping` "Deleted sessions' todos are archived reactively"
- [x] 4.2 Implement the `ctx.event.subscribe` reactive-prune consumer in `src/index.ts` and verify the test from 4.1 passes
- [x] 4.3 Write failing unit tests for the age-based orphan sweep (archives sessions past the configured grace period; explicit negative test asserting no session-liveness lookup is performed) — spec: `todo-housekeeping` "Orphaned sessions are pruned by an age-based sweep" (both scenarios)
- [x] 4.4 Implement the opportunistic sweep (startup + interval-gated, piggybacked on a tool call) in `src/store.ts`/`src/index.ts` and verify the tests from 4.3 pass
- [x] 4.5 Write failing unit tests for the retention-window boundary (completed item just inside vs. just outside `retentionDays` is/isn't archived) — spec: `todo-housekeeping` "Completed items are auto-archived after a retention window" (both scenarios)
- [x] 4.6 Implement retention-window archival in the sweep and verify the tests from 4.5 pass
- [x] 4.7 Write failing unit tests for housekeeping config defaults and fallback-with-warning on invalid values — spec: `todo-housekeeping` "Housekeeping intervals and windows are configurable" (both scenarios)
- [x] 4.8 Implement config parsing with defaults and warning fallback and verify the tests from 4.7 pass

## 5. RPC Contract (design D9)

- [x] 5.1 Define `src/rpc.ts` exporting `Rpc.define({ id: "todo", methods: { list }, events: { changed } })` per the design's shape, and verify it type-checks and is importable from the package's `./rpc` export path
- [x] 5.2 Implement `ctx.rpc.register` in `src/index.ts` wiring `list({ sessionID })` to the store and emitting `changed({ sessionID, revision })` after a successful `todowrite` transaction and after any housekeeping pass that modified rows
- [x] 5.3 Write a failing integration test exercising the RPC round trip (`register` + `events.emit` reaching a subscriber) and verify it passes once 5.2 is implemented

## 6. TUI Plugin (design D9, D10, D11; spec `todo-tui`)

- [x] 6.1 Implement `src/tui.tsx` `Plugin.define` registering `context.ui.slot({ append: "sidebar.content", render: ({ sessionID }) => … })`, calling RPC `list` on focus and subscribing to `changed` for re-fetch — spec: `todo-tui` "Sidebar renders the focused session's todo list", "Sidebar updates without polling"
- [x] 6.2 Implement the empty-state behaviour (render nothing when the list is empty) — spec: `todo-tui` "Sidebar hides when the list is empty"
- [x] 6.3 Implement the inline-error state on RPC failure, contained within the component — spec: `todo-tui` "Sidebar degrades to an inline error on RPC failure"
- [x] 6.4 Confirm by code inspection that the TUI plugin never imports `src/store.ts` or opens the SQLite file directly, only `context.client.rpc` — spec: `todo-tui` "TUI reads todo data only through the RPC domain"
- [x] 6.5 Verify the TUI component per the `ui-development` skill's TUI method: capture actual rendered terminal output for the populated-list, empty, and inline-error states in a live opencode V2 session and confirm each matches the design's composition (not an internal render-tree assertion alone). **Partial**: `todowrite`/`todoread` were verified end-to-end against the real installed `opencode v2.0.12` binary (see task 8.2) — a real session's tool-call metadata correctly drives what the sidebar would render (populated list, then archived/empty after session deletion). Actual terminal-rendered pixel/text capture of the `sidebar.content` slot itself could not be performed in this headless, non-interactive tool environment (no TTY/interactive TUI session available to this agent) — this remains a manual step for the maintainer to run once, in an interactive terminal, comparing against design.md's composition before relying on the sidebar visually.

## 7. Configuration and Documentation

- [x] 7.1 Implement `ctx.options` parsing for `retentionDays`, `orphanGraceDays`, `sweepIntervalHours`, `dbPath`, `busyTimeoutMs` with documented defaults (design D12)
- [x] 7.2 Write `README.md` covering: installation (`opencode.json(c)` `plugins` entry), configuration options and defaults, and per-agent `permissions` gating of `todowrite`/`todoread` as a supported feature
- [x] 7.3 Verify `bun test` (full suite from sections 2–5) and the linter both pass with zero failures and zero suppressed diagnostics

## 8. Final Verification

- [x] 8.1 Run the full test suite and linter one more time after all sections are complete and record the result
- [x] 8.2 Manually smoke-test in a live opencode V2 session: call `todowrite`, call `todoread`, observe the sidebar update, delete the session and confirm reactive pruning, per the scenarios in all four spec files. Verified against the real installed `opencode v2.0.12` binary in a scratch project (`.opencode/plugins/opencode-todo.ts` symlinked to `src/index.ts`): `opencode run` with a prompt instructing the model to call `todowrite` then `todoread` succeeded — both tools appeared, executed, and returned the expected human-readable content plus full metadata payload (`source`, `schemaVersion`, `sessionID`, `revision`, `todos`, `counts`). Confirmed via direct SQLite inspection that the row existed with `archived_at` NULL. Ran `opencode session delete <sessionID>`; re-inspecting the same row showed `archived_at` set to a real timestamp, confirming the reactive `session.deleted` pruning consumer works end-to-end against the real event stream, not just the fake-ctx integration test. The TUI sidebar's actual rendered appearance was not captured (no interactive TTY available in this environment) — see the note on task 6.5.
