# todo-tools Specification

## Purpose

Agent-facing tools, `todowrite` and `todoread`, that replicate opencode V1's todo tool names so a
model can maintain and read back a per-session todo list, with a structured result payload that
lets other plugins observe todo state without a bespoke integration.

## Requirements

### Requirement: `todowrite` tool is directly callable by the model

The system SHALL register a tool named exactly `todowrite`, callable directly by the model without
Code-Mode indirection, that accepts a full intended todo list for the calling session and applies
it to the store.

#### Scenario: Model calls todowrite directly

- **WHEN** the model calls the `todowrite` tool with a list of todo items for its session
- **THEN** the tool executes without requiring a Code-Mode wrapper call and the session's stored
  todo list reflects the submitted items

### Requirement: `todoread` tool is directly callable by the model

The system SHALL register a tool named exactly `todoread`, callable directly by the model without
Code-Mode indirection, that returns the calling session's current non-archived todo list.

#### Scenario: Model calls todoread directly

- **WHEN** the model calls the `todoread` tool for its session
- **THEN** the tool returns the session's current non-archived todo items without requiring a
  Code-Mode wrapper call

### Requirement: `todowrite` rejects an invalid status value

The system SHALL validate each incoming item's `status` against the fixed set of allowed values
(`pending`, `in_progress`, `completed`, `cancelled`) and SHALL reject the write with an error when
any item carries a value outside that set, rather than silently coercing it.

#### Scenario: Unknown status is rejected

- **WHEN** a `todowrite` call includes an item whose `status` is not one of `pending`,
  `in_progress`, `completed`, or `cancelled`
- **THEN** the tool call fails with an error and no rows for that session are modified

### Requirement: Tool results carry a structured metadata contract

The system SHALL attach a `metadata` payload to every `todowrite` and `todoread` result containing
`source`, `schemaVersion`, `sessionID`, `revision`, the full current `todos` array, a `counts`
summary by status, and boolean `listCreated`, using the same shape for both tools.

#### Scenario: todowrite result includes metadata

- **WHEN** `todowrite` completes successfully
- **THEN** its result's `metadata` includes `source`, `schemaVersion`, `sessionID`, `revision`,
  `todos`, `counts`, and boolean `listCreated` fields describing the session's current list and write

#### Scenario: todoread result includes metadata

- **WHEN** `todoread` completes successfully after a list was created
- **THEN** its result's `metadata` includes the same `source`, `schemaVersion`, `sessionID`,
  `revision`, `todos`, `counts`, and `listCreated` fields as `todowrite`'s result shape
- **AND** `listCreated` is false and the read leaves the stored todos and revision unchanged

### Requirement: Tool failures are surfaced to the model

The system SHALL rethrow any error encountered while executing `todowrite` or `todoread` after
logging it, so the failure is visible to the calling model rather than silently absorbed.

#### Scenario: Store failure surfaces as a tool error

- **WHEN** the underlying store raises an error while executing a `todowrite` or `todoread` call
- **THEN** the tool call fails and the model receives an error result rather than a silent
  success or an empty result

### Requirement: `todowrite` and `todoread` are gateable per agent

The system SHALL register `todowrite` and `todoread` under tool names usable as a `permissions`
action value, so an agent configuration can allow, ask, or deny either tool independently of other
agents.

#### Scenario: Denying todowrite for a specific agent

- **GIVEN** an agent configuration sets a `deny` effect for the `todowrite` action
- **WHEN** that agent attempts to call the `todowrite` tool
- **THEN** the call is denied per the configured permission, consistent with how any other
  permission-gated action is denied

### Requirement: `todowrite` defaults an omitted status to pending

The system SHALL default a submitted todo item's `status` to `pending` when the item omits the
`status` field, rather than rejecting the write, while continuing to reject an explicitly supplied
value outside the fixed set (`pending`, `in_progress`, `completed`, `cancelled`).

#### Scenario: Omitted status defaults to pending

- **WHEN** a `todowrite` call includes an item with no `status` field
- **THEN** the tool call succeeds and the item is stored with `status` set to `pending`

#### Scenario: Explicit invalid status is still rejected

- **WHEN** a `todowrite` call includes an item whose `status` field is present but not one of
  `pending`, `in_progress`, `completed`, or `cancelled`
- **THEN** the tool call fails with an error and no rows for that session are modified

### Requirement: `todowrite` accepts explicit fresh-list intent

The system SHALL accept an optional boolean `freshList` flag on `todowrite`, with omission equivalent to false, and reject supplied non-boolean values before modifying session state.

#### Scenario: Invalid fresh-list flag is rejected before mutation

- **GIVEN** a session has an existing list and revision
- **WHEN** `todowrite` receives a supplied non-boolean `freshList`
- **THEN** the call fails and the stored todos and revision remain unchanged

### Requirement: `todowrite` reports list creation independently of statuses

The system SHALL report `listCreated` true for a successful non-empty write exactly when the pre-write list has no non-archived items or `freshList` is true; otherwise it reports false. Completed and cancelled non-archived items count as an existing list. Archived-ID rejection produces no successful creation result.

#### Scenario: Initial mixed-status list reports creation

- **GIVEN** the session has no non-archived todos
- **WHEN** a non-empty list containing an in-progress item is written with `freshList` omitted or false
- **THEN** `listCreated` is true

#### Scenario: Ordinary non-empty updates do not report creation

- **GIVEN** the session has a non-empty list
- **WHEN** ordinary successful writes change statuses, add or remove items, reorder items, repeat the list, or replace all items without `freshList: true`
- **THEN** each result reports `listCreated` false, including all-pending writes and writes following completed or cancelled lists

#### Scenario: Explicit fresh list can carry existing items

- **GIVEN** the session has a non-empty list with an unfinished item
- **WHEN** `todowrite` writes a non-empty list with `freshList: true` retaining that item's ID
- **THEN** `listCreated` is true and the carried item's identity and existing timestamp semantics are preserved

#### Scenario: Repeated explicit fresh writes report creation

- **GIVEN** the session has a non-empty list
- **WHEN** the same unchanged list is written repeatedly with `freshList: true`
- **THEN** each successful result reports `listCreated` true

#### Scenario: Empty writes do not report creation

- **WHEN** an empty list is written with `freshList` omitted, false, or true
- **THEN** `listCreated` is false and normal omission archival and revision increment behavior applies

#### Scenario: Non-empty list after clearing reports creation

- **GIVEN** the session's active list was cleared and its former items remain archived
- **WHEN** a non-empty list with no same-session archived IDs is successfully written without explicit fresh intent
- **THEN** `listCreated` is true regardless of archived history

### Requirement: Archived-ID failures provide actionable recovery

The system SHALL surface a same-session archived-ID write failure as a tool error identifying the stale ID and advising use of a current item ID or omission of the ID, without a successful metadata result.

#### Scenario: Archived-ID error preserves the list and supports ordinary recovery

- **GIVEN** a session has a non-empty active list and an archived item
- **WHEN** `todowrite` receives that archived ID
- **THEN** the tool fails with an error naming the ID and advising use of a current item ID or omission of the ID
- **AND** the stored list and revision remain unchanged and no successful metadata is returned
- **WHEN** the caller reads the current list and resubmits the full intended list with current IDs or without the stale ID, without fresh intent
- **THEN** the write succeeds and `listCreated` is false

### Requirement: Visible tool results are reusable JSON arrays

The system SHALL return compact JSON in the model-visible `content` of successful `todowrite` and `todoread` results, representing the current non-archived todos in list order using only `id`, `content`, `status`, and optional `priority` fields. Null priority is omitted; other priority strings are retained.

#### Scenario: Both tools expose current todos as writable JSON

- **GIVEN** a list contains todos with null, empty-string, and non-empty priorities
- **WHEN** `todowrite` returns the list and `todoread` reads it
- **THEN** each visible result parses to the current ordered array with the exact stable IDs, content, statuses, and writable priorities
- **AND** null priority is omitted, empty-string priority is retained, and timestamps and position are absent from visible output
- **AND** the structured metadata contract remains unchanged

#### Scenario: Empty lists return an empty JSON array

- **WHEN** either tool successfully returns an empty list
- **THEN** its visible `content` is exactly `[]`

### Requirement: Visible JSON preserves exact strings

The system SHALL preserve the exact stored ID and content strings when the visible JSON from either tool is parsed.

#### Scenario: Escaped IDs and content survive JSON output

- **GIVEN** todos have IDs and content containing whitespace, quotes, backslashes, newlines, and Unicode
- **WHEN** either tool returns the list
- **THEN** the visible result is valid JSON whose parsed strings equal the stored strings without inventing or transforming IDs

### Requirement: Visible IDs support identity-preserving updates

The system SHALL allow a caller to reuse a parsed visible array as the `todos` input for an ordinary update, preserving stable identity and existing creation and completion timestamp semantics.

#### Scenario: Visible read and write output supports renamed updates

- **GIVEN** a list contains an unfinished todo and an already completed todo
- **WHEN** a caller parses either tool's visible output, renames items using their returned IDs, and submits the full array with the unfinished item marked completed
- **THEN** each item retains its ID and creation timestamp, the already completed item retains its completion timestamp, and the newly completed item receives a completion timestamp
- **AND** a subsequent unchanged update preserves both completion timestamps and `listCreated` remains false
