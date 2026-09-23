# todo-tui Specification

## Purpose
A read-only sidebar component in the opencode V2 terminal UI that shows the focused session's
todo list, updates live as the list changes, and stays out of the way when there is nothing to
show — restoring the V1 experience of seeing an agent's plan at a glance.

## Requirements

### Requirement: Sidebar renders the focused session's todo list

The system SHALL render the currently focused session's non-archived todo list in a sidebar
component, sourcing the data over the RPC domain rather than reading the database directly, except
that while the Todos section is collapsed, individual items SHALL NOT be rendered — only the
header and its collapsed summary are shown.

#### Scenario: Sidebar shows the focused session's items

- **GIVEN** the focused session has one or more non-archived todo items
- **WHEN** the sidebar component renders
- **THEN** it displays those items sourced from an RPC call to the server plugin, not from a
  direct database read

#### Scenario: Individual items are hidden while the section is collapsed

- **GIVEN** the focused session has more than 2 non-archived todo items and the Todos section is
  collapsed
- **WHEN** the sidebar component renders
- **THEN** individual todo items are not rendered, and only the header with its collapsed summary
  is shown

### Requirement: Sidebar updates without polling
The system SHALL update the rendered todo list when the server plugin emits a change notification
for the currently focused session, without the sidebar issuing tight-loop polling requests in
place of that event. The system SHALL additionally re-fetch the list on a bounded, infrequent
(30-second) reconciliation interval, running alongside the change-notification path, so that a
silently dropped or missed change notification does not leave the sidebar stale indefinitely.

#### Scenario: List updates on a change notification
- **GIVEN** the sidebar is displaying a focused session's todo list
- **WHEN** the server plugin emits a change notification for that session
- **THEN** the sidebar re-fetches and displays the updated list without waiting on any polling
  interval

#### Scenario: Safety-net reconciliation recovers from a missed change notification
- **GIVEN** the sidebar has received no change notification for the focused session for the
  duration of the reconciliation interval
- **WHEN** that interval elapses
- **THEN** the sidebar re-fetches and displays the current list, recovering even if the change
  notification that should have triggered the update was never received

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

### Requirement: Sidebar supports collapsing and expanding the todo list

The system SHALL let the user collapse and expand the Todos section via a clickable header when
the focused session has more than 2 non-archived todo items, and SHALL persist the section's
open/closed state across TUI restarts.

#### Scenario: No collapse toggle at 2 or fewer items

- **GIVEN** the focused session has 2 or fewer non-archived todo items
- **WHEN** the sidebar renders the Todos header
- **THEN** no collapse/expand triangle is shown, the header is not clickable to toggle, and the
  full item list is always displayed

#### Scenario: Collapse toggle appears and the header becomes clickable beyond 2 items

- **GIVEN** the focused session has more than 2 non-archived todo items
- **WHEN** the sidebar renders the Todos header
- **THEN** a collapse/expand triangle is shown before the header label, and clicking the header row
  toggles the section between collapsed and expanded

#### Scenario: Collapsed section shows an ordered, non-zero status-count summary

- **GIVEN** the Todos section is collapsed and the focused session has a mix of pending,
  in-progress, completed, and cancelled todo items
- **WHEN** the sidebar renders the Todos header
- **THEN** it displays an inline summary listing only the non-zero status counts, in the fixed
  order pending, in progress, completed, cancelled, using the labels "pending", "in progress",
  "done", and "cancelled" respectively

#### Scenario: Collapsed/expanded state persists across TUI restarts

- **GIVEN** the user has toggled the Todos section to collapsed
- **WHEN** the TUI is restarted and the sidebar renders again
- **THEN** the Todos section renders collapsed, reflecting the persisted state rather than
  reverting to expanded

#### Scenario: Section defaults to expanded on first use

- **GIVEN** no prior collapse/expand state has been persisted for the Todos section
- **WHEN** the sidebar renders the Todos section for the first time
- **THEN** the section renders expanded, showing the full item list
