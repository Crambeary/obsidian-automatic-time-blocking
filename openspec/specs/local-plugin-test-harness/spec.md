## Purpose

Define the local harness expectations for exercising core Automatic Time Blocking behavior outside a full Obsidian session.

## Requirements

### Requirement: Harness can execute core plugin flows against mocked vault state

The project SHALL provide a local test harness that executes core Automatic Time Blocking behavior against mocked Obsidian-like state without launching the full Obsidian application.

#### Scenario: Generate time blocks from an active note fixture

- **WHEN** a test provides plugin settings, an active note, and any referenced vault notes through the harness
- **THEN** the harness must be able to invoke the planning flow and assert on the resulting note content and reported scheduling results

#### Scenario: Reproduce cross-note behavior from fixtures

- **WHEN** a test scenario includes source tasks in multiple notes and planner output in another note
- **THEN** the harness must support reading and writing all participating notes so cross-note planning and sync behavior can be verified deterministically

### Requirement: Harness exposes deterministic assertions for note mutations

The local test harness SHALL make note mutations observable in a deterministic form that supports debugging and regression tests.

#### Scenario: Assert rewritten planner section

- **WHEN** a planning run replaces or rebuilds a planner section in a note
- **THEN** the test must be able to compare the final note text against an expected result without relying on interactive inspection

#### Scenario: Assert completion sync side effects

- **WHEN** a completion-sync scenario updates one or more source tasks or planner tasks
- **THEN** the test must be able to inspect every affected note after the operation and verify the resulting task states

### Requirement: Harness supports characterization tests for current bugs

The project SHALL support converting manually discovered bugs into repeatable characterization tests before or during fixes. Characterization coverage for kanban synchronization regressions MUST be able to model realistic board fixtures, including footer/settings blocks, and verify outcomes through the same parsing path used by the plugin.

#### Scenario: Capture a reproduced bug as fixtures

- **WHEN** a bug is discovered from manual Obsidian testing
- **THEN** a developer must be able to encode the relevant vault state and settings as fixture data and reproduce the bug through the harness

#### Scenario: Verify moved kanban cards remain parseable after completion sync

- **WHEN** a characterization test marks a planner-synced kanban card as done on a board that contains a trailing kanban footer/settings block
- **THEN** the harness must allow the test to assert that the moved card remains discoverable in the expected `Done` column after re-parsing the updated board content

#### Scenario: Detect cards appended below the kanban footer

- **WHEN** a completion-sync operation moves a kanban card below the board's footer/settings marker instead of keeping it inside the destination column region
- **THEN** the characterization test must fail with assertions that detect the card is outside the board's parseable region
