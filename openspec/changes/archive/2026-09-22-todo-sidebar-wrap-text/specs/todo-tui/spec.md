# Spec Delta

## ADDED Requirements

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
