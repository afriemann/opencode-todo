# Spec Delta

## Purpose

Agent-facing tools, `todowrite` and `todoread`, that replicate opencode V1's todo tool names so a
model can maintain and read back a per-session todo list, with a structured result payload that
lets other plugins observe todo state without a bespoke integration.

## ADDED Requirements

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
`source`, `schemaVersion`, `sessionID`, `revision`, the full current `todos` array, and a `counts`
summary by status, using the same shape for both tools.

#### Scenario: todowrite result includes metadata
- **WHEN** `todowrite` completes successfully
- **THEN** its result's `metadata` includes `source`, `schemaVersion`, `sessionID`, `revision`,
  `todos`, and `counts` fields describing the session's current list

#### Scenario: todoread result includes metadata
- **WHEN** `todoread` completes successfully
- **THEN** its result's `metadata` includes the same `source`, `schemaVersion`, `sessionID`,
  `revision`, `todos`, and `counts` fields as `todowrite`'s result shape

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
