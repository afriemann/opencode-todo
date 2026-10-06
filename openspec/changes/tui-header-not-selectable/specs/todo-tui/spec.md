# Spec Delta

## MODIFIED Requirements

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

#### Scenario: Header text is not selectable

- **GIVEN** the sidebar renders the Todos header, expanded or collapsed
- **WHEN** the user drags a text selection across the header row
- **THEN** the triangle, the "Todos" label, and the collapsed summary are not included in the
  selection, while todo item rows remain selectable
