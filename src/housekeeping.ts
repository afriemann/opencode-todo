import type { Store } from "./store";
import type { Logger } from "./tools";

export interface HousekeepingConfig {
  retentionDays: number;
  orphanGraceDays: number;
  sweepIntervalHours: number;
}

/** Documented defaults (design D12). */
export const DEFAULT_HOUSEKEEPING_CONFIG: HousekeepingConfig = {
  retentionDays: 7,
  orphanGraceDays: 30,
  sweepIntervalHours: 24,
};

type WarnLogger = (message: string) => void;

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Parses housekeeping options against documented defaults (spec `todo-housekeeping`
 * "Housekeeping intervals and windows are configurable"): an invalid value for any single
 * field falls back to that field's default with a logged warning, rather than failing to
 * start.
 */
export function parseHousekeepingConfig(
  options: Record<string, unknown>,
  log: WarnLogger,
): HousekeepingConfig {
  const resolve = (key: keyof HousekeepingConfig): number => {
    const value = options[key];
    if (value === undefined) return DEFAULT_HOUSEKEEPING_CONFIG[key];
    if (isPositiveFiniteNumber(value)) return value;
    log(
      `opencode-todo: invalid ${key} (${JSON.stringify(value)}) — falling back to default ` +
        `${DEFAULT_HOUSEKEEPING_CONFIG[key]}`,
    );
    return DEFAULT_HOUSEKEEPING_CONFIG[key];
  };

  return {
    retentionDays: resolve("retentionDays"),
    orphanGraceDays: resolve("orphanGraceDays"),
    sweepIntervalHours: resolve("sweepIntervalHours"),
  };
}

/**
 * Reactive prune (spec "Deleted sessions' todos are archived reactively"): archives every
 * non-archived item for a session observed as deleted via `session.deleted`'s
 * `event.data.sessionID`.
 */
export function archiveDeletedSession(store: Store, sessionID: string, now?: number): number {
  return store.archiveSession(sessionID, now);
}

export interface SweepResult {
  ran: boolean;
  retentionArchived: number;
  orphanArchived: number;
  affectedSessionIds: string[];
}

export interface SweepScheduler {
  /**
   * Runs the retention + orphan sweeps if the configured interval has elapsed since the last
   * run (or this is the first call). Intended to be piggybacked on a tool call, never on a
   * timer (design D5) — the caller passes the current clock value on every `todowrite`/
   * `todoread` invocation.
   */
  maybeSweep(now: number): SweepResult;
}

/**
 * Builds an interval-gated sweep runner (design D5's "opportunistic sweep"). Deliberately takes
 * no session-liveness dependency of any kind — age alone, read from the store's own timestamps,
 * is the sole criterion (spec "Sweep performs no liveness lookup").
 */
export function createSweepScheduler(store: Store, config: HousekeepingConfig): SweepScheduler {
  let lastSweepAt: number | null = null;
  const intervalMs = config.sweepIntervalHours * 60 * 60 * 1000;

  return {
    maybeSweep(now: number): SweepResult {
      if (lastSweepAt !== null && now - lastSweepAt < intervalMs) {
        return { ran: false, retentionArchived: 0, orphanArchived: 0, affectedSessionIds: [] };
      }
      lastSweepAt = now;
      const retention = store.sweepRetention(config.retentionDays, now);
      const orphan = store.sweepOrphans(config.orphanGraceDays, now);
      const affectedSessionIds = [...new Set([...retention.sessionIds, ...orphan.sessionIds])];
      return {
        ran: true,
        retentionArchived: retention.archived,
        orphanArchived: orphan.archived,
        affectedSessionIds,
      };
    },
  };
}

export type { Logger };
