# Tasks

## 1. Update sidebar rendering

- [x] 1.1 Change the todo-content `<text>` element in `src/tui.tsx` from
      `wrapMode="none" truncate` to `wrapMode="word" truncate maxHeight={2}`, and verify the
      existing `src/tui.test.ts` suite still passes unchanged (no rendering behavior it asserts is
      affected).
- [x] 1.2 Visually verify via a live capture that a long todo item now wraps across up to 2 lines,
      and that a pathologically long item still truncates with an ellipsis on the 2nd line.
      **Partial**: as with the original `todo-tui` change (task 6.5), no interactive TTY/live
      opencode V2 session is available in this headless tool environment to capture the
      `sidebar.content` slot's actual rendered terminal output. Confirmed instead: (a) the exact
      `wrapMode="word"` + `truncate` + `maxHeight={2}` combination matches an existing, working
      pattern already shipped in opencode v2's own TUI (`packages/tui/src/component/dialog-shell-output.tsx:113`,
      `maxHeight={3} wrapMode="word"`), and (b) `wrapMode`/`truncate`/`maxHeight` are documented,
      typed options on `@opentui/core`'s `TextBufferRenderable` (`renderables/TextBufferRenderable.d.ts`).
      Actual terminal-rendered capture remains a manual step for the maintainer to run once in an
      interactive session before relying on the sidebar visually.

## 2. Spec and quality gates

- [x] 2.1 Run the full test suite and linter and confirm no failures.
- [x] 2.2 Get the change reviewed by `code-reviewer` and resolve every `[BLOCKER]`/`[WARNING]`.
