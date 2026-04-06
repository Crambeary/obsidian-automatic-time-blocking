## MODIFIED Requirements

### Requirement: Kanban coverage SHALL protect planner intake and sync user flows
The project SHALL maintain automated behavioral coverage for the Kanban user flows that most affect trust in planner generation and completion sync, including the planner-intake boundaries applied when focused mode is enabled.

#### Scenario: Active planning columns are covered by tests
- **WHEN** Kanban cards are extracted for planning from a configured board
- **THEN** automated tests cover inclusion of active columns and exclusion of non-planned columns such as backlog-style or done columns

#### Scenario: Planner-to-done sync is covered by tests
- **WHEN** a planner task generated from a Kanban card is completed
- **THEN** automated tests cover moving the source card to the resolved done column and updating checkbox state accordingly

#### Scenario: Planner reopen sync is covered by tests
- **WHEN** a completed planner task generated from a Kanban card is reopened
- **THEN** automated tests cover moving the source card back to the resolved reopen destination and restoring active checkbox state accordingly

#### Scenario: Focused mode suppresses Kanban intake in tests
- **WHEN** planner generation runs with focused mode enabled and configured Kanban board sources are present
- **THEN** automated tests cover that Kanban cards are not collected into planner output for that run
