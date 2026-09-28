# Tasks

## 1. Tests (red step)

- [x] 1.1 Add a failing test in `src/tools.test.ts` — "defaults status to pending when omitted" —
      asserting `todowrite` succeeds for an item with no `status` field and the stored item's
      `status` is `"pending"`; verify it fails against current code (missing status throws).

## 2. Implementation (green step)

- [x] 2.1 Relax `todowrite`'s JSON input schema in `src/tools.ts`: change
      `required: ["content", "status"]` to `required: ["content"]` on the todo item schema.
- [x] 2.2 Update item validation/normalization in `src/tools.ts` so a missing `status` defaults to
      `"pending"` before the item is passed to `store.write`, while an explicitly-provided invalid
      `status` value is still rejected with an error; verify the new test from 1.1 passes and the
      existing "rejects an invalid status" test still passes.
- [x] 2.3 Update `TODOWRITE_DESCRIPTION` in `src/tools.ts` to document that an omitted `status`
      defaults to `pending`.

## 3. Documentation

- [x] 3.1 Update the `todowrite` section of `README.md` to note `status` is optional and defaults
      to `pending` when omitted.

## 4. Verification

- [x] 4.1 Run `bun run test`, `bunx tsc --noEmit`, and `bunx eslint src/` and confirm all pass.
