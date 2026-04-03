## Purpose

Define the behavioral coverage required to protect Kanban planner intake, completion sync, reopen sync, duplicate-card handling, and mixed-content board parsing boundaries.

## ADDED Requirements

### Requirement: Kanban coverage SHALL protect planner intake and sync user flows
The project SHALL maintain automated behavioral coverage for the Kanban user flows that most affect trust in planner generation and completion sync.

#### Scenario: Active planning columns are covered by tests
- **WHEN** Kanban cards are extracted for planning from a configured board
- **THEN** automated tests cover inclusion of active columns and exclusion of non-planned columns such as backlog-style or done columns

#### Scenario: Planner-to-done sync is covered by tests
- **WHEN** a planner task generated from a Kanban card is completed
- **THEN** automated tests cover moving the source card to the resolved done column and updating checkbox state accordingly

#### Scenario: Planner reopen sync is covered by tests
- **WHEN** a completed planner task generated from a Kanban card is reopened
- **THEN** automated tests cover moving the source card back to the resolved reopen destination and restoring active checkbox state accordingly

### Requirement: Kanban coverage SHALL protect duplicate and ambiguity scenarios
The project SHALL maintain automated coverage for duplicate-card and ambiguity scenarios so that same-board duplicate cards do not regress silently.

#### Scenario: Duplicate same-board cards are covered by tests
- **WHEN** a Kanban board contains multiple cards with identical visible text in the same board
- **THEN** automated tests cover extraction, planner connection, and source updates for those cards without collapsing them into one behavioral case

#### Scenario: Ambiguous source identity handling is covered by tests
- **WHEN** the system encounters planner-driven Kanban updates that cannot be safely resolved to a unique same-board source card
- **THEN** automated tests cover the safe behavior that avoids moving an unintended card

### Requirement: Kanban coverage SHALL protect mixed-content board parsing boundaries
The project SHALL maintain automated coverage for board parsing boundaries so that board notes with metadata or non-card content do not create false planner tasks or invalid move targets.

#### Scenario: Settings footer boundaries are covered by tests
- **WHEN** a board includes a `%% kanban:settings` footer
- **THEN** automated tests cover parsing and card moves that keep board content above the footer and ignore footer content as task input

#### Scenario: Code fence boundaries are covered by tests
- **WHEN** a board note contains fenced code blocks or other non-board sections
- **THEN** automated tests cover ignoring those sections during card extraction

#### Scenario: Board configuration fallback behavior is covered by tests
- **WHEN** configured active, done, or reopen columns do not match the board's current columns
- **THEN** automated tests cover the expected fallback behavior for intake and sync resolution
