import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import plugin from "./index";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "opencode-todo-index-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface FakeTool {
  name: string;
  options?: { codemode?: boolean };
  execute: (input: unknown, context: { sessionID: string }) => Promise<unknown>;
}

function createFakeCtx(dbPath: string) {
  const tools: FakeTool[] = [];
  let rpcHandlers: Record<string, (input: unknown) => Promise<unknown>> | undefined;
  const emittedEvents: Array<{ name: string; data: unknown }> = [];
  let sessionDeletedListener: ((event: { type: string; data: { sessionID: string } }) => void) | undefined;

  const ctx = {
    options: { dbPath },
    tool: {
      transform: async (fn: (editor: { add: (tool: FakeTool) => void }) => void) => {
        fn({ add: (tool) => tools.push(tool) });
        return { dispose: async () => {} };
      },
    },
    rpc: {
      register: async (
        _definition: unknown,
        handlers: Record<string, (input: unknown) => Promise<unknown>>,
      ) => {
        rpcHandlers = handlers;
        return {
          events: {
            emit: async (name: string, data: unknown) => {
              emittedEvents.push({ name, data });
            },
          },
          dispose: async () => {},
        };
      },
    },
    event: {
      subscribe: (_opts: { signal: AbortSignal }) => ({
        [Symbol.asyncIterator]: () => ({
          next: () =>
            new Promise((resolve) => {
              sessionDeletedListener = (event) => resolve({ value: event, done: false });
              _opts.signal.addEventListener("abort", () => resolve({ value: undefined, done: true }));
            }),
        }),
      }),
    },
  };

  return {
    ctx,
    tools,
    emittedEvents,
    getRpcHandlers: () => rpcHandlers,
    triggerSessionDeleted: (sessionID: string) =>
      sessionDeletedListener?.({ type: "session.deleted", data: { sessionID } }),
  };
}

describe("plugin setup wiring", () => {
  // spec: todo-tools "todowrite tool is directly callable by the model" / "todoread ..."
  it("registers todowrite and todoread with codemode:false", async () => {
    const { ctx, tools } = createFakeCtx(join(dir, "todos.db"));
    const cleanup = await plugin.setup(ctx as never);

    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["todoread", "todowrite"]);
    for (const tool of tools) expect(tool.options?.codemode).toBe(false);

    await (cleanup as () => Promise<void>)?.();
  });

  // spec: todo-tools "Tool results carry a structured metadata contract" (wiring-level)
  it("emits an RPC changed event after a successful todowrite", async () => {
    const { ctx, tools, emittedEvents } = createFakeCtx(join(dir, "todos.db"));
    const cleanup = await plugin.setup(ctx as never);

    const todowrite = tools.find((t) => t.name === "todowrite")!;
    await todowrite.execute({ todos: [{ content: "a", status: "pending" }] }, { sessionID: "s1" });

    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]?.name).toBe("changed");
    expect((emittedEvents[0]?.data as { sessionID: string }).sessionID).toBe("s1");

    await (cleanup as () => Promise<void>)?.();
  });

  // spec: todo-housekeeping "Deleted sessions' todos are archived reactively" (wiring-level)
  it("archives a session's todos when a session.deleted event arrives", async () => {
    const { ctx, tools, triggerSessionDeleted } = createFakeCtx(join(dir, "todos.db"));
    const cleanup = await plugin.setup(ctx as never);

    const todowrite = tools.find((t) => t.name === "todowrite")!;
    const todoread = tools.find((t) => t.name === "todoread")!;
    await todowrite.execute({ todos: [{ content: "a", status: "pending" }] }, { sessionID: "s1" });

    triggerSessionDeleted("s1");
    // Allow the reactive loop's microtask to run.
    await new Promise((resolve) => setTimeout(resolve, 10));

    const result = (await todoread.execute({}, { sessionID: "s1" })) as {
      metadata: { todos: unknown[] };
    };
    expect(result.metadata.todos).toHaveLength(0);

    await (cleanup as () => Promise<void>)?.();
  });

  // spec: todo-tools "Tool failures are surfaced to the model" — store-open failure path (D11)
  it("registers failing tools when the store cannot be opened, without throwing out of setup", async () => {
    const { ctx, tools } = createFakeCtx(join(dir, "nested", "unwritable", "todos.db"));
    // Force a store-open failure by pointing at a path that collides with a file, not a directory.
    const fs = await import("node:fs");
    fs.writeFileSync(join(dir, "nested"), "not a directory");

    const cleanup = await plugin.setup(ctx as never);
    const todowrite = tools.find((t) => t.name === "todowrite")!;

    await expect(todowrite.execute({ todos: [] }, { sessionID: "s1" })).rejects.toThrow();
    await (cleanup as () => Promise<void>)?.();
  });

  it("logs a warning and falls back to the default when busyTimeoutMs has the wrong type", async () => {
    const { ctx } = createFakeCtx(join(dir, "todos.db"));
    (ctx.options as Record<string, unknown>).busyTimeoutMs = "5000";

    const written: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    let cleanup: (() => Promise<void>) | undefined;
    try {
      cleanup = (await plugin.setup(ctx as never)) as () => Promise<void>;
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(written.some((line) => line.includes("invalid busyTimeoutMs"))).toBe(true);
    await cleanup?.();
  });
});
