import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "./store";
import { createTodoReadTool, createTodoWriteTool } from "./tools";

let dir: string;
let store: Store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "opencode-todo-tools-"));
  store = new Store({ dbPath: join(dir, "todos.db") });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("todowrite tool", () => {
  // spec: todo-tools "todowrite tool is directly callable by the model"
  it("is registered with codemode:false", () => {
    const tool = createTodoWriteTool(store);
    expect(tool.name).toBe("todowrite");
    expect(tool.options.codemode).toBe(false);
  });

  it("applies the submitted items to the store", async () => {
    const tool = createTodoWriteTool(store);
    await tool.execute({ todos: [{ content: "a", status: "pending" }] }, { sessionID: "s1" });
    expect(store.read("s1")).toHaveLength(1);
  });

  it("returns a human-readable content summary", async () => {
    const tool = createTodoWriteTool(store);
    const result = await tool.execute(
      { todos: [{ content: "a", status: "completed" }] },
      { sessionID: "s1" },
    );
    expect(result.content).toContain("a");
    expect(() => JSON.parse(result.content)).toThrow();
  });

  // spec: todo-tools "todowrite rejects an invalid status value"
  it("rejects an item with an invalid status and modifies no rows", async () => {
    const tool = createTodoWriteTool(store);
    await expect(
      tool.execute(
        { todos: [{ content: "a", status: "bogus" as never }] },
        { sessionID: "s1" },
      ),
    ).rejects.toThrow(/status/i);
    expect(store.read("s1")).toHaveLength(0);
  });

  // spec: todo-tools "Tool results carry a structured metadata contract"
  it("returns metadata with source, schemaVersion, sessionID, revision, todos, counts", async () => {
    const tool = createTodoWriteTool(store);
    const result = await tool.execute(
      { todos: [{ content: "a", status: "pending" }] },
      { sessionID: "s1" },
    );
    expect(result.metadata.source).toBe("opencode-todo");
    expect(typeof result.metadata.schemaVersion).toBe("number");
    expect(result.metadata.sessionID).toBe("s1");
    expect(result.metadata.revision).toBeGreaterThan(0);
    expect(result.metadata.todos).toHaveLength(1);
    expect(result.metadata.counts.pending).toBe(1);
  });

  // spec: todo-tools "Tool failures are surfaced to the model"
  it("logs and rethrows a store failure", async () => {
    const failingStore = {
      write: () => {
        throw new Error("boom");
      },
    } as unknown as Store;
    const logs: unknown[] = [];
    const tool = createTodoWriteTool(failingStore, (msg, err) => logs.push([msg, err]));

    await expect(
      tool.execute({ todos: [{ content: "a", status: "pending" }] }, { sessionID: "s1" }),
    ).rejects.toThrow("boom");
    expect(logs).toHaveLength(1);
  });
});

describe("todoread tool", () => {
  // spec: todo-tools "todoread tool is directly callable by the model"
  it("is registered with codemode:false", () => {
    const tool = createTodoReadTool(store);
    expect(tool.name).toBe("todoread");
    expect(tool.options.codemode).toBe(false);
  });

  it("returns the session's current non-archived todos", async () => {
    store.write("s1", [{ content: "a", status: "pending" }]);
    const tool = createTodoReadTool(store);
    const result = await tool.execute({}, { sessionID: "s1" });
    expect(result.metadata.todos).toHaveLength(1);
    expect(result.metadata.todos[0]!.content).toBe("a");
  });

  // spec: todo-tools "Tool results carry a structured metadata contract"
  it("returns the same metadata shape as todowrite", async () => {
    store.write("s1", [{ content: "a", status: "completed" }]);
    const tool = createTodoReadTool(store);
    const result = await tool.execute({}, { sessionID: "s1" });
    expect(result.metadata.source).toBe("opencode-todo");
    expect(result.metadata.sessionID).toBe("s1");
    expect(result.metadata.counts.completed).toBe(1);
  });

  // spec: todo-tools "Tool failures are surfaced to the model"
  it("logs and rethrows a store failure", async () => {
    const failingStore = {
      read: () => {
        throw new Error("boom");
      },
      revision: () => 0,
    } as unknown as Store;
    const logs: unknown[] = [];
    const tool = createTodoReadTool(failingStore, (msg, err) => logs.push([msg, err]));

    await expect(tool.execute({}, { sessionID: "s1" })).rejects.toThrow("boom");
    expect(logs).toHaveLength(1);
  });
});
