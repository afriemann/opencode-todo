# opencode-todo

An opencode V2 plugin that restores v1-style todo-list functionality: a SQLite-backed
per-session todo store, `todowrite`/`todoread` agent tools, background housekeeping
(pruning todos for deleted sessions and auto-archiving completed items), and a TUI
sidebar component that surfaces the current session's todos inside the opencode
terminal interface.

See `openspec/` for the change history and current specs once the OpenSpec change
for this plugin has been proposed and archived.
