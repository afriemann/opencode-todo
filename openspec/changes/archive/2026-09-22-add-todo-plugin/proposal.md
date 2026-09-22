# Proposal

## Why

opencode v2 deliberately removed the v1 todo-list feature (the `todowrite`/`todoread` tools,
the `todo.updated` event, and the TUI sidebar showing session todos). This was verified
against the user's actual running `opencode-v2 2.0.12` binary via three independent live
checks (a direct tool-call attempt, an `opencode run` invocation, and a fresh tool-catalog
search all agreeing `todowrite` does not exist), and independently corroborated by the user's
own `opencode-auto-instruct` plugin, whose source comments document — as of the V2 CLI
version it targets — that no server-side todo-management tool or `todo.*` event exists on
V2. Local source checkouts referencing a "V2" branch were found to carry a mismatched
package version and are not treated as authoritative for this question.

The user relies on per-session todo tracking as a working aid during agent-driven tasks and
wants that capability restored as an installable opencode V2 plugin. `todoread` in
particular has value beyond mirroring transcript scrollback: it lets an agent recover the
current list after context compaction or a fresh turn without re-deriving it from history.
The user has also asked that the restored tools be observable by other plugins — in
particular `opencode-auto-instruct`, whose rule engine currently marks every todo-derived
condition type as unsupported on V2 for lack of a source to observe. This plugin's
`todowrite`/`todoread` tool results are designed to carry a structured `metadata` payload
(the full current todo list, with per-item status) so that any plugin already watching
`ctx.tool.hook("execute.after")` host-wide — which observes every tool call including this
plugin's — can reconstruct those todo-derived conditions without this plugin needing a
bespoke publish channel.

## What Changes

- New standalone npm-style opencode V2 plugin package (`opencode-todo`) exposing:
  - A server plugin (`@opencode/plugin`) that owns a per-session todo store backed by SQLite
    (via `bun:sqlite`, pending verification of availability — see design.md), and registers
    two agent-callable tools with V1-parity names: `todowrite` (replace the full ordered todo
    list for the calling session) and `todoread` (return the current ordered todo list for the
    calling session).
  - An RPC domain (`@opencode/plugin/rpc`) exposing read access to the current session's todo
    list, so the separate TUI-plugin process can query live data without opening the SQLite
    file directly.
  - A TUI plugin (`@opencode/plugin/tui`) that renders the current session's todos into the
    `sidebar.content` slot of the opencode V2 terminal interface, refreshing when the list
    changes.
  - Background housekeeping run by the server plugin: (a) periodically prune todo rows whose
    owning session no longer exists, and (b) auto-archive (delete) completed todo items after
    a configurable retention window, default 7 days.
- Target runtime: opencode V2 only (no V1 compatibility surface).

## Capabilities

### New Capabilities
- `todo-storage`: SQLite-backed persistence of an ordered, per-session todo list, including
  the schema and the write/read semantics `todowrite`/`todoread` rely on.
- `todo-tools`: the two agent-callable tools (`todowrite`, `todoread`) and their input/output
  contracts, replicating v1 tool-name parity.
- `todo-housekeeping`: scheduled pruning of orphaned session todos and auto-archival of
  completed items after a configurable retention window.
- `todo-tui`: the TUI sidebar component that surfaces the current session's todos, and the
  RPC contract it uses to read live data from the server plugin.

## Impact

- New repository `opencode-todo` (this repo); no existing code affected.
- New runtime dependency: a SQLite driver (`bun:sqlite` if verified available, else
  `better-sqlite3`).
- New peer dependency: `@opencode/plugin` (optional peer, per plugin conventions).
- Adds an on-disk SQLite database file per installation (path TBD in design.md), which must be
  excluded from version control.
