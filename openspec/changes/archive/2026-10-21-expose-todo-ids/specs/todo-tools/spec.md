# Spec Delta

## ADDED Requirements

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
