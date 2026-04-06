## ADDED Requirements

### Requirement: Focused mode SHALL constrain planner intake to the active planning note

The system SHALL provide a focused Automatic Time Blocking mode that limits planner task collection to the currently open daily note only.

#### Scenario: Focused mode keeps undated active-note tasks eligible

- **WHEN** focused mode is enabled and the currently open daily note contains open tasks without explicit date tokens
- **THEN** planner generation includes those active-note tasks without scanning any other note or board source

#### Scenario: Focused mode preserves planning-day matching for dated active-note tasks

- **WHEN** focused mode is enabled and the currently open daily note contains tasks with explicit date tokens
- **THEN** planner generation includes only the dated tasks that match the planning date and excludes dated tasks for other days

### Requirement: Focused mode SHALL disable broad external source intake

The system SHALL ignore broader configured task sources during planner generation while focused mode is enabled.

#### Scenario: Built-in external markdown sources are skipped in focused mode

- **WHEN** focused mode is enabled and external source notes or folders are configured
- **THEN** planner generation does not read tasks from those configured markdown sources

#### Scenario: Dataview discovery is skipped in focused mode

- **WHEN** focused mode is enabled and Dataview discovery mode is selected
- **THEN** planner generation does not use Dataview-indexed markdown files as task sources

#### Scenario: Configured Kanban board sources are skipped in focused mode

- **WHEN** focused mode is enabled and Kanban board sources are configured
- **THEN** planner generation does not include tasks from those configured Kanban boards

### Requirement: Focused mode SHALL be opt-in and discoverable in settings

The system SHALL expose focused mode as a persisted planner-intake setting without changing the default planner-intake behavior for existing users.

#### Scenario: Existing users keep current intake behavior by default

- **WHEN** the plugin loads settings for a user who has not enabled focused mode
- **THEN** planner generation continues to use the existing active-note, external-source, and configured-Kanban intake behavior

#### Scenario: Settings explain the focused-mode boundary

- **WHEN** a user reviews the focused mode setting in plugin settings
- **THEN** the setting description explains that enabling focused mode keeps planner generation on the currently open daily note and ignores configured external markdown, Dataview, and Kanban task sources
