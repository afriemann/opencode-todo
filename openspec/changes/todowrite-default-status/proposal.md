# Proposal

## Why

`todowrite`'s JSON schema currently requires `status` on every submitted todo item, and
`assertValidItems` throws if it is missing. A model calling `todowrite` to add a new item often has
no reason to think about its status — it is simply a new, open task — yet is forced to supply
`"pending"` explicitly on every call or have the entire write rejected. Defaulting an omitted
`status` to `"pending"` removes this friction without weakening validation: an explicitly supplied
invalid status is still rejected.

## What Changes

- `todowrite`'s input schema no longer requires `status` on a todo item — only `content` remains
  required.
- An item submitted without a `status` field is defaulted to `"pending"` before being written to
  the store.
- An item submitted with an explicit, invalid `status` value is still rejected with an error, as
  today — this change only relaxes the omission case, not validation of a provided value.
- Tool description and README documentation updated to reflect the optional `status` field and its
  default.

## Capabilities

### Modified Capabilities

- `todo-tools`: `todowrite` now defaults an omitted `status` field to `pending` instead of
  rejecting the write.

## Impact

- `src/tools.ts` — `todowrite`'s JSON schema (`required` array) and item validation/normalization
  logic.
- `src/tools.test.ts` — new test covering the default-status behavior.
- `README.md` — `todowrite` tool documentation.
- No change to `src/store.ts` / `src/types.ts` — the store's `TodoInput.status` contract stays
  required; the default is applied at the tool boundary before `store.write` is called.
