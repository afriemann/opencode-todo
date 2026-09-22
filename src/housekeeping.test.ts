import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "./store";
import {
  DEFAULT_HOUSEKEEPING_CONFIG,
  archiveDeletedSession,
  createSweepScheduler,
  parseHousekeepingConfig,
} from "./housekeeping";

let dir: string;
let store: Store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "opencode-todo-housekeeping-"));
  store = new Store({ dbPath: join(dir, "todos.db") });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("parseHousekeepingConfig", () => {
  // spec: todo-housekeeping "Housekeeping intervals and windows are configurable"
  it("applies documented defaults when unconfigured", () => {
    const logs: unknown[] = [];
    const config = parseHousekeepingConfig({}, (msg) => logs.push(msg));
    expect(config).toEqual(DEFAULT_HOUSEKEEPING_CONFIG);
    expect(logs).toHaveLength(0);
  });

  it("falls back to defaults with a logged warning for an invalid value", () => {
    const logs: unknown[] = [];
    const config = parseHousekeepingConfig(
      { retentionDays: -1, orphanGraceDays: "bogus", sweepIntervalHours: 0 },
      (msg) => logs.push(msg),
    );
    expect(config).toEqual(DEFAULT_HOUSEKEEPING_CONFIG);
    expect(logs.length).toBeGreaterThanOrEqual(3);
  });

  it("accepts valid overrides", () => {
    const config = parseHousekeepingConfig(
      { retentionDays: 14, orphanGraceDays: 60, sweepIntervalHours: 12 },
      () => {},
    );
    expect(config).toEqual({ retentionDays: 14, orphanGraceDays: 60, sweepIntervalHours: 12 });
  });
});

describe("archiveDeletedSession", () => {
  // spec: todo-housekeeping "Deleted sessions' todos are archived reactively"
  it("archives all non-archived items for the deleted session", () => {
    store.write("s1", [{ content: "a", status: "pending" }]);
    const archived = archiveDeletedSession(store, "s1");
    expect(archived).toBe(1);
    expect(store.read("s1")).toHaveLength(0);
  });
});

describe("createSweepScheduler", () => {
  // spec: todo-housekeeping "Orphaned sessions are pruned by an age-based sweep"
  it("runs a sweep on the first call regardless of interval", () => {
    const scheduler = createSweepScheduler(store, DEFAULT_HOUSEKEEPING_CONFIG);
    const result = scheduler.maybeSweep(Date.now());
    expect(result.ran).toBe(true);
  });

  it("does not run again before the configured interval has elapsed", () => {
    const scheduler = createSweepScheduler(store, DEFAULT_HOUSEKEEPING_CONFIG);
    const first = Date.now();
    scheduler.maybeSweep(first);
    const secondResult = scheduler.maybeSweep(first + 60_000);
    expect(secondResult.ran).toBe(false);
  });

  it("runs again once the interval has elapsed", () => {
    const scheduler = createSweepScheduler(store, DEFAULT_HOUSEKEEPING_CONFIG);
    const first = Date.now();
    scheduler.maybeSweep(first);
    const intervalMs = DEFAULT_HOUSEKEEPING_CONFIG.sweepIntervalHours * 60 * 60 * 1000;
    const result = scheduler.maybeSweep(first + intervalMs + 1);
    expect(result.ran).toBe(true);
  });

  // spec: todo-housekeeping "Sweep performs no liveness lookup"
  it("archives purely by elapsed time with no session-liveness parameter available", () => {
    // The scheduler's signature accepts only a clock value — there is no session-lookup
    // dependency to inject, which is the structural enforcement of "no liveness lookup".
    const scheduler = createSweepScheduler(store, {
      ...DEFAULT_HOUSEKEEPING_CONFIG,
      orphanGraceDays: 1,
    });
    const oldNow = Date.parse("2020-01-01T00:00:00Z");
    store.write("stale", [{ content: "a", status: "pending" }], oldNow);

    const result = scheduler.maybeSweep(oldNow + 2 * 24 * 60 * 60 * 1000);

    expect(result.ran).toBe(true);
    expect(store.read("stale")).toHaveLength(0);
  });
});
