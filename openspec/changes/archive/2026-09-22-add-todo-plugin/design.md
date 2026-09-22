# Design

## Context

See `proposal.md` — Why. This section records only the constraints that shape the approach.

**Confirmed premise.** The removal of the V1 todo feature from opencode V2 is intentional and will
not be reinstated upstream: GitHub issue `anomalyco/opencode#42421` is closed with state reason
`not_planned`, with an official comment "This is intentional in V2. The TODO tools are not currently
planned" and maintainer `rekram1-node` stating "we removed it because it slows agent down and we
haven't noticed significant performance improvements from it's existence." This plugin therefore
targets a permanently vacant slot, not a temporary gap — there is no upstream implementation to
converge with later.

opencode's own SQLite database (`~/.local/share/opencode/opencode.db`, path printable via
`opencode debug paths db`) retains a vestigial `todo` table (`session_id, position, status,
content`). It is **not** a public or writable contract and this design does not read or write it.

**Given constraints** (set by the user; treated as boundaries to design within, not re-opened):

| # | Constraint |
|---|---|
| C1 | opencode V2 only; no V1 compatibility surface. |
| C2 | Tool names are exactly `todowrite` and `todoread` (V1 parity), registered via `ctx.tool.transform`, with `options.codemode: false` so they stay on the provider's native tool list. |
| C3 | Storage is SQLite, not the plugin KV store. |
| C4 | The TUI reads live data over an RPC domain from the server plugin — it does **not** open the SQLite file from the TUI process. |
| C5 | Housekeeping prunes todos of deleted sessions and auto-archives completed items after a configurable window (default 7 days). |
| C6 | Tool results carry a structured `metadata` payload so host-wide `execute.after` observers (e.g. `opencode-auto-instruct`) can reconstruct todo-derived conditions with no bespoke publish channel. |

**Verified V2 API facts** used by this design (source: opencode.ai/v2 docs and the opencode SDK
reference, via Context7 — deliberately *not* the local `~/.local/share/opencode/repos/` checkouts,
which carry mismatched version labels on this machine):

- Tool registration: `ctx.tool.transform((editor) => editor.add({ name, description, input /* JSON
  Schema */, options: { namespace?, codemode }, execute: async (input, tool) => ({ content }) }))`.
  The transform callback is synchronous; opencode replays active transforms in registration order.
- Tool results carry `metadata`. The documented `execute.after` hook shape is
  `event.result = { ...event.result, metadata: { observed: true } }`, and the hook interface is
  `"execute.after": ToolExecuteCompleted | ToolExecuteFailed` with `event.status`, `event.tool`,
  `event.input`, `event.result`, `event.error`. A host-wide observer therefore *can* read another
  plugin's tool `metadata`.
- RPC: `Rpc.define({ id, methods, events })` from `@opencode/plugin/rpc`; server side
  `ctx.rpc.register(Rpc, impl)` returning a registration with `registration.events.emit(name, data)`;
  TUI side `context.client.rpc(Rpc)` for calls and `.events.subscribe(name)` for a stream.
- TUI: `@opencode/plugin/tui`, Solid JSX. `context.ui.slot({ append: "sidebar.content", render:
  ({ sessionID }) => … })` — the slot render props supply the focused `sessionID`, and
  `context.data.session.get(sessionID)` reads session data.
- Events: `for await (const event of ctx.event.subscribe({ signal }))`, discriminated on
  `event.type`. `session.deleted` payload is flat: `event.data.sessionID` — confirmed against
  source (`packages/schema/src/session-event.ts:41-43,170-177`, `Base = { sessionID: SessionID }`),
  matching `opencode-auto-instruct.js`'s own confirmed `event.data.sessionID` read pattern. (This
  corrects an earlier draft assumption of a nested `properties.info.id` shape — see Open
  Questions #3.)
- Options: `opencode.json(c)` entry `{ "package": …, "options": { … } }`, read at setup from
  `ctx.options`.
- Permissions: V2 uses one ordered `permissions` array of `{ action, resource, effect }`.
  `action` is confirmed a plain `Schema.String` in the actual request schema
  (`packages/schema/src/permission.ts:27`) — an open value space, not a fixed enum. A
  plugin-registered tool name (e.g. `todowrite`) is therefore a usable `action` value, giving V1-style
  per-agent gating (e.g. `{ action: "todowrite", resource: "*", effect: "deny" }` in a subagent's
  config) with no platform limitation.

**Not verified** — carried into Open Questions with fallbacks: none remain outstanding as of the
verification pass below; see Open Questions for the resolution record.

## Goals / Non-Goals

**Goals**

- A per-session, ordered todo list durable across context compaction, turn boundaries, and opencode
  restarts.
- Stable per-item identity, so metadata (`created_at`, `completed_at`) survives repeated writes and
  retention is computed correctly.
- A tool-result `metadata` contract stable enough for third-party `execute.after` observers to
  depend on, versioned so it can evolve without silently breaking them.
- Housekeeping that is safe by construction: no code path can destroy live data because a liveness
  check returned a false negative.
- A read-only sidebar that reflects the focused session's list and disappears when there is nothing
  to show.

**Non-Goals** (explicit — each is a deliberate v0.1.0 exclusion, not an oversight)

- **No V1 compatibility surface.** No `todo.updated` event, no V1 plugin API shim.
- **No cross-session or global todo view.** Todos are scoped strictly to one session id.
- **No parent/child session merging.** A subagent session keeps its own list; it is never folded
  into the spawning session's list (see Decision 3).
- **No editing from the TUI.** The sidebar is read-only; the model is the only writer.
- **No keybinds, filtering, sorting, search, or export** in v0.1.0.
- **No reuse of opencode's internal `todo` table.**
- **No bespoke pub/sub channel for other plugins** — the `metadata` payload on tool results is the
  entire integration surface (C6).

## Architecture

```mermaid
flowchart LR
  subgraph server["opencode server process"]
    M[model / agent] -->|todowrite, todoread| T[tool layer]
    T --> SP[server plugin: opencode-todo]
    SP --> ST[(todo store)]
    SP --> HK[housekeeping]
    EV[ctx.event.subscribe] -->|session.deleted| HK
    SP --> RPCREG[RPC domain 'todo' registration]
    T -.->|result.metadata| OBS[other plugins' execute.after hooks]
  end

  ST <--> DB[("SQLite: todos.db\nWAL, busy_timeout")]
  HK --> ST

  subgraph tui["opencode TUI process"]
    SLOT["ui.slot append sidebar.content\nrender: ({ sessionID }) => …"]
    RPCCLI[context.client.rpc]
  end

  RPCCLI -->|list(sessionID)| RPCREG
  RPCREG -->|events.emit 'changed'| RPCCLI
  RPCCLI --> SLOT
```

Three deployable pieces in one package, plus a shared contract module:

| Component | Kind of work | Done-criterion |
|---|---|---|
| **Store + schema** (`src/store.ts`) | Application code — SQLite schema, `user_version` migrations, diff-write, read, archive, prune | Opens/creates the DB at the resolved path, applies migrations idempotently, and passes the unit suite for diff and retention semantics |
| **Server plugin** (`src/index.ts`) | Application code — `Plugin.define`, `ctx.tool.transform` registration of both tools, `ctx.rpc.register`, `ctx.event.subscribe` consumer, cleanup | `todowrite`/`todoread` are model-callable in a live V2 session, return the documented `metadata`, and the plugin disposes cleanly on shutdown |
| **RPC contract** (`src/rpc.ts`, exported as `./rpc`) | Application code — `Rpc.define` with one method and one event | Importable by the TUI plugin from the published package path; schema-validated both ends |
| **TUI plugin** (`src/tui.tsx`) | Application code (TUI/Solid) — sidebar slot component, RPC subscription, empty/error states | Renders the focused session's list, updates on emit without polling, hides on empty, degrades to an inline error on RPC failure — verified per the `ui-development` skill's TUI method, not by unit test alone |
| **Config + docs** (`README.md`, option parsing) | Documentation + application code | Options documented with defaults; per-agent permission-gating of `todowrite`/`todoread` documented in the README as a supported feature |

## Decisions

### D1 — Item schema and identity: stable `id`, minted server-side, with a content fallback

**Chosen.** An item is `{ id, content, status, priority }` where `status ∈ { pending, in_progress,
completed, cancelled }` (note `cancelled` — easily omitted and needed for "abandoned, not done").
`id` is optional on input; the server mints an opaque id when absent. `todoread` always returns ids,
and the `todowrite` tool description instructs the model to echo them back for items it is carrying
forward.

Because a model *will* sometimes drop ids, id-matching alone is not sufficient. The write path
matches in two passes: first by `id`, then — for incoming items with no id — by exact `content`
string against not-yet-matched existing rows. Anything still unmatched is a new item.

*Alternatives.* (a) *Position as identity* — zero model burden, but reordering silently rewrites
history and `completed_at` is meaningless; rejected. (b) *Id-only matching, no fallback* — clean, but
a single id-less write wipes every item's timestamps, which is exactly the retention bug this design
exists to avoid; rejected. The content fallback is a small amount of extra logic that converts a
silent data-loss mode into a recoverable one.

### D2 — `todowrite` diffs, it does not blind-replace

**Chosen.** `todowrite` receives the full intended list (V1 semantics, preserved) but applies it as a
diff against existing rows for that session: persisting items keep `created_at` and, if they were
already `completed`, their `completed_at`; items whose status transitions *into* `completed` get
`completed_at = now`; items transitioning *out of* `completed` have `completed_at` cleared; items
absent from the incoming list are **soft-deleted** (`archived_at = now`), never hard-deleted.
`position` is reassigned from the incoming array order on every write. The whole write runs in one
transaction and bumps a per-session `revision` counter.

*Alternative.* `DELETE FROM todo WHERE session_id = ?` then re-insert — three lines, and it is how a
naive port would work. It destroys `created_at`/`completed_at` on every single call, which makes the
7-day retention window (C5) measure nothing but "time since the agent last wrote the list". Rejected.

### D3 — Session scoping: the literal session id, no parent merging

**Chosen.** Todos are keyed on the session id the tool call arrives with, verbatim. A subagent gets
its own list. This is stated as a Non-Goal above rather than left implicit, because "should the
subagent's todos appear in the parent's sidebar?" is the first question a reader will ask.

*Alternative.* Walk to the root session and merge. Rejected on YAGNI and on correctness: a subagent's
plan is its own unit of work, merging makes concurrent subagents race on one list, and nothing in the
requirements asks for it. Revisit only if a concrete need appears.

### D4 — Archive as soft-delete

**Chosen.** An `archived_at` timestamp column. Retention, removal-on-write (D2), and orphan pruning
all set it; nothing in v0.1.0 issues a `DELETE`. All reads filter `archived_at IS NULL`.

*Alternative.* Hard delete, with `VACUUM` pressure as the only cost. Rejected because a defect in the
retention arithmetic — an off-by-one on the window, a timezone/epoch-unit mistake — is then
immediately and irreversibly destructive to the user's working notes. Soft-delete makes the same
defect a recoverable annoyance and leaves archived rows inspectable. Row growth is negligible at this
scale; a hard-delete compaction pass is a future addition if it ever matters.

### D5 — Housekeeping: reactive first, opportunistic sweep as belt-and-braces

**Chosen, hybrid.** The primary path is reactive: the server plugin consumes `ctx.event.subscribe`
and, on `session.deleted`, archives that session's rows using `event.data.sessionID`. The secondary
path is an opportunistic sweep — once at plugin startup and at most once per configurable interval,
piggybacked on a `todowrite`/`todoread` call rather than a timer — which applies the retention window
to `completed` items and archives rows for sessions older than a **conservative grace period**
(default 30 days) with no recent activity.

Critically, the sweep does **not** perform a session-liveness lookup. Orphan detection is by age
alone. A liveness check that returns a false negative (server restarting, session store
transiently unavailable) would archive live data; age-based archival cannot.

*Alternatives.* (a) *Polling timer only* — needs a liveness oracle to be useful, and that oracle is
the failure mode above; also keeps a timer alive for the process lifetime. Rejected. (b) *Reactive
only* — misses rows orphaned while the plugin was not loaded (sessions deleted by a different
opencode instance, or the DB surviving an uninstall/reinstall). Rejected as incomplete. The hybrid
costs one extra query on an occasional tool call.

### D6 — Database location: a dedicated directory, not opencode's

**Chosen.** `$XDG_DATA_HOME/opencode-todo/todos.db`, defaulting to
`~/.local/share/opencode-todo/todos.db`. Overridable by the `dbPath` plugin option and the
`OPENCODE_TODO_DB` environment variable. One global database, not one per project or worktree.

Global-not-per-project is what survives worktree removal (`use_clear`, `git worktree remove`) without
taking the user's todo history with it, and avoids N copies of the schema to migrate. A dedicated
directory rather than opencode's own data directory keeps the file outside the blast radius of
opencode's release-channel path logic and its own DB migration tooling, at the cost of one more
directory in `~/.local/share`.

Concurrency: multiple opencode server instances can run simultaneously, each with its own plugin
instance and its own connection to this one file. Mitigated by `PRAGMA journal_mode=WAL` (concurrent
readers alongside one writer) plus `PRAGMA busy_timeout` (default 5000 ms) so a contended write waits
rather than failing with `SQLITE_BUSY`. Writes are short single-session transactions, so contention
is expected to be rare and brief.

*Alternative.* A per-project DB next to the project root. Rejected: duplicates schema/migration
surface, loses history on worktree cleanup, and offers no concurrency benefit that WAL does not
already provide.

### D7 — Schema migrations via `PRAGMA user_version` from day one

**Chosen.** `user_version` is the migration marker; on open, the store applies each pending migration
step in order inside a transaction and bumps the version. v0.1.0 ships as version 1 with the initial
schema, even though there is nothing yet to migrate *from* — the cost is one `switch` statement, and
the alternative (adding migrations later, after users have data) is the case where getting it wrong
destroys that data. If the on-disk `user_version` is *newer* than the code knows, the store refuses
to open and reports a clear error rather than operating on an unknown schema.

Schema sketch (illustrative, not final DDL):

```
todo(
  session_id TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  position   INTEGER NOT NULL,
  content    TEXT NOT NULL,
  status     TEXT NOT NULL,   -- pending | in_progress | completed | cancelled
  priority   TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  archived_at  INTEGER,
  PRIMARY KEY (session_id, item_id)
)
-- index on (session_id, archived_at, position) for the hot read path
-- index on (archived_at, completed_at) for the retention sweep
```

All timestamps are integer epoch **milliseconds**, UTC. Stated explicitly because mixed
seconds/milliseconds is the single likeliest source of a retention-window defect.

### D8 — Tool-result `metadata` contract (C6)

**Chosen.** Both `todowrite` and `todoread` return the *same* metadata shape, so an observer needs one
code path, not two:

```
metadata: {
  source: "opencode-todo",
  schemaVersion: 1,
  sessionID: string,
  revision: number,
  todos: [{ id, content, status, priority, position, createdAt, updatedAt, completedAt }],
  counts: { total, pending, in_progress, completed, cancelled }
}
```

`source` and `schemaVersion` are load-bearing: `execute.after` is host-wide, so an observer sees every
tool's metadata and needs a reliable discriminator that is not the tool name (which a future
namespacing change could alter). `counts` is derivable from `todos` but is included because the
typical consumer condition ("all todos complete", "any in progress") is a count test, and requiring
every observer to re-derive it invites divergent interpretations of `cancelled`. `revision` lets an
observer discard out-of-order or duplicate observations.

`content` (the model-visible text output) stays human-readable and compact; the structured payload
lives only in `metadata` and is not re-serialised into the text, so it costs no model context.

*Alternative.* Emitting a custom event or exposing a second RPC domain for observers. Rejected:
it requires every consumer to take a dependency on this package, whereas `execute.after` is already
being watched host-wide by the consumer that motivated the requirement. Explicitly a Non-Goal.

### D9 — TUI data flow: push on change, pull on focus

**Chosen.** The RPC domain `todo` exposes one method, `list({ sessionID }) -> { revision, todos }`,
and one event, `changed({ sessionID, revision })`. The sidebar slot's render props supply the focused
`sessionID` directly, so no separate focus-tracking mechanism is needed. The TUI plugin calls `list`
when the focused session changes, subscribes to `changed`, and re-calls `list` when an event arrives
for the session it is displaying. The server plugin emits `changed` at the end of every successful
`todowrite` transaction and after any housekeeping pass that modified rows.

The event carries only `{ sessionID, revision }` rather than the full list: it keeps the event
schema stable as the item shape evolves, avoids pushing data for the ~N sessions the TUI is not
showing, and makes the pull the single source of truth for what is rendered.

*Alternatives.* (a) *Poll `list` on an interval* — simple, but wastes work when idle and still lags a
write by up to the interval. Rejected. (b) *Push the full list in the event* — saves one round trip
at the cost of a wider, more churn-prone event schema and fan-out of irrelevant data. Rejected;
the round trip is local and cheap.

### D10 — Empty state: hide the slot

When the focused session has zero non-archived todos, the component renders nothing, so the sidebar
shows no empty box or heading. This matches V1's sidebar behaviour and keeps sidebar space free for
sessions that are not using todos at all — which, given the tools are opt-in per agent, is most of
them.

### D11 — Failure semantics

- **Tools.** Follow the tool-registration error contract: catch, log with context, rethrow so the
  failure is surfaced to the model rather than silently swallowed. A model that believes a write
  succeeded when it did not is worse than one that sees an error and retries. Input is validated
  against the JSON Schema *and* re-checked server-side for the `status` enum; an unknown status is a
  rejected write, not a coerced one.
- **Store.** If the database cannot be opened or migrated, the plugin logs a clear diagnostic and
  registers the tools in a failing state rather than aborting plugin setup — a broken todo store must
  not prevent the rest of the user's opencode session from starting.
- **TUI.** An RPC failure renders a single-line inline error inside the slot; it never throws out of
  the component, because doing so would take the whole sidebar down over a secondary feature.

### D12 — Configuration

Options come from `ctx.options` (populated from the `opencode.json(c)` entry
`{ "package": "opencode-todo", "options": { … } }`), with documented defaults applied for every key:

| Option | Default | Purpose |
|---|---|---|
| `retentionDays` | `7` | Age after `completed_at` before a completed item is archived |
| `orphanGraceDays` | `30` | Age before an inactive session's rows are archived by the sweep |
| `sweepIntervalHours` | `24` | Minimum interval between opportunistic sweeps |
| `dbPath` | `$XDG_DATA_HOME/opencode-todo/todos.db` | Database location (also `OPENCODE_TODO_DB`) |
| `busyTimeoutMs` | `5000` | SQLite `busy_timeout` |

Out-of-range or wrong-typed values fall back to the default with a logged warning rather than
failing setup.

### YAGNI rejections

Removed from scope with the reason recorded, so a later reader does not re-propose them as
oversights: cross-session/global views (no stated need); TUI editing (the model is the writer; an
editable sidebar needs conflict resolution against concurrent model writes); keybinds, filtering,
sorting, search, export (v0.1.0 has no user demand); a V1 data-import path (V1 todos were ephemeral
per session); a custom event API for observers (D8 supersedes); a per-project database (D6); a
background timer/daemon (D5); hard-delete compaction (D4); tool namespacing (C2 fixes the names).

## Test Plan

**Unit-testable, and where the real risk lives:**

- *Diff semantics (D1/D2)* — id-matched carry-forward; id-less items recovered by content fallback;
  `completed_at` set on transition in, cleared on transition out, preserved across an unrelated
  write; removed items archived not deleted; position reassigned from array order; `revision`
  monotonic. This is the highest-value suite: it is where the retention story is actually decided.
- *Retention and sweep (D5)* — window boundary conditions (just inside / just outside
  `retentionDays`), millisecond-vs-second unit correctness, the sweep interval gate, and a negative
  test asserting the sweep performs **no** session-liveness lookup.
- *Migration (D7)* — fresh create lands at the current `user_version`; re-open is a no-op; a
  future-versioned database is refused with a clear error rather than opened.
- *Metadata contract (D8)* — snapshot the exact payload shape for both tools; a change to it must
  fail the test and force a `schemaVersion` decision.
- *Config (D12)* — defaults applied; invalid values fall back with a warning.

**Needs integration against a live plugin host:** RPC method/event round trip (server `register` +
`events.emit` reaching a TUI-side `subscribe`), tool registration actually appearing on the model's
native tool list with `codemode: false`, and the `session.deleted` reactive prune firing on a real
event.

**Not accepted on an internal test pass alone:** the sidebar slot rendering. Per the
`ui-development` skill's TUI verification method, the component must be verified by observing actual
terminal output — populated list, empty state (slot absent, no residual heading or border), and the
inline error state — not by asserting on a render tree.

**Concurrency smoke test:** two processes writing to the same database concurrently complete without
`SQLITE_BUSY` surfacing to the model, confirming WAL + `busy_timeout` are configured as intended.

## Risks / Trade-offs

- **`bun:sqlite` availability** → **RESOLVED.** Confirmed via source (`packages/core/src/database/sqlite.bun.ts:1`, branch `v2`): opencode's own core imports `bun:sqlite` as its primary driver under Bun, with `node:sqlite` as the documented non-Bun fallback. Plugins load in the same Bun process as the host, so `bun:sqlite` is available with no native build step; adopted as the sole driver for v0.1.0. The store still keeps a narrow internal interface (open, exec, query, transaction) as cheap insurance against a future runtime change, not because a fallback is currently expected.
- **The model drops item ids on rewrite** → The content fallback (D1) recovers timestamps for
  unchanged text; text edited *and* id-dropped in the same write is treated as a new item and loses
  its `created_at`. Accepted: the failure is a reset timestamp, not lost content, and `todoread`
  returning ids plus an explicit tool description makes it uncommon.
- **The tool `execute` context may not expose a calling session id under the name assumed** →
  **RESOLVED.** Confirmed via source (`packages/schema/src/tool.ts:14-20`, branch `v2` of
  `github.com/anomalyco/opencode`): `Tool.Context` is `{sessionID, agent, messageID, id, progress}`.
  `context.sessionID` is directly available to `execute(input, context)`; no re-examination needed.
- **`todowrite`/`todoread` can in fact be permission-gated per agent** → **CORRECTED.** V2's
  `permissions` array uses an open `action: Schema.String` (`packages/schema/src/permission.ts:27`),
  not a fixed enum. A plugin-registered tool name is a valid `action` value, so V1-style per-agent
  gating (e.g. denying `todowrite` to a `general` subagent) is fully supported — document this as a
  supported feature in the README, not a limitation.
- **Tool-name collision** → C2 fixes bare names `todowrite`/`todoread` with no namespace. If another
  plugin registers the same names, opencode's documented rule is that a later registration overrides
  an earlier one for the same effective name — meaning behaviour depends on plugin load order.
  Mitigation: log the registration at setup so a collision is diagnosable from the log.
- **Metadata contract becomes a de-facto public API** → Third parties will depend on it. Mitigated by
  `schemaVersion` from v0.1.0 and by treating the contract as semver-relevant; document it in the
  README as a supported surface, additive-only within a major version.
- **Multi-instance write contention** → WAL + `busy_timeout` (D6); writes are short. If contention is
  ever observed, the next step is a short in-process write queue, not a change of store.
- **Database file must not be committed** → Add the DB path pattern to `.gitignore`; the default
  location is outside any repository, so this only guards a `dbPath` override pointed at a project.

## Migration Plan

Greenfield — there is no existing installation, no data to migrate, and nothing to roll back to.
Deployment is `opencode.json(c)` plugin installation. Rollback is removing the plugin entry; the
database file is left in place (harmless, and re-usable on reinstall) and can be deleted manually.
The `user_version` scheme (D7) is what makes *future* releases migratable.

## Open Questions

Each of these is answerable by direct inspection during implementation and does not change the
component breakdown — except the first, which is flagged as blocking.

1. ~~**(Blocking)** What is the exact field on the tool `execute` context that carries the calling
   session id~~ — **RESOLVED.** `Tool.Context` (`packages/schema/src/tool.ts:14-20`, branch `v2`)
   is `{sessionID: Session.ID, agent, messageID, id, progress}`; `packages/plugin/src/promise/tool.ts:11`
   confirms the promise-API `ToolContext` passed to a registered tool's `execute(input, context)`
   carries `context.sessionID` directly. For a subagent, `sessionID` is the child's own session id
   (its own `Tool.Context`, not the parent's) — consistent with D3's "literal session id, no parent
   merging" decision, which stands unchanged.
2. ~~Is `bun:sqlite` importable from the plugin execution runtime?~~ — **RESOLVED.** opencode's own
   core (`packages/core/src/database/sqlite.bun.ts:1`) imports `bun:sqlite` as its primary driver
   under Bun, with `node:sqlite` as the documented non-Bun fallback (`sqlite-bundle.test.ts`).
   Plugins load in the same Bun process as the host, so `bun:sqlite` is available with no native
   build step. Adopt it as the sole driver for v0.1.0; keep the narrow store interface (D6) as
   insurance, not because a fallback is currently expected to be needed.
3. ~~Does `session.deleted` carry `properties.info.id`?~~ — **CORRECTED, not just resolved.** Source
   (`packages/schema/src/session-event.ts:41-43,170-177`) shows `session.deleted`'s payload schema is
   flat: `{ sessionID: SessionID }` — no `info` wrapper. This matches `opencode-auto-instruct.js`'s
   own confirmed pattern of reading `event.data.sessionID` directly (its `normalize()` function).
   **Design correction:** the reactive prune handler (D5) must read `event.data.sessionID`, not
   `event.data.properties.info.id` as originally drafted — update the implementation-facing snippet
   in D5 accordingly before writing code.
4. ~~Can a plugin-registered tool name be used as a `permissions.action` value?~~ — **RESOLVED.**
   `packages/schema/src/permission.ts:27` confirms `action: Schema.String` — an open value space.
   Yes, and it is now documented as a supported README feature rather than a limitation.
