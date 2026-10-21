# Proposal

## Why

Agents must echo stable todo IDs to preserve identity during updates, but the visible results omit those IDs. Exposing them makes the documented update workflow possible without guessing or relying on content matching.

## What Changes

- Return the current todo array as JSON in both tools' model-visible output, exposing stable IDs without a custom text format.
- Verify visible-output update round trips preserve identity and timestamp semantics.
- Document the visible ID-based update workflow.

## Capabilities

### Modified Capabilities

- `todo-tools`: require stable IDs in model-visible read and write results.

## Impact

Touches `src/tools.ts` (including tool descriptions), `src/tools.test.ts`, `README.md`, and the `todo-tools` specification. Visible checklist text becomes JSON, including `[]` for an empty list. Storage, metadata, TUI, dependencies, agent instructions, and installed runtime configuration remain unchanged.
