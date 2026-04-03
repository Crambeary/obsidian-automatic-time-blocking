## Why

Marking a planner-synced kanban task as done can move the card below the kanban settings footer, which causes the card to stop being parsed and rendered in any column even though the markdown still contains the task. We need focused regression coverage now so local testing catches this parsing regression before changes ship.

## What Changes

- Add regression coverage for marking planner-synced kanban tasks done when the board includes a kanban settings footer block.
- Verify that moving a synced kanban card to `Done` keeps the card within the board's parseable column region rather than appending it after the footer/settings block.
- Replace string-only assertions with parse-based assertions that confirm the moved card remains discoverable in the expected column after synchronization.
- Add a representative kanban fixture that mirrors the Obsidian Kanban footer/settings layout seen in real boards.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `local-plugin-test-harness`: Local test workflows should catch kanban board sync regressions where done-state moves place cards outside the board's parseable column region, including boards with footer/settings blocks.

## Impact

- Affected code: `tests/kanban.test.js`, kanban board fixtures under `tests/fixtures/`, and any related local test runner workflow.
- Affected systems: kanban parsing and card movement behavior exercised by local automated tests.
- Expected result: local automated tests fail if a moved kanban card is placed below the kanban settings/footer and is no longer parsed into a board column.
- No API or dependency changes are expected.
