## Purpose

Define the user-visible reliability requirements for Kanban planner/source connection, duplicate same-board card handling, reopen fallback behavior, and ambiguity-safe sync.

## ADDED Requirements

### Requirement: Kanban planner sync SHALL preserve same-board source identity
The system SHALL preserve a stable planner-to-source connection for Kanban cards so that completion and reopen sync target the intended source card even when multiple cards in the same board have identical visible text.

#### Scenario: Duplicate same-board cards are planned independently
- **WHEN** a Kanban board contains multiple active cards with identical visible text in the same board
- **THEN** the system creates independently syncable planner representations for each card without collapsing them into one source connection

#### Scenario: Planner completion targets the intended duplicate card
- **WHEN** a user completes one planner task generated from a Kanban board that has another same-board card with identical visible text
- **THEN** the system marks only the intended source card as completed and leaves the other duplicate card unchanged

#### Scenario: Planner reopen targets the intended duplicate card
- **WHEN** a user reopens one planner task generated from a completed Kanban card and another same-board card still has identical visible text
- **THEN** the system reopens only the intended source card and preserves the other duplicate card's state

### Requirement: Kanban reopen behavior SHALL use predictable fallback rules
The system SHALL reopen Kanban cards using a deterministic fallback order so that planner-driven reopen actions remain predictable when board configuration or column structure changes.

#### Scenario: Reopen returns to remembered active column
- **WHEN** a planner task reopens a Kanban card whose most recent active column is still available in the board
- **THEN** the system moves the card back to that remembered active column

#### Scenario: Reopen falls back to configured reopen column
- **WHEN** a planner task reopens a Kanban card whose remembered active column is unavailable and the configured reopen column exists in the board
- **THEN** the system moves the card to the configured reopen column

#### Scenario: Reopen falls back to the first available active column
- **WHEN** a planner task reopens a Kanban card whose remembered active column and configured reopen column are both unavailable
- **THEN** the system moves the card to the first available active column inferred or configured for that board

#### Scenario: Reopen is skipped when no valid destination exists
- **WHEN** a planner task reopens a Kanban card and the board has no valid reopen destination
- **THEN** the system leaves the board unchanged and does not move the card to an unrelated column

### Requirement: Kanban sync SHALL fail safely when planner-visible identity is ambiguous
The system SHALL avoid unsafe source updates when planner-visible text is insufficient to uniquely resolve a same-board Kanban source card.

#### Scenario: Ambiguous sync does not move the wrong card
- **WHEN** the system cannot safely distinguish between multiple same-board source cards for a planner-driven Kanban update
- **THEN** the system SHALL not move a different card as a fallback

#### Scenario: Ambiguous sync remains observable for debugging
- **WHEN** the system skips a planner-driven Kanban update because source identity is ambiguous
- **THEN** the system records the ambiguity in its existing debug or diagnostic path so the behavior is diagnosable
