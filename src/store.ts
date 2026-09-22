import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

const VALID_STATUSES: ReadonlySet<TodoStatus> = new Set([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);

export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
  priority: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface TodoInput {
  id?: string;
  content: string;
  status: TodoStatus;
  priority?: string | null;
}

export interface StoreOptions {
  dbPath?: string;
  busyTimeoutMs?: number;
}

export interface WriteResult {
  revision: number;
  todos: TodoItem[];
}

/** Bumped whenever the on-disk schema changes. See design.md D7. */
export const CURRENT_SCHEMA_VERSION = 1;

const DEFAULT_BUSY_TIMEOUT_MS = 5000;

/**
 * Resolves the database file path per design D6 / spec "Database location is configurable":
 * explicit option > OPENCODE_TODO_DB env var > $XDG_DATA_HOME > ~/.local/share, all under an
 * `opencode-todo/` directory.
 */
export function resolveDbPath(
  options: Pick<StoreOptions, "dbPath"> = {},
  env: Record<string, string | undefined> = process.env,
): string {
  if (options.dbPath) return options.dbPath;
  if (env.OPENCODE_TODO_DB) return env.OPENCODE_TODO_DB;
  const base = env.XDG_DATA_HOME || join(env.HOME ?? homedir(), ".local", "share");
  return join(base, "opencode-todo", "todos.db");
}

interface TodoRow {
  session_id: string;
  item_id: string;
  position: number;
  content: string;
  status: TodoStatus;
  priority: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  archived_at: number | null;
}

function rowToItem(row: TodoRow): TodoItem {
  return {
    id: row.item_id,
    content: row.content,
    status: row.status,
    priority: row.priority,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export class Store {
  private readonly db: Database;

  constructor(options: StoreOptions = {}) {
    const dbPath = resolveDbPath(options);
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(`PRAGMA busy_timeout = ${options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS}`);
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    const versionRows = this.db.query("PRAGMA user_version").all() as Array<{
      user_version: number;
    }>;
    const version = versionRows[0]?.user_version ?? 0;

    if (version > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `opencode-todo: database schema version ${version} is newer than this plugin's ` +
          `known version ${CURRENT_SCHEMA_VERSION}. Refusing to open it — upgrade the plugin.`,
      );
    }

    if (version === CURRENT_SCHEMA_VERSION) return;

    this.db.transaction(() => {
      if (version < 1) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS todo (
            session_id   TEXT NOT NULL,
            item_id      TEXT NOT NULL,
            position     INTEGER NOT NULL,
            content      TEXT NOT NULL,
            status       TEXT NOT NULL,
            priority     TEXT,
            created_at   INTEGER NOT NULL,
            updated_at   INTEGER NOT NULL,
            completed_at INTEGER,
            archived_at  INTEGER,
            PRIMARY KEY (session_id, item_id)
          );
        `);
        this.db.exec(
          "CREATE INDEX IF NOT EXISTS idx_todo_session_read " +
            "ON todo (session_id, archived_at, position);",
        );
        this.db.exec(
          "CREATE INDEX IF NOT EXISTS idx_todo_retention " +
            "ON todo (archived_at, completed_at);",
        );
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS todo_revision (
            session_id TEXT PRIMARY KEY,
            revision INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
          );
        `);
      }
      this.db.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
    })();
  }

  /** Non-archived items for a session, ordered by position. Spec: "Todos persist per session". */
  read(sessionID: string): TodoItem[] {
    const rows = this.db
      .query(
        "SELECT * FROM todo WHERE session_id = ? AND archived_at IS NULL ORDER BY position ASC",
      )
      .all(sessionID) as TodoRow[];
    return rows.map(rowToItem);
  }

  /**
   * Diff-writes the full intended list for a session (design D2): matches incoming items to
   * existing rows by id, then by content for id-less items, preserves created_at/completed_at
   * across matches, stamps/clears completed_at on transition, and archives (soft-deletes) any
   * existing item absent from the incoming list. Runs in a single transaction.
   */
  write(sessionID: string, items: readonly TodoInput[], now: number = Date.now()): WriteResult {
    for (const item of items) {
      if (!VALID_STATUSES.has(item.status)) {
        throw new Error(`opencode-todo: invalid status "${item.status}"`);
      }
    }

    const run = this.db.transaction(() => {
      const existing = this.db
        .query("SELECT * FROM todo WHERE session_id = ? AND archived_at IS NULL")
        .all(sessionID) as TodoRow[];
      const byId = new Map(existing.map((row) => [row.item_id, row]));
      const matchedIds = new Set<string>();

      const insert = this.db.query(
        `INSERT INTO todo
           (session_id, item_id, position, content, status, priority, created_at, updated_at, completed_at, archived_at)
         VALUES ($sessionID, $itemId, $position, $content, $status, $priority, $createdAt, $updatedAt, $completedAt, NULL)
         ON CONFLICT (session_id, item_id) DO UPDATE SET
           position = excluded.position,
           content = excluded.content,
           status = excluded.status,
           priority = excluded.priority,
           updated_at = excluded.updated_at,
           completed_at = excluded.completed_at`,
      );

      const touchedIds = new Set<string>();

      items.forEach((item, index) => {
        let match: TodoRow | undefined;
        if (item.id && byId.has(item.id)) {
          match = byId.get(item.id);
        } else if (!item.id) {
          for (const row of existing) {
            if (matchedIds.has(row.item_id)) continue;
            if (row.content === item.content) {
              match = row;
              break;
            }
          }
        }

        const itemId = match?.item_id ?? item.id ?? randomUUID();
        if (match) matchedIds.add(match.item_id);
        touchedIds.add(itemId);

        const createdAt = match?.created_at ?? now;
        let completedAt: number | null;
        if (item.status === "completed") {
          completedAt = match?.status === "completed" ? (match.completed_at ?? now) : now;
        } else {
          completedAt = null;
        }

        insert.run({
          $sessionID: sessionID,
          $itemId: itemId,
          $position: index,
          $content: item.content,
          $status: item.status,
          $priority: item.priority ?? null,
          $createdAt: createdAt,
          $updatedAt: now,
          $completedAt: completedAt,
        });
      });

      // Archive existing rows that were not touched by this write (design D2/D4).
      const archive = this.db.query(
        "UPDATE todo SET archived_at = ? WHERE session_id = ? AND archived_at IS NULL AND item_id NOT IN (SELECT value FROM json_each(?))",
      );
      archive.run(now, sessionID, JSON.stringify([...touchedIds]));

      const revision = this.bumpRevision(sessionID, now);
      const todos = this.read(sessionID);
      return { revision, todos };
    });

    return run();
  }

  /** Current revision counter for a session (0 if the session has never been written). */
  revision(sessionID: string): number {
    const rows = this.db
      .query("SELECT revision FROM todo_revision WHERE session_id = ?")
      .all(sessionID) as Array<{ revision: number }>;
    return rows[0]?.revision ?? 0;
  }

  /** Archives every non-archived item for a session. Used by reactive session.deleted pruning. */
  archiveSession(sessionID: string, now: number = Date.now()): number {
    const result = this.db
      .query("UPDATE todo SET archived_at = ? WHERE session_id = ? AND archived_at IS NULL")
      .run(now, sessionID);
    return result.changes;
  }

  /**
   * Archives items belonging to sessions with no activity (no updated_at) more recent than
   * `graceDays`. Age-based only — no session-liveness lookup (design D5). Returns the number of
   * rows archived and the distinct session ids touched, so callers can notify RPC subscribers.
   */
  sweepOrphans(graceDays: number, now: number = Date.now()): { archived: number; sessionIds: string[] } {
    const cutoff = now - graceDays * 24 * 60 * 60 * 1000;
    const affected = this.db
      .query(
        "SELECT session_id FROM todo WHERE archived_at IS NULL " +
          "GROUP BY session_id HAVING MAX(updated_at) < ?",
      )
      .all(cutoff) as Array<{ session_id: string }>;
    const sessionIds = affected.map((row) => row.session_id);
    if (sessionIds.length === 0) return { archived: 0, sessionIds: [] };

    const result = this.db
      .query(
        "UPDATE todo SET archived_at = ? " +
          "WHERE archived_at IS NULL " +
          "AND session_id IN (SELECT value FROM json_each(?))",
      )
      .run(now, JSON.stringify(sessionIds));
    return { archived: result.changes, sessionIds };
  }

  /**
   * Archives completed items whose completed_at is older than `retentionDays`. Returns the
   * number of rows archived and the distinct session ids touched.
   */
  sweepRetention(
    retentionDays: number,
    now: number = Date.now(),
  ): { archived: number; sessionIds: string[] } {
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
    const affected = this.db
      .query(
        "SELECT DISTINCT session_id FROM todo " +
          "WHERE archived_at IS NULL AND status = 'completed' AND completed_at IS NOT NULL AND completed_at < ?",
      )
      .all(cutoff) as Array<{ session_id: string }>;
    const sessionIds = affected.map((row) => row.session_id);
    if (sessionIds.length === 0) return { archived: 0, sessionIds: [] };

    const result = this.db
      .query(
        "UPDATE todo SET archived_at = ? " +
          "WHERE archived_at IS NULL AND status = 'completed' AND completed_at IS NOT NULL AND completed_at < ?",
      )
      .run(now, cutoff);
    return { archived: result.changes, sessionIds };
  }

  private bumpRevision(sessionID: string, now: number): number {
    this.db
      .query(
        `INSERT INTO todo_revision (session_id, revision, updated_at) VALUES (?, 1, ?)
         ON CONFLICT (session_id) DO UPDATE SET revision = revision + 1, updated_at = excluded.updated_at`,
      )
      .run(sessionID, now);
    const revisionRows = this.db
      .query("SELECT revision FROM todo_revision WHERE session_id = ?")
      .all(sessionID) as Array<{ revision: number }>;
    return revisionRows[0]?.revision ?? 0;
  }
}
