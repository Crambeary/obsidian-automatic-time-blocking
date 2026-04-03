## Why

Configured Kanban boards are currently interpreted through both the generic markdown task intake path and the Kanban-specific intake path, which can surface the same underlying work item twice in planner output. This change is needed now because Kanban boards should have a single authoritative intake model, and duplicate planner entries undermine trust in task collection.

## What Changes

- Define that notes configured as Kanban board sources are excluded from generic markdown and external task discovery intake.
- Clarify that configured Kanban boards are authoritative as Kanban sources and must not also contribute generic markdown task entries.
- Add behavioral coverage for preventing duplicate planner entries when a configured Kanban board is also present in external note, folder, or Dataview-backed discovery scope.
- Preserve current planner generation and Kanban sync behavior for configured boards while removing dual-intake duplication.

## Capabilities

### New Capabilities
- `kanban-source-exclusion`: Defines the source-intake rules that exclude configured Kanban boards from generic markdown discovery and planning-note task collection.
- `kanban-intake-deduplication-tests`: Defines the behavioral coverage required to ensure configured Kanban boards do not appear twice through mixed intake paths.

### Modified Capabilities
- `kanban-user-experience-tests`: Expands Kanban behavioral coverage to include exclusion and deduplication behavior when board files overlap with markdown discovery scope.

## Impact

- Affected code: task collection and external discovery logic in `src/main.ts`, plus Kanban-related tests in `tests/`.
- Affected systems: active-note task collection, external markdown task discovery, Dataview-backed discovery, Kanban board intake, and planner output generation.
- No dependency changes are expected.
