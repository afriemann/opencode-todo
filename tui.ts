// Root forwarder for OpenCode's TUI plugin loader.
//
// Directory-based loading resolves the terminal half from `<dir>/tui.*`, not by package.json
// `exports`. Keep this file so the real entry in `src/tui.tsx` is found when the repo is used
// as a plugin directory. npm/package resolution still goes through `exports` and is unaffected.
//
// @see https://opencode.ai/v2/docs/build/plugins/cli
export { default } from "./src/tui.tsx";
