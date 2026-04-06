## 1. Settings and planner-intake controls

- [x] 1.1 Add a persisted `focusedAtbMode` setting and default it to `false` in the plugin settings model.
- [x] 1.2 Add a focused-mode control to the task discovery settings UI with copy explaining that it keeps planner generation on the currently open daily note and ignores configured external markdown, Dataview, and Kanban task sources.
- [x] 1.3 Update planner task collection to bypass external markdown discovery and configured Kanban board intake when focused mode is enabled while preserving the currently open daily note behavior.

## 2. Behavioral coverage

- [x] 2.1 Add planner-generation tests that verify focused mode excludes configured external markdown sources and Dataview-backed discovery results.
- [x] 2.2 Add planner-generation tests that verify focused mode excludes configured Kanban board tasks while keeping eligible tasks from the currently open daily note.
- [x] 2.3 Add coverage that verifies focused mode still respects task status selection and include/exclude text filters for the active-note tasks that remain in scope.

## 3. Validation

- [x] 3.1 Run the focused-mode related test suite and confirm existing non-focused planner behavior remains unchanged by default.
- [ ] 3.2 Manually verify the new setting can be toggled, saved, and reapplied across plugin reloads without changing configured source lists.
