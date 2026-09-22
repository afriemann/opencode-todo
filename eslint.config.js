import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["node_modules/**", "dist/**", "*.db", "*.db-*"],
  },
  {
    // Node-run build tooling, not part of the plugin runtime — needs Node
    // globals unavailable to the Bun/opencode-plugin source in src/.
    files: ["script/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", URL: "readonly", console: "readonly" },
    },
  },
);
