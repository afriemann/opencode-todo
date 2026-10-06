import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/solid";
import type { Plugin } from "@opencode/plugin/tui";
import { TodoSidebar } from "./tui.js";
import type { TodoItem } from "./types.js";

const WIDTH = 40;

function todo(id: string, content: string): TodoItem {
  return {
    id,
    content,
    status: "pending",
    priority: null,
    position: 0,
    createdAt: 0,
    updatedAt: 0,
    completedAt: null,
  };
}

/** Only the slice of `Plugin.Context` that `TodoSidebar` reads, cast to the full type. */
function fakeContext(todos: readonly TodoItem[], open: boolean): Plugin.Context {
  const color = "#ffffff";
  const context = {
    theme: {
      text: {
        base: color,
        muted: color,
        feedback: {
          success: { base: color },
          info: { base: color },
          error: { base: color },
        },
      },
    },
    storage: {
      store: () => [{ open }, async () => {}],
    },
    client: {
      rpc: () => ({
        list: async () => ({ revision: 1, todos }),
        events: { on: () => () => {} },
      }),
    },
  };
  return context as unknown as Plugin.Context;
}

async function selectAcrossSidebar(open: boolean): Promise<string> {
  const todos = [
    todo("1", "alpha item"),
    todo("2", "beta item"),
    todo("3", "gamma item"),
  ];
  const setup = await testRender(
    () => TodoSidebar({ context: fakeContext(todos, open), sessionID: "s1" }),
    { width: WIDTH, height: 10 },
  );
  await setup.flush();
  await setup.renderOnce();
  await setup.mockMouse.drag(WIDTH - 1, open ? 3 : 0, 0, 0);
  await setup.renderOnce();
  const text = setup.renderer.getSelection()?.getSelectedText() ?? "";
  setup.renderer.destroy();
  return text;
}

describe("TodoSidebar header", () => {
  // spec: todo-tui "Header text is not selectable"
  test("header text is not selectable when expanded", async () => {
    const text = await selectAcrossSidebar(true);
    expect(text).toContain("alpha item");
    expect(text).not.toContain("Todos");
    expect(text).not.toContain("▼");
  });

  // spec: todo-tui "Header text is not selectable"
  test("header text and summary are not selectable when collapsed", async () => {
    const text = await selectAcrossSidebar(false);
    expect(text).not.toContain("Todos");
    expect(text).not.toContain("pending");
    expect(text).not.toContain("▶");
  });
});
