# Spec Delta

## MODIFIED Requirements

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
