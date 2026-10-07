# opencode-todo

opencode V2-only plugin restoring the per-session todo list: SQLite store, housekeeping (pruning, auto-archive), and a TUI sidebar.

- Runtime: V2 (`@opencode/plugin`) only. Server plugin `.` (`src/index.ts`) registers tools `todowrite` and `todoread` (`src/tools.ts`); TUI plugin `./tui` (`src/tui.tsx`, Solid/opentui); RPC in `src/rpc.ts`.
- Layout: `src/` with colocated `*.test.ts` (`store`, `tools`, `housekeeping`, `metadata`), `script/build-tui.mjs`, `openspec/` specs. `dist/` is git-ignored build output.
- Commands (bun): `bun run test`, `bun run lint`, `bun run build` (`tsc` + TUI build). CI: `.github/workflows/ci.yml`.
- Gotcha: the `test` script passes `--conditions=browser`; run tests through the script, not bare `bun test`.
- Usage and configuration: see `README.md`.
