import { afterEach, describe, expect, jest, test } from "bun:test";
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

/** `jest.useFakeTimers()` replaces the global `setTimeout` too, so `flush()`'s own
 * macrotask would never fire while fake timers are active. Promise microtasks are
 * unaffected by fake timers, so draining a couple of microtask turns is enough to let
 * `refresh()`'s internal `await client.list(...)` settle after a fake-timer advance. */
const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

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
    disposeRoot();
  });

  // spec: todo-tui "RPC failure shows inline error, not a crash"
  test("an RPC rejection is logged and never thrown", async () => {
    let disposeRoot = (): void => {};
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    const client: TodoRpcClient = {
      list: () => Promise.reject(new Error("rpc unavailable")),
      events: { on: () => () => {} },
    };
    expect(() => {
      createRoot((dispose) => {
        disposeRoot = dispose;
        createTodoFeed(client, () => "s1");
      });
    }).not.toThrow();
    await flush();
    expect(logged).toHaveBeenCalledTimes(1);
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

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // spec: todo-tui "Safety-net reconciliation recovers from a missed change notification"
  test("safety-net interval re-fetches even without a changed event", async () => {
    let disposeRoot = (): void => {};
    const { client, listCalls } = fakeClient();
    jest.useFakeTimers();
    createRoot((dispose) => {
      disposeRoot = dispose;
      createTodoFeed(client, () => "s1");
    });
    await flushMicrotasks();
    expect(listCalls.length).toBe(1);

    jest.advanceTimersByTime(30_000);
    await flushMicrotasks();
    expect(listCalls.length).toBe(2);

    disposeRoot();
  });

  // spec: todo-tui "Safety-net reconciliation recovers from a missed change notification"
  test("safety-net interval is cleared on session change and on dispose", async () => {
    let disposeRoot = (): void => {};
    const { client, listCalls } = fakeClient();
    const [sessionID, setSessionID] = createSignal("s1");
    jest.useFakeTimers();
    createRoot((dispose) => {
      disposeRoot = dispose;
      createTodoFeed(client, sessionID);
    });
    await flushMicrotasks();
    expect(listCalls).toEqual(["s1"]);

    // Switching sessions must tear down the old interval, not accumulate a second one.
    setSessionID("s2");
    await flushMicrotasks();
    expect(listCalls).toEqual(["s1", "s2"]);

    disposeRoot();

    // No interval should still be running after dispose.
    jest.advanceTimersByTime(60_000);
    await flushMicrotasks();
    expect(listCalls).toEqual(["s1", "s2"]);
  });
});

/** A client whose `list` fails while `outage.down` is true and otherwise returns `items`. */
function flakyClient(items: readonly TodoItem[] = []): {
  client: TodoRpcClient;
  outage: { down: boolean };
  listCalls: string[];
  emit: ChangedHandler;
} {
  const outage = { down: true };
  const listCalls: string[] = [];
  let handler: ChangedHandler = () => {};
  const client: TodoRpcClient = {
    list: async (input) => {
      listCalls.push(input.sessionID);
      if (outage.down) throw new Error("Transport: Unable to connect");
      return { revision: listCalls.length, todos: items };
    },
    events: {
      on: (_name, h) => {
        handler = h;
        return () => {};
      },
    },
  };
  return { client, outage, listCalls, emit: (event) => handler(event) };
}

describe("createTodoFeed outage recovery", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // spec: todo-tui "RPC failure shows inline error, not a crash" (superseded: now retries quickly)
  test("retries after a failure with doubling delays capped at 5s", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { client, listCalls } = flakyClient();
    jest.useFakeTimers();
    let disposeRoot = (): void => {};
    createRoot((dispose) => {
      disposeRoot = dispose;
      createTodoFeed(client, () => "s1");
    });
    await flushMicrotasks();
    expect(listCalls.length).toBe(1);

    for (const [delay, expectedCalls] of [
      [500, 2],
      [1_000, 3],
      [2_000, 4],
      [4_000, 5],
      [5_000, 6],
      [5_000, 7],
    ] as const) {
      jest.advanceTimersByTime(delay - 1);
      await flushMicrotasks();
      expect(listCalls.length).toBe(expectedCalls - 1);
      jest.advanceTimersByTime(1);
      await flushMicrotasks();
      expect(listCalls.length).toBe(expectedCalls);
    }
    disposeRoot();
  });

  // spec: todo-tui "RPC failure shows inline error, not a crash" (superseded)
  test("logs only the first failure of an outage, then the recovery", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    const { client, outage } = flakyClient([sampleTodo()]);
    jest.useFakeTimers();
    let disposeRoot = (): void => {};
    createRoot((dispose) => {
      disposeRoot = dispose;
      createTodoFeed(client, () => "s1");
    });
    await flushMicrotasks();
    jest.advanceTimersByTime(500);
    await flushMicrotasks();
    jest.advanceTimersByTime(1_000);
    await flushMicrotasks();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(info).not.toHaveBeenCalled();

    outage.down = false;
    jest.advanceTimersByTime(2_000);
    await flushMicrotasks();
    expect(info).toHaveBeenCalledTimes(1);
    disposeRoot();
  });

  // spec: todo-tui "RPC failure shows inline error, not a crash" (superseded)
  test("a successful retry restores todos and stops the fast retries", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
    const items = [sampleTodo()];
    const { client, outage, listCalls } = flakyClient(items);
    jest.useFakeTimers();
    let feed!: ReturnType<typeof createTodoFeed>;
    let disposeRoot = (): void => {};
    createRoot((dispose) => {
      disposeRoot = dispose;
      feed = createTodoFeed(client, () => "s1");
    });
    await flushMicrotasks();
    expect(feed.todos()).toEqual([]);

    outage.down = false;
    jest.advanceTimersByTime(500);
    await flushMicrotasks();
    expect(feed.todos()).toEqual(items);
    expect(listCalls.length).toBe(2);

    // Well inside the 30s safety net, no further fetch may fire.
    jest.advanceTimersByTime(20_000);
    await flushMicrotasks();
    expect(listCalls.length).toBe(2);
    disposeRoot();
  });

  // spec: todo-tui "RPC failure shows inline error, not a crash" (superseded)
  test("todos are cleared while disconnected", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const items = [sampleTodo()];
    const { client, outage, emit } = flakyClient(items);
    outage.down = false;
    jest.useFakeTimers();
    let feed!: ReturnType<typeof createTodoFeed>;
    let disposeRoot = (): void => {};
    createRoot((dispose) => {
      disposeRoot = dispose;
      feed = createTodoFeed(client, () => "s1");
    });
    await flushMicrotasks();
    expect(feed.todos()).toEqual(items);

    outage.down = true;
    emit({ data: { sessionID: "s1", revision: 2 } });
    await flushMicrotasks();
    expect(feed.todos()).toEqual([]);
    disposeRoot();
  });

  // spec: todo-tui "RPC failure shows inline error, not a crash" (superseded)
  test("a late response from a previous session is ignored", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const s2Items = [sampleTodo({ id: "2", content: "session two" })];
    const pending: Record<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }[]> = {};
    const client: TodoRpcClient = {
      list: ({ sessionID }) =>
        sessionID === "s2"
          ? Promise.resolve({ revision: 1, todos: s2Items })
          : new Promise((resolve, reject) => {
              (pending[sessionID] ??= []).push({ resolve, reject });
            }),
      events: { on: () => () => {} },
    };
    const [sessionID, setSessionID] = createSignal("s1");
    let feed!: ReturnType<typeof createTodoFeed>;
    let disposeRoot = (): void => {};
    createRoot((dispose) => {
      disposeRoot = dispose;
      feed = createTodoFeed(client, sessionID);
    });
    setSessionID("s2");
    await flush();
    expect(feed.todos()).toEqual(s2Items);

    pending["s1"]?.[0]?.resolve({ revision: 9, todos: [sampleTodo()] });
    await flush();
    expect(feed.todos()).toEqual(s2Items);
    disposeRoot();
  });

  // spec: todo-tui "RPC failure shows inline error, not a crash" (superseded)
  test("retries stop on dispose and on session change", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { client, listCalls } = flakyClient();
    const [sessionID, setSessionID] = createSignal("s1");
    jest.useFakeTimers();
    let disposeRoot = (): void => {};
    createRoot((dispose) => {
      disposeRoot = dispose;
      createTodoFeed(client, sessionID);
    });
    await flushMicrotasks();
    expect(listCalls).toEqual(["s1"]);

    setSessionID("s2");
    await flushMicrotasks();
    expect(listCalls).toEqual(["s1", "s2"]);

    // Only the s2 retry loop may be alive: the first retry fires once, for s2.
    jest.advanceTimersByTime(500);
    await flushMicrotasks();
    expect(listCalls).toEqual(["s1", "s2", "s2"]);

    disposeRoot();
    jest.advanceTimersByTime(60_000);
    await flushMicrotasks();
    expect(listCalls).toEqual(["s1", "s2", "s2"]);
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
