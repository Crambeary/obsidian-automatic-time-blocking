## MODIFIED Requirements

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
