import { describe, expect, test } from "bun:test";
import { createRoot, createSignal } from "solid-js";
import {
  createTodoFeed,
  formatCollapsedSummary,
  type TodoRpcClient,
} from "./tui.js";
import type { TodoItem } from "./types.js";

type ChangedHandler = (event: { data: unknown }) => void;

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

function fakeClient(): {
  client: TodoRpcClient;
  listCalls: string[];
  emit: ChangedHandler;
} {
  const listCalls: string[] = [];
  let handler: ChangedHandler = () => {};
  const client: TodoRpcClient = {
    list: async (input) => {
      listCalls.push(input.sessionID);
      return { revision: listCalls.length, todos: [] };
    },
    events: {
      on: (_name, h) => {
        handler = h;
        return () => {};
      },
    },
  };
  return { client, listCalls, emit: (event) => handler(event) };
}

function sampleTodo(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: "1",
    content: "write the tests",
    status: "pending",
    priority: null,
    position: 0,
    createdAt: 0,
    updatedAt: 0,
    completedAt: null,
    ...overrides,
  };
}

describe("createTodoFeed", () => {
  // spec: todo-tui "Sidebar shows the focused session's items"
  test("fetches the focused session's list on first run", async () => {
    let disposeRoot = (): void => {};
    const { client, listCalls } = fakeClient();
    createRoot((dispose) => {
      disposeRoot = dispose;
      createTodoFeed(client, () => "s1");
    });
    await flush();
    expect(listCalls).toEqual(["s1"]);
    disposeRoot();
  });

  // spec: todo-tui "List updates on a change notification"
  test("re-fetches only on a changed event for the same session", async () => {
    let disposeRoot = (): void => {};
    const { client, listCalls, emit } = fakeClient();
    createRoot((dispose) => {
      disposeRoot = dispose;
      createTodoFeed(client, () => "s1");
    });
    await flush();
    expect(listCalls.length).toBe(1);

    emit({ data: { sessionID: "other-session", revision: 2 } });
    await flush();
    expect(listCalls.length).toBe(1);

    emit({ data: { sessionID: "s1", revision: 3 } });
    await flush();
    expect(listCalls.length).toBe(2);

    disposeRoot();
  });

  // spec: todo-tui "Sidebar shows the focused session's items"
  test("populates todos() from a successful list call", async () => {
    let disposeRoot = (): void => {};
    const items = [sampleTodo()];
    const client: TodoRpcClient = {
      list: async () => ({ revision: 1, todos: items }),
      events: { on: () => () => {} },
    };
    let feed!: ReturnType<typeof createTodoFeed>;
    createRoot((dispose) => {
      disposeRoot = dispose;
      feed = createTodoFeed(client, () => "s1");
    });
    await flush();
    expect(feed.todos()).toEqual(items);
    expect(feed.error()).toBeNull();
    disposeRoot();
  });

  // spec: todo-tui "RPC failure shows inline error, not a crash"
  test("an RPC rejection is captured in error() and never thrown", async () => {
    let disposeRoot = (): void => {};
    const client: TodoRpcClient = {
      list: () => Promise.reject(new Error("rpc unavailable")),
      events: { on: () => () => {} },
    };
    let feed!: ReturnType<typeof createTodoFeed>;
    expect(() => {
      createRoot((dispose) => {
        disposeRoot = dispose;
        feed = createTodoFeed(client, () => "s1");
      });
    }).not.toThrow();
    await flush();
    expect(feed.error()).toBe("rpc unavailable");
    expect(feed.todos()).toEqual([]);
    disposeRoot();
  });

  // spec: todo-tui "List updates on a change notification"
  test("re-fetching when sessionID changes tracks the new session", async () => {
    let disposeRoot = (): void => {};
    const { client, listCalls } = fakeClient();
    const [sessionID, setSessionID] = createSignal("s1");
    createRoot((dispose) => {
      disposeRoot = dispose;
      createTodoFeed(client, sessionID);
    });
    await flush();
    expect(listCalls).toEqual(["s1"]);

    setSessionID("s2");
    await flush();
    expect(listCalls).toEqual(["s1", "s2"]);

    disposeRoot();
  });
});

describe("formatCollapsedSummary", () => {
  // spec: todo-tui "Collapsed section shows an ordered, non-zero status-count summary"
  test("a single non-zero status renders just that count", () => {
    const todos = [sampleTodo({ status: "pending" })];
    expect(formatCollapsedSummary(todos)).toBe("(1 pending)");
  });

  // spec: todo-tui "Collapsed section shows an ordered, non-zero status-count summary"
  test("multiple non-zero statuses render in fixed order pending, in progress, completed, cancelled", () => {
    const todos = [
      sampleTodo({ id: "1", status: "cancelled" }),
      sampleTodo({ id: "2", status: "completed" }),
      sampleTodo({ id: "3", status: "pending" }),
      sampleTodo({ id: "4", status: "in_progress" }),
    ];
    expect(formatCollapsedSummary(todos)).toBe(
      "(1 pending, 1 in progress, 1 done, 1 cancelled)",
    );
  });

  // spec: todo-tui "Collapsed section shows an ordered, non-zero status-count summary"
  test("all four statuses present with mixed counts", () => {
    const todos = [
      sampleTodo({ id: "1", status: "pending" }),
      sampleTodo({ id: "2", status: "pending" }),
      sampleTodo({ id: "3", status: "in_progress" }),
      sampleTodo({ id: "4", status: "completed" }),
      sampleTodo({ id: "5", status: "completed" }),
      sampleTodo({ id: "6", status: "completed" }),
      sampleTodo({ id: "7", status: "cancelled" }),
    ];
    expect(formatCollapsedSummary(todos)).toBe(
      "(2 pending, 1 in progress, 3 done, 1 cancelled)",
    );
  });

  // spec: todo-tui "Collapsed section shows an ordered, non-zero status-count summary"
  test("a zero-count status is omitted entirely, and completed renders as done", () => {
    const todos = [
      sampleTodo({ id: "1", status: "completed" }),
      sampleTodo({ id: "2", status: "completed" }),
    ];
    expect(formatCollapsedSummary(todos)).toBe("(2 done)");
  });
});
