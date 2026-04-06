## Why

Automatic Time Blocking currently pulls candidate work from the active planning note, configured external markdown sources, and configured Kanban boards, which makes it easy for planner generation to reach beyond the current day’s intended scope. This change is needed so users can enable a focused mode that keeps Automatic Time Blocking centered on the currently open daily note without scanning broader vault task sources.

## What Changes

- Add a focused Automatic Time Blocking mode setting that limits planner intake to the currently open daily note only.
- Define that focused mode disables broad external task discovery so planner generation does not scan configured external notes, folders, or Dataview-indexed markdown files while the mode is enabled.
- Define that focused mode does not pull tasks from configured Kanban board sources.
- Add behavioral coverage for focused-mode planner generation, including the daily-note-only boundary, skipped external discovery, skipped Kanban intake, and interactions with existing task filters and status selection.

## Capabilities

### New Capabilities

- `focused-atb-mode`: Defines the focused planner-intake behavior that constrains Automatic Time Blocking to the currently open daily note and suppresses all non-active-note source scanning.
- `focused-atb-mode-tests`: Defines the behavioral coverage required to protect focused-mode planner generation and source-selection boundaries.

### Modified Capabilities

- `kanban-user-experience-tests`: Expands planner-intake coverage to include the focused-mode behavior for configured Kanban board sources.

## Impact

- Affected code: planner task collection, external task discovery selection, Kanban intake selection, settings persistence, and settings UI in `src/main.ts`.
- Affected systems: planner generation, built-in external task discovery, Dataview-backed discovery fallback, configured Kanban board intake, and automated tests in `tests/`.
- No dependency changes are expected.
