import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { CURRENT_SCHEMA_VERSION, Store, resolveDbPath } from "./store";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "opencode-todo-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("schema creation and migration", () => {
  // spec: todo-storage "Store rejects an unknown schema version"
  it("fresh create lands at current version", () => {
    const dbPath = join(dir, "todos.db");
    const store = new Store({ dbPath });
    store.close();
    const raw = new Database(dbPath);
    const rows = raw.query("PRAGMA user_version").all() as Array<{
      user_version: number;
    }>;
    expect(rows[0]?.user_version).toBe(CURRENT_SCHEMA_VERSION);
    raw.close();
  });

  // spec: todo-storage "Todos persist per session across restarts"
  it("re-open of an up-to-date database is a no-op", () => {
    const dbPath = join(dir, "todos.db");
    const store1 = new Store({ dbPath });
    store1.write("s1", [{ content: "a", status: "pending" }]);
    store1.close();

    const store2 = new Store({ dbPath });
    const todos = store2.read("s1");
    store2.close();

    expect(todos).toHaveLength(1);
    expect(todos[0]?.content).toBe("a");
  });

  it("refuses to open a database with a newer schema version", () => {
    const dbPath = join(dir, "todos.db");
    // Bootstrap once so the file/tables exist, then force the marker ahead.
    const bootstrap = new Store({ dbPath });
    bootstrap.close();
    const raw = new Database(dbPath);
    raw.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 1}`);
    raw.close();

    expect(() => new Store({ dbPath })).toThrow(/schema version/i);
  });
});

describe("item identity across writes", () => {
  // spec: todo-storage "Item identity is preserved across writes"
  it("matching item by id preserves its history", () => {
    const store = new Store({ dbPath: join(dir, "todos.db") });
    const first = store.write("s1", [{ content: "a", status: "pending" }]);
    const createdId = first.todos[0]!.id;
    const createdAt = first.todos[0]!.createdAt;

    const second = store.write("s1", [{ id: createdId, content: "a", status: "pending" }]);

    expect(second.todos).toHaveLength(1);
    expect(second.todos[0]!.id).toBe(createdId);
    expect(second.todos[0]!.createdAt).toBe(createdAt);
    store.close();
  });

  it("recovers an id-less item by exact content match", () => {
    const store = new Store({ dbPath: join(dir, "todos.db") });
    const first = store.write("s1", [{ content: "a", status: "pending" }]);
    const createdAt = first.todos[0]!.createdAt;

    const second = store.write("s1", [{ content: "a", status: "in_progress" }]);

    expect(second.todos).toHaveLength(1);
    expect(second.todos[0]!.createdAt).toBe(createdAt);
    expect(second.todos[0]!.status).toBe("in_progress");
    store.close();
  });

  it("creates a genuinely new item when id and content match nothing", () => {
    const store = new Store({ dbPath: join(dir, "todos.db") });
    store.write("s1", [{ content: "a", status: "pending" }]);
    const second = store.write("s1", [
      { content: "a", status: "pending" },
      { content: "b", status: "pending" },
    ]);

    expect(second.todos).toHaveLength(2);
    expect(second.todos.map((t) => t.content).sort()).toEqual(["a", "b"]);
    expect(second.todos.every((t) => t.id.length > 0)).toBe(true);
    store.close();
  });
});

describe("completed_at transitions", () => {
  // spec: todo-storage "Completion timestamps are tracked across status transitions"
  it("stamps completed_at when transitioning into completed", () => {
    const store = new Store({ dbPath: join(dir, "todos.db") });
    const first = store.write("s1", [{ content: "a", status: "pending" }]);
    const id = first.todos[0]!.id;

    const second = store.write("s1", [{ id, content: "a", status: "completed" }]);

    expect(second.todos[0]!.completedAt).not.toBeNull();
    store.close();
  });

  it("clears completed_at when transitioning out of completed", () => {
    const store = new Store({ dbPath: join(dir, "todos.db") });
    const first = store.write("s1", [{ content: "a", status: "completed" }]);
    const id = first.todos[0]!.id;
    expect(first.todos[0]!.completedAt).not.toBeNull();

    const second = store.write("s1", [{ id, content: "a", status: "pending" }]);

    expect(second.todos[0]!.completedAt).toBeNull();
    store.close();
  });

  it("preserves completed_at when status is repeated", () => {
    const store = new Store({ dbPath: join(dir, "todos.db") });
    const first = store.write("s1", [{ content: "a", status: "completed" }]);
    const id = first.todos[0]!.id;
    const completedAt = first.todos[0]!.completedAt;

    const second = store.write("s1", [{ id, content: "a", status: "completed" }]);

    expect(second.todos[0]!.completedAt).toBe(completedAt);
    store.close();
  });
});

describe("write ordering and revision", () => {
  // spec: todo-storage "Item order and write revision are tracked"
  it("reflects item order from the most recent write", () => {
    const store = new Store({ dbPath: join(dir, "todos.db") });
    store.write("s1", [
      { content: "a", status: "pending" },
      { content: "b", status: "pending" },
    ]);

    const reordered = store.write("s1", [
      { content: "b", status: "pending" },
      { content: "a", status: "pending" },
    ]);

    expect(reordered.todos.map((t) => t.content)).toEqual(["b", "a"]);
    expect(store.read("s1").map((t) => t.content)).toEqual(["b", "a"]);
    store.close();
  });

  it("increments the revision on every write to the same session", () => {
    const store = new Store({ dbPath: join(dir, "todos.db") });
    const first = store.write("s1", [{ content: "a", status: "pending" }]);
    const second = store.write("s1", [{ content: "a", status: "in_progress" }]);
    const third = store.write("s1", [{ content: "a", status: "completed" }]);

    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    expect(third.revision).toBe(3);
    store.close();
  });
});

describe("archival on write", () => {
  // spec: todo-storage "Items removed from a write are archived, not deleted"
  it("archives a dropped item instead of deleting it", () => {
    const store = new Store({ dbPath: join(dir, "todos.db") });
    store.write("s1", [{ content: "a", status: "pending" }]);
    const after = store.write("s1", []);

    expect(after.todos).toHaveLength(0);
    expect(store.read("s1")).toHaveLength(0);

    const raw = new Database(join(dir, "todos.db"));
    const rows = raw.query("SELECT * FROM todo WHERE session_id = ?").all("s1") as Array<{
      archived_at: number | null;
    }>;
    raw.close();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.archived_at).not.toBeNull();
    store.close();
  });
});

describe("database path resolution", () => {
  // spec: todo-storage "Database location is configurable"
  it("defaults to the XDG data directory when unconfigured", () => {
    const path = resolveDbPath({}, { XDG_DATA_HOME: "/tmp/xdg-test-home" });
    expect(path).toBe("/tmp/xdg-test-home/opencode-todo/todos.db");
  });

  it("falls back to ~/.local/share when XDG_DATA_HOME is unset", () => {
    const path = resolveDbPath({}, { HOME: "/home/tester" });
    expect(path).toBe("/home/tester/.local/share/opencode-todo/todos.db");
  });

  it("prefers an explicit dbPath option over the default", () => {
    const path = resolveDbPath({ dbPath: "/custom/todos.db" }, { XDG_DATA_HOME: "/tmp/xdg" });
    expect(path).toBe("/custom/todos.db");
  });

  it("uses OPENCODE_TODO_DB when no explicit option is given", () => {
    const path = resolveDbPath({}, { OPENCODE_TODO_DB: "/env/todos.db", XDG_DATA_HOME: "/tmp/xdg" });
    expect(path).toBe("/env/todos.db");
  });

  it("creates parent directories for the resolved path on open", () => {
    const dbPath = join(dir, "nested", "deep", "todos.db");
    const store = new Store({ dbPath });
    store.close();
    expect(existsSync(dbPath)).toBe(true);
  });
});

describe("orphan sweep", () => {
  // spec: todo-housekeeping "Orphaned sessions are pruned by an age-based sweep"
  it("archives a session's items when it has had no activity past the grace period", () => {
    const store = new Store({ dbPath: join(dir, "todos.db") });
    const oldNow = Date.parse("2020-01-01T00:00:00Z");
    store.write("stale", [{ content: "a", status: "pending" }], oldNow);

    const later = oldNow + 31 * 24 * 60 * 60 * 1000;
    const result = store.sweepOrphans(30, later);

    expect(result.archived).toBe(1);
    expect(result.sessionIds).toEqual(["stale"]);
    expect(store.read("stale")).toHaveLength(0);
    store.close();
  });

  it("leaves a recently active session's items alone", () => {
    const store = new Store({ dbPath: join(dir, "todos.db") });
    const now = Date.now();
    store.write("active", [{ content: "a", status: "pending" }], now);

    const result = store.sweepOrphans(30, now + 1000);

    expect(result.archived).toBe(0);
    expect(result.sessionIds).toEqual([]);
    expect(store.read("active")).toHaveLength(1);
    store.close();
  });
});

describe("retention sweep", () => {
  // spec: todo-housekeeping "Completed items are auto-archived after a retention window"
  it("archives a completed item past the retention window", () => {
    const store = new Store({ dbPath: join(dir, "todos.db") });
    const completedAt = Date.parse("2020-01-01T00:00:00Z");
    store.write("s1", [{ content: "a", status: "completed" }], completedAt);

    const pastRetention = completedAt + 8 * 24 * 60 * 60 * 1000;
    const result = store.sweepRetention(7, pastRetention);

    expect(result.archived).toBe(1);
    expect(result.sessionIds).toEqual(["s1"]);
    expect(store.read("s1")).toHaveLength(0);
    store.close();
  });

  it("does not archive a completed item still within the retention window", () => {
    const store = new Store({ dbPath: join(dir, "todos.db") });
    const completedAt = Date.now();
    store.write("s1", [{ content: "a", status: "completed" }], completedAt);

    const withinRetention = completedAt + 1 * 24 * 60 * 60 * 1000;
    const result = store.sweepRetention(7, withinRetention);

    expect(result.archived).toBe(0);
    expect(result.sessionIds).toEqual([]);
    expect(store.read("s1")).toHaveLength(1);
    store.close();
  });
});

describe("concurrency", () => {
  it("two store instances writing to the same file do not surface SQLITE_BUSY", async () => {
    const dbPath = join(dir, "todos.db");
    const storeA = new Store({ dbPath, busyTimeoutMs: 5000 });
    const storeB = new Store({ dbPath, busyTimeoutMs: 5000 });

    const writes: Array<Promise<unknown>> = [];
    for (let i = 0; i < 20; i++) {
      writes.push(
        Promise.resolve().then(() =>
          storeA.write(`sA${i}`, [{ content: `a${i}`, status: "pending" }]),
        ),
      );
      writes.push(
        Promise.resolve().then(() =>
          storeB.write(`sB${i}`, [{ content: `b${i}`, status: "pending" }]),
        ),
      );
    }

    await expect(Promise.all(writes)).resolves.toBeDefined();
    storeA.close();
    storeB.close();
  });
});
