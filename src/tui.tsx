import { Plugin } from "@opencode/plugin/tui";
import { TextAttributes } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  Show,
  type Accessor,
} from "solid-js";
import { TodoRpc } from "./rpc.js";
import type { TodoItem, TodoStatus } from "./types.js";

/** Status glyph + colour, matching the conventions already used elsewhere in opencode's
 * own TUI (e.g. the MCP sidebar's coloured `•` dots, the diff-viewer's `✓`/`✗` file-review
 * marks, and the session-tab `●`/`○` dots) rather than inventing a bespoke bracket
 * notation (`[x]`/`[~]`/`[-]`/`[ ]`) that reads as ASCII-art next to the rest of the UI. */
function statusGlyph(status: TodoStatus): string {
  switch (status) {
    case "completed":
      return "✓";
    case "in_progress":
      return "●";
    case "cancelled":
      return "✗";
    case "pending":
      return "○";
  }
}

function statusColor(
  status: TodoStatus,
  theme: Plugin.Context["theme"],
): string {
  switch (status) {
    case "completed":
      return theme.text.feedback.success.base;
    case "in_progress":
      return theme.text.feedback.info.base;
    case "cancelled":
    case "pending":
      return theme.text.muted;
  }
}

/** Below this many todos, the section is always shown expanded with no collapse
 * affordance at all — mirrors `SidebarMcp`'s own threshold exactly (design D2). */
const COLLAPSE_THRESHOLD = 2;

/** Label used for each status in the collapsed-sidebar summary — shorter than the status
 * enum name for `completed` ("done"), and none of the four pluralize with count, so no
 * singular/plural branching is needed (design D3). */
const COLLAPSED_SUMMARY_LABELS: Record<TodoStatus, string> = {
  pending: "pending",
  in_progress: "in progress",
  completed: "done",
  cancelled: "cancelled",
};

/** Formats the collapsed Todos header's inline summary: non-zero status counts only, in the
 * fixed order pending → in_progress → completed → cancelled (design D3). Only ever called
 * while the outer `<Show when={feed.todos().length > 0}>` in `TodoSidebar` has already
 * passed, so `todos` is never empty and at least one count is always non-zero. */
export function formatCollapsedSummary(todos: readonly TodoItem[]): string {
  const counts: Record<TodoStatus, number> = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const todo of todos) {
    counts[todo.status] += 1;
  }
  const order: readonly TodoStatus[] = [
    "pending",
    "in_progress",
    "completed",
    "cancelled",
  ];
  const parts = order
    .filter((status) => counts[status] > 0)
    .map((status) => `${counts[status]} ${COLLAPSED_SUMMARY_LABELS[status]}`);
  return `(${parts.join(", ")})`;
}

/**
 * `TodoRpc`'s schemas are plain JSON Schema (design D9 — portable, no schema-library
 * dependency for this package). `@opencode/schema`'s `Rpc.Output`/`EventData` type
 * utilities only derive concrete TS types from an Effect `Schema` or a Standard Schema
 * (Zod, etc.) — a JSON-Schema-only definition resolves to `unknown` at the type level,
 * even though the runtime shape is exactly what the server handler returns. These two
 * interfaces name that runtime shape explicitly so the narrow assertions below are a
 * documented acknowledgement of the limitation, not a guess about behaviour.
 */
interface TodoListResult {
  readonly revision: number;
  readonly todos: readonly TodoItem[];
}
interface TodoChangedEventData {
  readonly sessionID: string;
  readonly revision: number;
}

/** The minimal slice of `context.client.rpc(TodoRpc)` this module depends on — kept
 * narrow so tests can supply a fake without needing a real RPC client or renderer. */
export interface TodoRpcClient {
  list(input: { sessionID: string }): Promise<unknown>;
  events: {
    on(
      name: "changed",
      handler: (event: { data: unknown }) => void,
    ): () => void;
  };
}

export interface TodoFeed {
  readonly todos: Accessor<readonly TodoItem[]>;
  readonly error: Accessor<string | null>;
}

/** How often the sidebar re-fetches as a safety net, independent of the `changed` event.
 * `client.events.on` is a live-only push channel with no buffering or replay (see spec
 * `todo-tui`'s "Sidebar updates without polling" requirement) — if the underlying event
 * stream silently stops delivering, this bounded reconciliation is what recovers the
 * sidebar instead of leaving it stale indefinitely. */
const SAFETY_NET_INTERVAL_MS = 30_000;

/**
 * Renderer-independent data flow for the sidebar: fetches the focused session's todo
 * list, re-fetches on a `changed` event for that same session, and additionally
 * re-fetches on a bounded interval as a safety net against a missed or silently dropped
 * event (see `SAFETY_NET_INTERVAL_MS`). Never lets an RPC failure escape as a thrown
 * error (design D11) — kept separate from `TodoSidebar` so it is unit-testable without a
 * real `@opentui` renderer (which JSX construction requires; see spec `todo-tui` and
 * tasks.md 6.5 for the live-capture verification that covers rendering itself).
 */
export function createTodoFeed(
  client: TodoRpcClient,
  sessionID: Accessor<string>,
): TodoFeed {
  const [todos, setTodos] = createSignal<readonly TodoItem[]>([]);
  const [error, setError] = createSignal<string | null>(null);

  const refresh = async (id: string): Promise<void> => {
    try {
      const result = (await client.list({ sessionID: id })) as TodoListResult;
      setTodos(result.todos);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  createEffect(() => {
    const id = sessionID();
    void refresh(id);
    const dispose = client.events.on("changed", (event) => {
      const data = event.data as TodoChangedEventData;
      if (data.sessionID === id) {
        void refresh(id);
      }
    });
    onCleanup(dispose);

    const intervalId = setInterval(() => void refresh(id), SAFETY_NET_INTERVAL_MS);
    onCleanup(() => clearInterval(intervalId));
  });

  return { todos, error };
}

interface TodoSidebarProps {
  readonly context: Plugin.Context;
  readonly sessionID: string;
}

/** Read-only sidebar contribution — spec `todo-tui`. Sources data exclusively through
 * `context.client.rpc(TodoRpc)`; never imports `src/store.ts` or opens the SQLite file
 * (task 6.4 — verified by this file's import list containing no such import). */
export function TodoSidebar(props: TodoSidebarProps): JSX.Element {
  const client = props.context.client.rpc(TodoRpc);
  const feed = createTodoFeed(client, () => props.sessionID);
  const theme = props.context.theme;
  const [view, updateView] = props.context.storage.store("view", {
    initial: { open: true },
  });

  const toggle = (): void => {
    if (feed.todos().length <= COLLAPSE_THRESHOLD) return;
    void updateView((draft) => {
      draft.open = !draft.open;
    }).catch((error: unknown) =>
      console.error("Failed to persist Todos sidebar state", error),
    );
  };

  return (
    <Show
      when={feed.error() === null}
      fallback={
        <text
          fg={theme.text.feedback.error.base}
        >{`todo: ${feed.error()}`}</text>
      }
    >
      <Show when={feed.todos().length > 0}>
        <box>
          <box flexDirection="row" gap={1} onMouseDown={toggle}>
            <Show when={feed.todos().length > COLLAPSE_THRESHOLD}>
              <text fg={theme.text.base}>{view.open ? "▼" : "▶"}</text>
            </Show>
            <text fg={theme.text.base}>
              <b>Todos</b>
              <Show when={!view.open}>
                <span style={{ fg: theme.text.muted }}>
                  {" "}
                  {formatCollapsedSummary(feed.todos())}
                </span>
              </Show>
            </text>
          </box>
          <Show when={feed.todos().length <= COLLAPSE_THRESHOLD || view.open}>
            <For each={feed.todos()}>
              {(todo) => {
                const isCancelled = todo.status === "cancelled";
                return (
                  <box flexDirection="row" gap={1} minWidth={0}>
                    <text flexShrink={0} fg={statusColor(todo.status, theme)}>
                      {statusGlyph(todo.status)}
                    </text>
                    <text
                      fg={isCancelled ? theme.text.muted : theme.text.base}
                      attributes={
                        isCancelled
                          ? TextAttributes.STRIKETHROUGH
                          : TextAttributes.NONE
                      }
                      wrapMode="word"
                      truncate
                      maxHeight={2}
                      flexGrow={1}
                      flexShrink={1}
                      minWidth={0}
                    >
                      {todo.content}
                    </text>
                  </box>
                );
              }}
            </For>
          </Show>
        </box>
      </Show>
    </Show>
  );
}

export default Plugin.define({
  id: "opencode-todo-tui",
  setup(context) {
    return context.ui.slot({
      append: "sidebar.content",
      render: (input) => (
        <TodoSidebar context={context} sessionID={input.sessionID} />
      ),
    });
  },
});
