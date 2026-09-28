import type { Store, TodoInput, TodoStatus } from "./store";
import { buildMetadata, type TodoMetadata } from "./metadata";

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);

export interface ToolCallContext {
  sessionID: string;
}

export interface ToolResult {
  content: string;
  metadata: TodoMetadata;
}

export type Logger = (message: string, error: unknown) => void;

const defaultLogger: Logger = (message, error) => {
  process.stderr.write(`[opencode-todo] ${message}: ${String(error)}\n`);
};

const STATUS_MARKER: Record<TodoStatus, string> = {
  pending: "[ ]",
  in_progress: "[~]",
  completed: "[x]",
  cancelled: "[-]",
};

/** Compact, human-readable rendering of the current list for the model-visible text field. */
function renderSummary(todos: readonly { status: TodoStatus; content: string }[]): string {
  if (todos.length === 0) return "(no todos)";
  return todos.map((t) => `${STATUS_MARKER[t.status]} ${t.content}`).join("\n");
}

const DEFAULT_STATUS: TodoStatus = "pending";

/**
 * Validates raw tool input and normalizes it into `TodoInput[]`: an item with no `status` field
 * defaults to `"pending"`; an item with an explicit `status` outside the fixed set is rejected.
 */
function normalizeItems(todos: unknown): TodoInput[] {
  if (!Array.isArray(todos)) {
    throw new Error("opencode-todo: todowrite requires a `todos` array");
  }
  return todos.map((item) => {
    const status = (item as { status?: unknown } | null)?.status;
    if (status === undefined) {
      return { ...(item as object), status: DEFAULT_STATUS } as TodoInput;
    }
    if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
      throw new Error(
        `opencode-todo: invalid status "${String(status)}" — must be one of ` +
          "pending, in_progress, completed, cancelled",
      );
    }
    return item as TodoInput;
  });
}

const TODOWRITE_DESCRIPTION =
  "Write the full intended todo list for the current session. Pass every item you want to " +
  "keep — including ones already in progress or completed — as the complete list; anything " +
  "omitted is archived, not merely left alone. Echo back the `id` of any item you are carrying " +
  "forward unchanged so its creation time and completion time are preserved; omit `id` only for " +
  "a genuinely new item. `status` defaults to `pending` when omitted, so a newly added item " +
  "needs no explicit status. Use this to track multi-step work so it survives context compaction.";

const TODOREAD_DESCRIPTION =
  "Read back the current session's todo list exactly as last written by todowrite. Use this " +
  "after a context compaction or at the start of a turn to recover the list without re-deriving " +
  "it from conversation history.";

/** Registers `todowrite` per spec `todo-tools` — directly callable, diffed against the store. */
export function createTodoWriteTool(store: Store, log: Logger = defaultLogger) {
  return {
    name: "todowrite",
    description: TODOWRITE_DESCRIPTION,
    input: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Id of an existing item to carry forward" },
              content: { type: "string", description: "The todo's text" },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed", "cancelled"],
                description: "Defaults to \"pending\" when omitted",
              },
              priority: { type: "string", description: "Optional free-form priority label" },
            },
            required: ["content"],
          },
        },
      },
      required: ["todos"],
    },
    options: { codemode: false as const },
    async execute(
      input: { todos: unknown },
      context: ToolCallContext,
    ): Promise<ToolResult> {
      try {
        const items = normalizeItems(input.todos);
        const { revision, todos } = store.write(context.sessionID, items);
        return {
          content: renderSummary(todos),
          metadata: buildMetadata(context.sessionID, revision, todos),
        };
      } catch (error) {
        log("todowrite failed", error);
        throw error;
      }
    },
  };
}

/** Registers `todoread` per spec `todo-tools` — directly callable, read-only. */
export function createTodoReadTool(store: Store, log: Logger = defaultLogger) {
  return {
    name: "todoread",
    description: TODOREAD_DESCRIPTION,
    input: { type: "object", properties: {}, required: [] },
    options: { codemode: false as const },
    async execute(_input: Record<string, never>, context: ToolCallContext): Promise<ToolResult> {
      try {
        const todos = store.read(context.sessionID);
        const revision = store.revision(context.sessionID);
        return {
          content: renderSummary(todos),
          metadata: buildMetadata(context.sessionID, revision, todos),
        };
      } catch (error) {
        log("todoread failed", error);
        throw error;
      }
    },
  };
}

export type { TodoStatus };
