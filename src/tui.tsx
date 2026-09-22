import { Plugin } from "@opencode/plugin/tui";
import type { JSX } from "@opentui/solid";
import { createEffect, createSignal, For, onCleanup, Show, type Accessor } from "solid-js";
import { TodoRpc } from "./rpc.js";
import type { TodoItem, TodoStatus } from "./types.js";

function statusMark(status: TodoStatus): string {
  switch (status) {
    case "completed":
      return "[x]";
    case "in_progress":
      return "[~]";
    case "cancelled":
      return "[-]";
    case "pending":
      return "[ ]";
  }
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
    on(name: "changed", handler: (event: { data: unknown }) => void): () => void;
  };
}

export interface TodoFeed {
  readonly todos: Accessor<readonly TodoItem[]>;
  readonly error: Accessor<string | null>;
}

/**
 * Renderer-independent data flow for the sidebar: fetches the focused session's todo
 * list, re-fetches only on a `changed` event for that same session, and never lets an
 * RPC failure escape as a thrown error (design D11) — kept separate from `TodoSidebar`
 * so it is unit-testable without a real `@opentui` renderer (which JSX construction
 * requires; see spec `todo-tui` and tasks.md 6.5 for the live-capture verification
 * that covers rendering itself).
 */
export function createTodoFeed(client: TodoRpcClient, sessionID: Accessor<string>): TodoFeed {
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

  return (
    <Show when={feed.error() === null} fallback={<text>{`todo: ${feed.error()}`}</text>}>
      <Show when={feed.todos().length > 0}>
        <box title="Todos">
          <For each={feed.todos()}>
            {(todo) => <text>{`${statusMark(todo.status)} ${todo.content}`}</text>}
          </For>
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
      render: (input) => <TodoSidebar context={context} sessionID={input.sessionID} />,
    });
  },
});
