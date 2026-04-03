## 1. Kanban sync identity hardening

- [x] 1.1 Trace the current Kanban planner-to-source mapping flow in `src/main.ts` and identify where same-board duplicate cards can collapse into one planner fingerprint.
- [x] 1.2 Introduce a stronger Kanban-backed planner/source identity mechanism that preserves same-board duplicate card distinction without requiring visible lane labels in planner output.
- [x] 1.3 Update planner-driven Kanban completion and reopen sync to use the stronger Kanban identity when resolving source cards.
- [x] 1.4 Add safe handling for ambiguous Kanban planner/source matches so the plugin skips unsafe moves and records the ambiguity through the existing diagnostic path.

## 2. Reopen fallback behavior

- [x] 2.1 Verify and, if needed, tighten reopen resolution so it follows the required fallback order: remembered active column, configured reopen column, first available active column, otherwise no move.
- [x] 2.2 Ensure completion sync persists the correct last active Kanban column needed for predictable reopen behavior.
- [x] 2.3 Add targeted coverage for missing remembered columns, missing configured reopen columns, and no-valid-destination reopen cases.

## 3. Kanban behavioral test expansion

- [x] 3.1 Add low-level `tests/kanban.test.js` coverage for duplicate same-board cards, code-fence parsing boundaries, and board configuration fallback behavior.
- [x] 3.2 Add or extend harness-level tests to cover Kanban board intake into planner generation, planner-to-done sync, and planner reopen sync.
- [x] 3.3 Add regression tests ensuring same-board duplicate cards remain independently syncable through completion and reopen flows.
- [x] 3.4 Add tests that confirm mixed-content board notes keep cards above the settings footer and ignore non-card content as planner input.

## 4. Verification and cleanup

- [x] 4.1 Run the relevant test suite covering Kanban utilities and harness behavior, and fix any failures.
- [x] 4.2 Run the project build and confirm the Kanban sync changes do not regress existing planner behavior.
- [x] 4.3 Review any user-facing docs or debug messaging that should be updated to reflect the new Kanban reliability behavior.
