import type { TodoItem, TodoStatus } from "./store";
import { CURRENT_SCHEMA_VERSION } from "./store";

export interface TodoMetadata {
  source: "opencode-todo";
  schemaVersion: number;
  sessionID: string;
  revision: number;
  todos: TodoItem[];
  counts: Record<TodoStatus, number>;
}

const ZERO_COUNTS: Record<TodoStatus, number> = {
  pending: 0,
  in_progress: 0,
  completed: 0,
  cancelled: 0,
};

/** Shared metadata contract for both `todowrite` and `todoread` results (design D8). */
export function buildMetadata(sessionID: string, revision: number, todos: TodoItem[]): TodoMetadata {
  const counts = { ...ZERO_COUNTS };
  for (const todo of todos) counts[todo.status] += 1;
  return {
    source: "opencode-todo",
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sessionID,
    revision,
    todos,
    counts,
  };
}
