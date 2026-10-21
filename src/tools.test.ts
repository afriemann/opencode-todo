import { describe, expect, it, beforeEach, afterEach, jest } from "bun:test";
import { Store } from "./store";
import type { TodoInput } from "./types";
import { createTodoReadTool, createTodoWriteTool } from "./tools";

let store: Store;

beforeEach(() => {
  store = new Store({ dbPath: ":memory:" });
});

afterEach(() => {
  store.close();
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
    await tool.execute(
      { todos: [{ content: "a", status: "pending" }] },
      { sessionID: "s1" },
    );
    expect(store.read("s1")).toHaveLength(1);
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

  // spec: todo-tools "todowrite defaults an omitted status to pending"
  it("defaults status to pending when omitted", async () => {
    const tool = createTodoWriteTool(store);
    await tool.execute(
      { todos: [{ content: "a" } as never] },
      { sessionID: "s1" },
    );
    const todos = store.read("s1");
    expect(todos).toHaveLength(1);
    expect(todos[0]?.status).toBe("pending");
  });

  // spec: openspec/specs/todo-tools/spec.md
  it("todowrite result includes metadata", async () => {
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
    expect(result.metadata.listCreated).toBe(true);
  });

  // spec: openspec/specs/todo-tools/spec.md
  it("Archived-ID error preserves the list and supports ordinary recovery", async () => {
    const write = createTodoWriteTool(store, () => {});
    const read = createTodoReadTool(store);
    for (const recovery of ["current-id", "omit-id"]) {
      const context = { sessionID: recovery };
      store.write(
        recovery,
        [{ id: "stale", content: "old", status: "completed" }],
        100,
      );
      const current = store.write(
        recovery,
        [
          { content: "keep", status: "in_progress" },
          { content: "done", status: "completed" },
        ],
        200,
        true,
      );
      await expect(
        write.execute(
          { todos: [{ id: "stale", content: "keep", status: "completed" }] },
          context,
        ),
      ).rejects.toThrow(/archived.*stale.*current.*omit/i);
      const preserved = await read.execute({}, context);
      expect(preserved.metadata.todos).toEqual(current.todos);
      expect(preserved.metadata.revision).toBe(current.revision);
      const corrected = await write.execute(
        {
          todos: preserved.metadata.todos.map((todo) => ({
            ...(recovery === "current-id" ? { id: todo.id } : {}),
            content: todo.content,
            status: "completed",
          })),
        },
        context,
      );
      expect(corrected.metadata.listCreated).toBe(false);
      expect(corrected.metadata.revision).toBe(current.revision + 1);
      expect(corrected.metadata.todos.map((todo) => todo.id)).toEqual(
        current.todos.map((todo) => todo.id),
      );
      expect(corrected.metadata.counts.completed).toBe(2);
    }
  });

  // spec: todo-tools "Tool failures are surfaced to the model"
  it("logs and rethrows a store failure", async () => {
    const failingStore = {
      write: () => {
        throw new Error("boom");
      },
    } as unknown as Store;
    const logs: unknown[] = [];
    const tool = createTodoWriteTool(failingStore, (msg, err) =>
      logs.push([msg, err]),
    );

    await expect(
      tool.execute(
        { todos: [{ content: "a", status: "pending" }] },
        { sessionID: "s1" },
      ),
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

  // spec: openspec/specs/todo-tools/spec.md
  it("todoread result includes metadata", async () => {
    const written = await createTodoWriteTool(store).execute(
      { todos: [{ content: "a", status: "completed" }] },
      { sessionID: "s1" },
    );
    const tool = createTodoReadTool(store);
    const result = await tool.execute({}, { sessionID: "s1" });
    expect(result.metadata.source).toBe("opencode-todo");
    expect(result.metadata.sessionID).toBe("s1");
    expect(result.metadata.counts.completed).toBe(1);
    expect(Object.keys(result.metadata).sort()).toEqual(
      Object.keys(written.metadata).sort(),
    );
    expect(result.metadata).toEqual({
      ...written.metadata,
      listCreated: false,
    });
    expect(store.read("s1")).toEqual(written.metadata.todos);
    expect(store.revision("s1")).toBe(written.metadata.revision);
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
    const tool = createTodoReadTool(failingStore, (msg, err) =>
      logs.push([msg, err]),
    );

    await expect(tool.execute({}, { sessionID: "s1" })).rejects.toThrow("boom");
    expect(logs).toHaveLength(1);
  });
});

// spec: openspec/specs/todo-tools/spec.md
describe("visible JSON output", () => {
  it("Both tools expose current todos as writable JSON", async () => {
    const context = { sessionID: "s1" };
    store.write("s1", [{ content: "archived", status: "pending" }], 100);
    const expected = [
      { id: "third", content: "no priority", status: "pending" },
      {
        id: "first",
        content: "empty priority",
        status: "in_progress",
        priority: "",
      },
      {
        id: "second",
        content: "priority",
        status: "completed",
        priority: "high",
      },
    ];
    const written = await createTodoWriteTool(store).execute(
      { todos: expected },
      context,
    );
    const read = await createTodoReadTool(store).execute({}, context);
    for (const result of [written, read]) {
      expect(result.content).toBe(JSON.stringify(expected));
      expect(JSON.parse(result.content)).toEqual(expected);
      expect(result.metadata.todos).toEqual(store.read("s1"));
      expect(result.metadata.todos[0]).toMatchObject({
        priority: null,
        position: 0,
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
        completedAt: null,
      });
    }
  });

  it("Empty lists return an empty JSON array", async () => {
    const context = { sessionID: "s1" };
    const write = createTodoWriteTool(store);
    const read = createTodoReadTool(store);
    expect((await read.execute({}, context)).content).toBe("[]");
    await write.execute({ todos: [{ content: "archive me" }] }, context);
    expect((await write.execute({ todos: [] }, context)).content).toBe("[]");
    expect((await read.execute({}, context)).content).toBe("[]");
  });

  it("Escaped IDs and content survive JSON output", async () => {
    const context = { sessionID: "s1" };
    const expected = [
      {
        id: ' spaced "id"\\\n雪 ',
        content: ' text "quoted"\\\n☃ ',
        status: "pending",
      },
    ];
    const written = await createTodoWriteTool(store).execute(
      { todos: expected },
      context,
    );
    const read = await createTodoReadTool(store).execute({}, context);
    for (const result of [written, read]) {
      expect(result.content).toBe(JSON.stringify(expected));
      expect(JSON.parse(result.content)).toEqual(expected);
    }
  });

  it("Visible read and write output supports renamed updates", async () => {
    const clock = jest.spyOn(Date, "now").mockReturnValue(100);
    try {
      for (const source of ["write", "read"]) {
        const context = { sessionID: source };
        const write = createTodoWriteTool(store);
        const read = createTodoReadTool(store);
        clock.mockReturnValue(100);
        const initial = await write.execute(
          {
            todos: [
              { content: "unfinished", status: "in_progress" },
              { content: "already complete", status: "completed" },
            ],
          },
          context,
        );
        const visible =
          source === "write" ? initial : await read.execute({}, context);
        expect(() => JSON.parse(visible.content)).not.toThrow();
        const todos: TodoInput[] = JSON.parse(visible.content);
        for (const todo of todos) {
          todo.content += " renamed";
          todo.status = "completed";
        }
        clock.mockReturnValue(200);
        const updated = await write.execute({ todos }, context);
        expect(updated.metadata.listCreated).toBe(false);
        expect(
          updated.metadata.todos.map(({ id, createdAt }) => ({
            id,
            createdAt,
          })),
        ).toEqual(
          initial.metadata.todos.map(({ id, createdAt }) => ({
            id,
            createdAt,
          })),
        );
        expect(updated.metadata.todos.map(({ content }) => content)).toEqual([
          "unfinished renamed",
          "already complete renamed",
        ]);
        expect(
          updated.metadata.todos.map(({ completedAt }) => completedAt),
        ).toEqual([200, 100]);
        clock.mockReturnValue(300);
        const unchanged = await write.execute(
          { todos: JSON.parse(updated.content) },
          context,
        );
        expect(unchanged.metadata.listCreated).toBe(false);
        expect(
          unchanged.metadata.todos.map(({ id, createdAt, completedAt }) => ({
            id,
            createdAt,
            completedAt,
          })),
        ).toEqual(
          updated.metadata.todos.map(({ id, createdAt, completedAt }) => ({
            id,
            createdAt,
            completedAt,
          })),
        );
      }
    } finally {
      clock.mockRestore();
    }
  });
});

// spec: openspec/specs/todo-tools/spec.md
describe("list creation metadata", () => {
  const context = { sessionID: "s1" };

  it("Invalid fresh-list flag is rejected before mutation", async () => {
    const tool = createTodoWriteTool(store, () => {});
    const first = store.write(
      "s1",
      [{ content: "keep", status: "pending" }],
      100,
    );
    for (const freshList of [null, "true", 1, {}, []]) {
      await expect(
        tool.execute({ todos: [], freshList }, context),
      ).rejects.toThrow(/freshList/);
      expect(store.read("s1")).toEqual(first.todos);
      expect(store.revision("s1")).toBe(first.revision);
    }
  });

  it("Initial mixed-status list reports creation", async () => {
    const tool = createTodoWriteTool(store);
    for (const freshList of [undefined, false]) {
      const result = await tool.execute(
        {
          todos: [
            { content: "work", status: "in_progress" },
            { content: "next" },
          ],
          ...(freshList === undefined ? {} : { freshList }),
        },
        { sessionID: `initial-${String(freshList)}` },
      );
      expect(result.metadata.listCreated).toBe(true);
    }
  });

  it("Ordinary non-empty updates do not report creation", async () => {
    const tool = createTodoWriteTool(store);
    let result = await tool.execute(
      { todos: [{ content: "a" }, { content: "b" }] },
      context,
    );
    const writes = [
      [{ content: "a", status: "in_progress" }, { content: "b" }],
      [{ content: "a" }, { content: "b" }, { content: "c" }],
      [{ content: "c" }, { content: "a" }, { content: "b" }],
      [{ content: "c" }, { content: "a" }],
      [{ content: "c" }, { content: "a" }],
      [{ content: "replacement", status: "completed" }],
      [{ content: "replacement", status: "cancelled" }],
      [{ content: "new task" }],
    ];
    for (const todos of writes) {
      const revision = result.metadata.revision;
      result = await tool.execute({ todos }, context);
      expect(result.metadata.listCreated).toBe(false);
      expect(result.metadata.revision).toBe(revision + 1);
    }
  });

  it("Explicit fresh list can carry existing items", async () => {
    const first = store.write(
      "s1",
      [{ content: "carry", status: "in_progress" }],
      100,
    );
    const carried = first.todos[0]!;
    const result = await createTodoWriteTool(store).execute(
      {
        todos: [carried, { content: "new" }],
        freshList: true,
      },
      context,
    );
    expect(result.metadata.listCreated).toBe(true);
    expect(result.metadata.todos[0]).toMatchObject({
      id: carried.id,
      createdAt: carried.createdAt,
      completedAt: carried.completedAt,
    });
  });

  it("Repeated explicit fresh writes report creation", async () => {
    const tool = createTodoWriteTool(store);
    const first = await tool.execute({ todos: [{ content: "a" }] }, context);
    for (let i = 0; i < 2; i++) {
      const result = await tool.execute(
        { todos: first.metadata.todos, freshList: true },
        context,
      );
      expect(result.metadata.listCreated).toBe(true);
      expect(result.metadata.revision).toBe(first.metadata.revision + i + 1);
    }
  });

  it("Empty writes do not report creation", async () => {
    const tool = createTodoWriteTool(store);
    for (const freshList of [undefined, false, true]) {
      const sessionID = `empty-${String(freshList)}`;
      const first = store.write(
        sessionID,
        [{ content: "archive", status: "pending" }],
        100,
      );
      const result = await tool.execute(
        {
          todos: [],
          ...(freshList === undefined ? {} : { freshList }),
        },
        { sessionID },
      );
      expect(result.metadata.listCreated).toBe(false);
      expect(result.metadata.todos).toEqual([]);
      expect(result.metadata.revision).toBe(first.revision + 1);
    }
  });

  it("Non-empty list after clearing reports creation", async () => {
    const tool = createTodoWriteTool(store);
    await tool.execute({ todos: [{ content: "old" }] }, context);
    await tool.execute({ todos: [] }, context);
    const result = await tool.execute(
      { todos: [{ content: "new", status: "in_progress" }] },
      context,
    );
    expect(result.metadata.listCreated).toBe(true);
    expect(result.metadata.revision).toBe(3);
    expect(result.metadata.todos.map((todo) => todo.content)).toEqual(["new"]);
  });
});
