# Spec Delta

## Purpose

Automatic cleanup that keeps the todo store from growing unbounded — archiving completed items
after a retention window and pruning todos belonging to sessions that no longer exist — without
ever risking live data through a false-positive liveness decision.

## ADDED Requirements

### Requirement: Deleted sessions' todos are archived reactively
The system SHALL archive all of a session's non-archived todo items when it observes a
session-deletion event for that session.

#### Scenario: Session deletion archives its todos
- **GIVEN** a session has one or more non-archived todo items
- **WHEN** the system observes a session-deletion event for that session's id
- **THEN** all of that session's non-archived todo items are archived

### Requirement: Orphaned sessions are pruned by an age-based sweep
The system SHALL periodically archive todo items belonging to sessions with no recent activity
beyond a configurable grace period, using elapsed time alone as the criterion, and SHALL NOT
perform a session-liveness lookup as part of this decision.

#### Scenario: Sweep archives an aged, inactive session's todos
- **GIVEN** a session's todo items have had no write activity for longer than the configured
  orphan grace period
- **WHEN** the opportunistic sweep runs
- **THEN** that session's non-archived todo items are archived

#### Scenario: Sweep performs no liveness lookup
- **WHEN** the opportunistic sweep evaluates which sessions' todos to archive
- **THEN** it makes its decision using only elapsed time since last activity, with no call to
  determine whether the session still exists

### Requirement: Completed items are auto-archived after a retention window
The system SHALL archive a todo item whose status is `completed` once its `completed_at`
timestamp is older than a configurable retention window.

#### Scenario: Completed item past the retention window is archived
- **GIVEN** a todo item with status `completed` and a `completed_at` older than the configured
  retention window
- **WHEN** the sweep runs
- **THEN** that item is archived

#### Scenario: Recently completed item is not archived
- **GIVEN** a todo item with status `completed` and a `completed_at` within the configured
  retention window
- **WHEN** the sweep runs
- **THEN** that item remains non-archived

### Requirement: Housekeeping intervals and windows are configurable
The system SHALL apply documented default values for the retention window, orphan grace period,
and sweep interval when no explicit configuration is supplied, and SHALL fall back to those
defaults with a logged warning when a supplied value is invalid.

#### Scenario: Defaults apply when unconfigured
- **WHEN** no retention window, orphan grace period, or sweep interval is configured
- **THEN** the system applies its documented default values for each

#### Scenario: Invalid configuration falls back to defaults
- **WHEN** a configured retention window, orphan grace period, or sweep interval is out of range
  or the wrong type
- **THEN** the system logs a warning and applies the documented default for that value instead of
  failing to start
