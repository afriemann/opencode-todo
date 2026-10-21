# Tasks

## 1. Visible JSON output

- [x] 1.1 Replace the checklist-only assertion with failing tests named after “Both tools expose current todos as writable JSON”, “Empty lists return an empty JSON array”, and “Escaped IDs and content survive JSON output”; verify the failures through `bun run test` before implementation.
- [x] 1.2 Add the failing “Visible read and write output supports renamed updates” test using IDs parsed from visible output; verify identity and timestamp assertions against metadata with deterministic time.
- [x] 1.3 Implement the shared projection from `design.md`, remove the checklist renderer, and update descriptions; verify all four scenario tests pass.
- [x] 1.4 Document JSON output and read/update usage in README; verify examples parse and use only accepted input fields.

## 2. Integration verification and review

- [x] 2.1 Run `bun run test`, `bun run lint`, and `bun run build`; verify all pass and self-review the diff for unnecessary complexity.
- [x] 2.2 Obtain code-reviewer review against proposal/specs/diff and a plugin-contract conformance review; resolve all blockers and disposition all warnings before committing.

## Workflow follow-up

- Commit the reviewed implementation, archive through OpenSpec, and commit the archived spec update separately.
- Push the task branch, open its PR, verify delivery, and remove the isolated worktree only after all worktree-dependent actions are finished.
