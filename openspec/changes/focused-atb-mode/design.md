## Context

Planner generation currently assembles tasks from three intake paths in `src/main.ts`: tasks parsed from the active planning note, tasks discovered from external markdown sources through either built-in scoped discovery or Dataview, and tasks collected from configured Kanban boards. Those additional source paths can broaden intake beyond the currently open daily note even when a user wants planner generation to stay tightly scoped.

The requested change is cross-cutting because it affects settings shape, settings UI, planner-intake branching, and automated coverage. The implementation should preserve existing behavior by default while introducing an explicit focused mode that users can enable without reconfiguring their broader source lists.

## Goals / Non-Goals

**Goals:**

- Add a persisted setting that lets users enable a focused Automatic Time Blocking mode.
- Make focused mode keep planner intake on the currently open daily note only instead of scanning broader vault task sources.
- Preserve current built-in and Dataview external discovery behavior when focused mode is disabled.
- Add tests that verify focused mode skips external markdown discovery and configured Kanban intake while still respecting existing task-status and text-filter settings for the tasks that remain in scope.

**Non-Goals:**

- Redesign task-date parsing or the planner scheduling algorithm.
- Remove or replace existing external discovery configuration.
- Introduce per-source focused-mode overrides in this change.
- Change completion sync behavior outside the planner-intake boundaries needed for focused mode.

## Decisions

### Decision: Represent focus as a dedicated boolean setting

Focused mode should be stored as a dedicated persisted boolean such as `focusedAtbMode` rather than overloading the existing external discovery mode. This keeps the meaning distinct: discovery mode chooses _how_ external markdown sources are resolved, while focused mode decides _whether_ broader non-active-note sources participate in planner intake at all.

Alternatives considered:

- Reuse `externalTaskDiscoveryMode` with an additional enum value. Rejected because it would mix source-resolution mechanics with user-intent scope control and would not naturally cover Kanban intake.
- Infer focus from empty external source lists. Rejected because users want to preserve broader source configuration for later use without losing it.

### Decision: Focused mode limits planner intake to active-note tasks

When focused mode is enabled, `collectTasksForPlanningNote` should only include tasks extracted from the currently open daily note. External markdown discovery and configured Kanban board intake should both return empty results and report zero source counts. This is the clearest interpretation of the requested focused mode because it prevents Automatic Time Blocking from pulling tasks from anywhere else in the vault solely because those sources were configured.

Alternatives considered:

- Continue including configured Kanban boards in focused mode. Rejected because Kanban cards are currently included even without planning-date markers, which would undermine the focused boundary.
- Continue including only externally discovered tasks whose dates match the planning day. Rejected because the user explicitly wants to avoid scanning the vault for arbitrary tasks in focused mode.

### Decision: Keep active-note date behavior unchanged

Focused mode should preserve the existing active-note filtering behavior inside the currently open daily note: active-note tasks with no date tokens remain eligible, while active-note tasks carrying date tokens must match the planning date. This avoids surprising users who keep their daily task list in the daily note itself.

Alternatives considered:

- Require explicit date markers for all focused-mode tasks. Rejected because it would narrow active-note behavior in a way the request does not require.

### Decision: Surface focused mode in settings near task discovery

The setting should be visible in the task-discovery section of the settings UI with copy that explains the trade-off: enabling focused mode keeps planner generation on the currently open daily note and ignores configured external notes, folders, Dataview discovery, and Kanban board sources. Positioning it near discovery settings makes the resulting behavior understandable without forcing users to inspect multiple sections.

Alternatives considered:

- Put the setting near general planner preferences. Rejected because its effects are primarily about source intake, not scheduling.

## Risks / Trade-offs

- [Users may expect Kanban boards to remain available in focused mode] → Mitigation: make the setting description explicit that focused mode ignores configured Kanban sources during planner intake.
- [Existing users could lose broader intake unexpectedly] → Mitigation: default the setting to disabled and leave current behavior unchanged unless users opt in.
- [Source counts or debug output may become misleading if branches are bypassed] → Mitigation: return explicit zero-count results for skipped discovery paths and add targeted tests for focused-mode collection results.
- [Future source types could forget to honor focused mode] → Mitigation: centralize the focused-mode branch inside planner task collection and cover the boundary with behavioral tests.

## Migration Plan

1. Add the new setting to the persisted settings interface and defaults with a disabled default.
2. Add the new setting control and explanatory copy in the settings UI.
3. Update planner task collection so focused mode bypasses external markdown and Kanban source collection while preserving the currently open daily note behavior.
4. Add tests for focused-mode intake boundaries and update relevant existing coverage to reflect the new option.
5. No content migration is required because the setting can safely default to `false` for existing users.

## Open Questions

- None at proposal time.
