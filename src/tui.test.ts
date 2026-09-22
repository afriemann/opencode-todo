import { describe, expect, test } from "bun:test";
import { createRoot, createSignal } from "solid-js";
import { createTodoFeed, type TodoRpcClient } from "./tui.js";
import type { TodoItem } from "./types.js";

type ChangedHandler = (event: { data: unknown }) => void;

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

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
