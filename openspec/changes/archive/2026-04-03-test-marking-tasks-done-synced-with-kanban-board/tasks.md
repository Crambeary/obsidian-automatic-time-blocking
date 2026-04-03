## 1. Fixture and regression coverage

- [x] 1.1 Add or update a kanban fixture that includes the trailing `%% kanban:settings` footer and fenced JSON block from the reported bug shape.
- [x] 1.2 Add a regression test for marking a planner-synced kanban card done on the footer/settings fixture.

## 2. Strengthen kanban movement assertions

- [x] 2.1 Update kanban move assertions to re-parse updated board content and verify the moved card remains discoverable in the expected column with the expected checkbox state.
- [x] 2.2 Add a boundary assertion that fails if the moved card is inserted below the kanban footer/settings marker.
- [x] 2.3 Preserve or extend reopen coverage so the same card remains parseable when moved back into an active column.

## 3. Validate locally

- [x] 3.1 Run the local kanban test suite and confirm the new regression coverage fails before the fix and passes after the implementation change.
- [x] 3.2 Review fixture and assertion messages to ensure failures clearly identify when a card leaves the board's parseable region.
