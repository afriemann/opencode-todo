/**
 * Shared domain types with no runtime dependency on the store or any
 * server-only module. The TUI plugin imports exclusively from this file so
 * it never pulls in `bun:sqlite` or `src/store.ts` — see spec `todo-tui`,
 * "TUI reads todo data only through the RPC domain".
 */
export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export const VALID_STATUSES: ReadonlySet<TodoStatus> = new Set([
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
