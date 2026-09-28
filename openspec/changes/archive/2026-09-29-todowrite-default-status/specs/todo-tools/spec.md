# Spec Delta

## ADDED Requirements

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
