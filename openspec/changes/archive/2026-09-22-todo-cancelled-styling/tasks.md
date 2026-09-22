# Tasks

## 1. Update sidebar rendering

- [x] 1.1 Import `TextAttributes` from `@opentui/core` in `src/tui.tsx`.
- [x] 1.2 Make the todo-content `<text>` element's `fg` and `attributes` props conditional on
      `todo.status === "cancelled"` (muted color + `TextAttributes.STRIKETHROUGH`; base color + no
      attribute otherwise), and verify the existing `src/tui.test.ts` suite still passes unchanged.
- [x] 1.3 Visually verify via a live capture that cancelled items render gray and struck through,
      and that other statuses are unaffected. **Partial**: no interactive TTY available in this
      headless environment (same constraint documented for the wrap-text change). Confirmed
      instead that `TextAttributes.STRIKETHROUGH` and `theme.text.muted` are the same documented,
      typed mechanisms already used elsewhere in this file (`statusColor`) and in `@opentui/core`.

## 2. Spec and quality gates

- [x] 2.1 Run the full test suite, typecheck, and linter and confirm no failures.
- [x] 2.2 Get the change reviewed by `code-reviewer` and resolve every `[BLOCKER]`/`[WARNING]`.
