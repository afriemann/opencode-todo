// Root forwarder for OpenCode's directory plugin loader.
//
// A plugin loaded from a directory is resolved by layout, not by package.json `exports`:
// the server half is read from `<dir>/server.*`, falling back to `<dir>/index.*`. Keep this
// file so the real entry in `src/index.ts` is found when the repo is used as a plugin
// directory. npm/package resolution still goes through `exports` and is unaffected.
//
// @see https://opencode.ai/v2/docs/build/plugins
export { default } from "./src/index.ts";
