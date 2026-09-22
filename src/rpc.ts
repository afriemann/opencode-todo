import { Rpc } from "@opencode/plugin/rpc";

/** JSON Schema for a single todo item, matching the store's TodoItem shape. */
const todoItemSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    content: { type: "string" },
    status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"] },
    priority: { type: ["string", "null"] },
    position: { type: "number" },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
    completedAt: { type: ["number", "null"] },
  },
  required: [
    "id",
    "content",
    "status",
    "priority",
    "position",
    "createdAt",
    "updatedAt",
    "completedAt",
  ],
} as const;

/**
 * RPC domain exposing read access for the TUI process (design D9): one pull method, `list`, and
 * one change-notification event carrying only `{ sessionID, revision }` so the TUI re-pulls the
 * full list rather than the event schema needing to track item-shape changes.
 */
export const TodoRpc = Rpc.define({
  id: "todo",
  methods: {
    list: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" } },
        required: ["sessionID"],
      },
      output: {
        type: "object",
        properties: {
          revision: { type: "number" },
          todos: { type: "array", items: todoItemSchema },
        },
        required: ["revision", "todos"],
      },
    },
  },
  events: {
    changed: {
      schema: {
        type: "object",
        properties: {
          sessionID: { type: "string" },
          revision: { type: "number" },
        },
        required: ["sessionID", "revision"],
      },
    },
  },
});
