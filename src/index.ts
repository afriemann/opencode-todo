import { Plugin } from "@opencode/plugin";
import { Store } from "./store";
import { createTodoReadTool, createTodoWriteTool } from "./tools";
import {
  archiveDeletedSession,
  createSweepScheduler,
  parseHousekeepingConfig,
} from "./housekeeping";
import { TodoRpc } from "./rpc";

function readStringOption(options: Record<string, unknown>, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

function readNumberOption(options: Record<string, unknown>, key: string): number | undefined {
  const value = options[key];
  return typeof value === "number" ? value : undefined;
}

function failingTool(name: string, reason: string) {
  return {
    name,
    description: `${name} is unavailable — ${reason}.`,
    input: { type: "object" as const, properties: {}, required: [] },
    options: { codemode: false as const },
    async execute() {
      throw new Error(`opencode-todo: ${name} unavailable — ${reason}`);
    },
  };
}

export default Plugin.define({
  id: "opencode-todo",
  async setup(ctx) {
    const options = (ctx.options ?? {}) as Record<string, unknown>;
    const log = (message: string) => {
      process.stderr.write(`[opencode-todo] ${message}\n`);
    };

    let store: Store | undefined;
    try {
      const dbPath = readStringOption(options, "dbPath");
      const busyTimeoutMs = readNumberOption(options, "busyTimeoutMs");
      store = new Store({
        ...(dbPath !== undefined ? { dbPath } : {}),
        ...(busyTimeoutMs !== undefined ? { busyTimeoutMs } : {}),
      });
    } catch (error) {
      // Design D11: a broken store must not prevent the rest of the opencode session from
      // starting — register failing tools instead of aborting setup.
      log(`failed to open store: ${String(error)}`);
    }

    const housekeepingConfig = parseHousekeepingConfig(options, log);
    const scheduler = store ? createSweepScheduler(store, housekeepingConfig) : undefined;

    const rpcRegistration = store
      ? await ctx.rpc.register(TodoRpc, {
          list: async (input: unknown) => {
            const { sessionID } = input as { sessionID: string };
            return { revision: store!.revision(sessionID), todos: store!.read(sessionID) };
          },
        })
      : undefined;

    const emitChanged = async (sessionID: string): Promise<void> => {
      if (!store || !rpcRegistration) return;
      await rpcRegistration.events.emit("changed", {
        sessionID,
        revision: store.revision(sessionID),
      });
    };

    const toolRegistration = await ctx.tool.transform((editor) => {
      if (store) {
        const toolLog = (message: string, error: unknown) => log(`${message}: ${String(error)}`);
        const todowrite = createTodoWriteTool(store, toolLog);
        const todoread = createTodoReadTool(store, toolLog);

        editor.add({
          ...todowrite,
          async execute(input: unknown, context: { sessionID: string }) {
            const result = await todowrite.execute(input as { todos: unknown }, context);
            // Piggyback the opportunistic sweep on write calls (design D5) and notify the TUI.
            const sweep = scheduler?.maybeSweep(Date.now());
            await emitChanged(context.sessionID);
            for (const sessionID of sweep?.affectedSessionIds ?? []) {
              if (sessionID !== context.sessionID) await emitChanged(sessionID);
            }
            return result;
          },
        });
        editor.add({
          ...todoread,
          async execute(input: unknown, context: { sessionID: string }) {
            const sweep = scheduler?.maybeSweep(Date.now());
            for (const sessionID of sweep?.affectedSessionIds ?? []) {
              await emitChanged(sessionID);
            }
            return todoread.execute(input as Record<string, never>, context);
          },
        });
      } else {
        editor.add(failingTool("todowrite", "the opencode-todo store failed to open"));
        editor.add(failingTool("todoread", "the opencode-todo store failed to open"));
      }
    });

    const abortController = new AbortController();
    const reactivePruneLoop = (async () => {
      if (!store) return;
      try {
        for await (const event of ctx.event.subscribe({ signal: abortController.signal })) {
          if (event.type !== "session.deleted") continue;
          try {
            archiveDeletedSession(store, event.data.sessionID);
          } catch (error) {
            log(`reactive prune failed for session ${event.data.sessionID}: ${String(error)}`);
          }
        }
      } catch (error) {
        if (abortController.signal.aborted) return;
        log(`event subscription failed: ${String(error)}`);
      }
    })();

    return async () => {
      abortController.abort();
      await reactivePruneLoop;
      await toolRegistration.dispose();
      await rpcRegistration?.dispose();
      store?.close();
    };
  },
});
