# todo-storage Specification

## Purpose
Durable, per-session storage of an ordered todo list with stable item identity, soft-delete
archival, and versioned schema migrations, so a todo list and its history survive restarts,
concurrent writers, and future schema changes without data loss.

## Requirements

### Requirement: Todos persist per session across restarts
The system SHALL persist each session's todo list in a durable on-disk store that survives an
opencode server restart.

#### Scenario: List survives a restart
- **WHEN** a session has a todo list written via `todowrite` and the opencode server process is
  restarted
- **THEN** a subsequent `todoread` for that session returns the same list it held before the
  restart

### Requirement: Item identity is preserved across writes
The system SHALL match incoming todo items against existing rows for the same session by `id`
first, then by exact `content` string for any incoming item with no `id`, before treating a
remaining unmatched item as new.

#### Scenario: Matching item by id preserves its history
- **GIVEN** a session has an existing todo item with a known `id`, `created_at`, and `status`
- **WHEN** a write includes that same `id` with an unchanged `content` and `status`
- **THEN** the stored item's `created_at` is unchanged and no new row is created

#### Scenario: Id-less item recovered by content match
- **GIVEN** a session has an existing todo item with a known `created_at`
- **WHEN** a write includes an item with no `id` but identical `content` to that existing item
- **THEN** the write is treated as an update to the existing item, not the creation of a new one,
  and the existing `created_at` is preserved

#### Scenario: Genuinely new item is created
- **WHEN** a write includes an item whose `id` (if present) and `content` match no existing
  non-archived row for that session
- **THEN** a new row is created for that item with a freshly minted `id` if none was supplied

### Requirement: Completion timestamps are tracked across status transitions
The system SHALL set an item's `completed_at` timestamp when its status transitions into
`completed`, clear `completed_at` when its status transitions out of `completed`, and leave
`completed_at` unchanged when a write repeats an already-`completed` item's status.

#### Scenario: Completing an item stamps completed_at
- **GIVEN** an existing item with status `pending` and no `completed_at`
- **WHEN** a write changes that item's status to `completed`
- **THEN** the stored item's `completed_at` is set to the time of that write

#### Scenario: Reopening a completed item clears completed_at
- **GIVEN** an existing item with status `completed` and a set `completed_at`
- **WHEN** a write changes that item's status to `pending` or `in_progress`
- **THEN** the stored item's `completed_at` is cleared

#### Scenario: Repeated completed status preserves completed_at
- **GIVEN** an existing item with status `completed` and a set `completed_at`
- **WHEN** a write repeats that item with status still `completed`
- **THEN** the stored item's `completed_at` is unchanged

### Requirement: Items removed from a write are archived, not deleted
The system SHALL mark a session's existing item as archived (setting `archived_at`) rather than
deleting its row when a subsequent write for that session no longer includes that item, and SHALL
exclude archived items from all read results.

#### Scenario: Dropped item is archived not deleted
- **GIVEN** a session has an existing non-archived item
- **WHEN** a write for that session omits that item
- **THEN** the item's row remains in the store with `archived_at` set, and it is excluded from the
  result of a subsequent `todoread` for that session

### Requirement: Store rejects an unknown schema version
The system SHALL record a schema version marker on the database and SHALL refuse to open a
database whose marker is newer than the version the running code understands, reporting a clear
error instead of operating on an unrecognised schema.

#### Scenario: Newer schema version is refused
- **GIVEN** a database file whose schema version marker is higher than the current code's known
  version
- **WHEN** the plugin attempts to open that database
- **THEN** the store refuses to open it and surfaces a clear diagnostic error, rather than reading
  or writing rows against the unrecognised schema

### Requirement: Database location is configurable
The system SHALL resolve the database file path from an explicit configuration option or
environment variable when provided, and SHALL otherwise default to a fixed path under the user's
XDG data directory.

#### Scenario: Default path used when unconfigured
- **WHEN** no database path option or environment variable is set
- **THEN** the store opens its database at the default path under the user's XDG data directory

#### Scenario: Explicit path overrides the default
- **WHEN** a database path is supplied via plugin configuration or environment variable
- **THEN** the store opens its database at that supplied path instead of the default

### Requirement: Item order and write revision are tracked
The system SHALL persist each item's position from the order of the array supplied to a write,
replacing any previously stored order for that session, and SHALL increment a per-session
revision counter on every write to that session.

#### Scenario: Item order reflects the most recent write
- **GIVEN** a session's todo list was previously written in one order
- **WHEN** a subsequent write supplies the same items in a different order
- **THEN** a read for that session returns the items in the order of the most recent write

#### Scenario: Revision increments on every write
- **WHEN** a session receives two or more writes
- **THEN** each write's returned revision is exactly one greater than the previous write's
  revision for that session
