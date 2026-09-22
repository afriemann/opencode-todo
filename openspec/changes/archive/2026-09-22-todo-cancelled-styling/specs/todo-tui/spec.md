# Spec Delta

## ADDED Requirements

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
