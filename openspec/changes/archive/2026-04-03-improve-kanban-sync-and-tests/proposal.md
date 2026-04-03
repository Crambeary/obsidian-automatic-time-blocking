## Why

The current Kanban coverage protects basic parsing and card moves, but it does not yet protect the user-facing flows that matter most for trust: stable planner-to-source connection, safe handling of duplicate same-board cards, predictable reopen behavior, and resilient sync when boards evolve. This change is needed now because the Kanban integration is already user-facing, and the next round of improvements should define both the expected UX and the tests that keep it reliable.

## What Changes

- Define the expected Kanban sync behavior for planner generation, completion sync, reopen sync, and duplicate-card handling.
- Add explicit requirements for preserving source connection when multiple cards in the same Kanban board have identical visible text.
- Define safe fallback behavior when a remembered reopen column or configured reopen target is no longer available.
- Expand Kanban test coverage to protect the main user flows around parsing, planning intake, completion sync, reopen sync, duplicate reduction, and footer or metadata boundaries.
- Clarify how ambiguity should be handled when planner-visible text is insufficient to uniquely identify a same-board Kanban source card.

## Capabilities

### New Capabilities
- `kanban-sync-reliability`: Defines user-visible requirements for stable Kanban planner/source connection, duplicate same-board card handling, reopen fallback behavior, and ambiguity safety.
- `kanban-user-experience-tests`: Defines the required behavioral coverage for Kanban parsing, planning intake, completion sync, reopen sync, duplicate-card scenarios, and mixed-content board notes.

### Modified Capabilities
- None.

## Impact

- Affected code: `src/kanban.ts`, Kanban-related logic in `src/main.ts`, and Kanban-focused tests in `tests/`.
- Affected systems: planner generation, completion sync mappings, Kanban source parsing, Kanban card move behavior, and plugin test harness coverage.
- No dependency changes are expected.
