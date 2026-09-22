# todo-tui Specification

## Purpose
A read-only sidebar component in the opencode V2 terminal UI that shows the focused session's
todo list, updates live as the list changes, and stays out of the way when there is nothing to
show — restoring the V1 experience of seeing an agent's plan at a glance.

## Requirements

### Requirement: Sidebar renders the focused session's todo list
The system SHALL render the currently focused session's non-archived todo list in a sidebar
component, sourcing the data over the RPC domain rather than reading the database directly.

#### Scenario: Sidebar shows the focused session's items
- **GIVEN** the focused session has one or more non-archived todo items
- **WHEN** the sidebar component renders
- **THEN** it displays those items sourced from an RPC call to the server plugin, not from a
  direct database read

### Requirement: Sidebar updates without polling
The system SHALL update the rendered todo list when the server plugin emits a change notification
for the currently focused session, without the sidebar issuing periodic polling requests.

#### Scenario: List updates on a change notification
- **GIVEN** the sidebar is displaying a focused session's todo list
- **WHEN** the server plugin emits a change notification for that session
- **THEN** the sidebar re-fetches and displays the updated list without waiting on any polling
  interval

### Requirement: Sidebar hides when the list is empty
The system SHALL render no visible sidebar content — no placeholder box or heading — when the
focused session has zero non-archived todo items.

#### Scenario: Empty list renders nothing
- **GIVEN** the focused session has zero non-archived todo items
- **WHEN** the sidebar component renders
- **THEN** no todo panel, heading, or placeholder is shown in the sidebar for that session

### Requirement: Sidebar degrades to an inline error on RPC failure
The system SHALL render a single-line inline error inside the sidebar slot when the RPC call to
fetch todo data fails, and SHALL NOT allow that failure to propagate out of the component.

#### Scenario: RPC failure shows inline error, not a crash
- **WHEN** the RPC call to fetch the focused session's todo list fails
- **THEN** the sidebar slot displays a single-line inline error and the rest of the terminal
  interface continues to function normally

### Requirement: TUI reads todo data only through the RPC domain
The system SHALL NOT open the SQLite database file directly from the TUI process; all todo data
read by the TUI component SHALL be obtained through the server plugin's RPC domain.

#### Scenario: TUI has no direct database access
- **WHEN** the TUI component needs the focused session's todo data
- **THEN** it obtains that data exclusively through an RPC call to the server plugin, with no
  direct file-based access to the SQLite database

### Requirement: Sidebar wraps long todo text instead of hard-truncating it
The system SHALL word-wrap each todo item's content across up to 2 lines in the sidebar, and SHALL
only fall back to an ellipsis-terminated truncation when the content still does not fit within
those 2 lines.

#### Scenario: Long todo text wraps across two lines
- **GIVEN** a todo item whose content is longer than the sidebar's line width but fits within 2
  wrapped lines
- **WHEN** the sidebar renders that item
- **THEN** the full content is displayed, wrapped at word boundaries across 2 lines, with no
  ellipsis

#### Scenario: Extremely long todo text truncates after two lines
- **GIVEN** a todo item whose content does not fit within 2 wrapped lines
- **WHEN** the sidebar renders that item
- **THEN** the content wraps across the first 2 lines and the remainder is truncated with an
  ellipsis at the end of the 2nd line

### Requirement: Sidebar visually distinguishes cancelled todo items
The system SHALL render a cancelled todo item's content using the muted theme text color and a
strikethrough text attribute, distinguishing it from pending, in-progress, and completed items.

#### Scenario: Cancelled item is rendered gray and struck through
- **GIVEN** a todo item with status `cancelled`
- **WHEN** the sidebar renders that item
- **THEN** its content is displayed in the muted theme text color with a strikethrough attribute

#### Scenario: Non-cancelled items are unaffected
- **GIVEN** a todo item with status `pending`, `in_progress`, or `completed`
- **WHEN** the sidebar renders that item
- **THEN** its content is displayed in the base theme text color with no strikethrough attribute
