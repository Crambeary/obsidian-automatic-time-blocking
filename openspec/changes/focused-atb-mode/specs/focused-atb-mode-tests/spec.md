## ADDED Requirements

### Requirement: Focused-mode coverage SHALL protect planner-intake boundaries

The project SHALL maintain automated coverage for focused-mode planner generation so broader task-source scans do not silently return when the mode is enabled.

#### Scenario: Focused mode excludes configured external markdown sources in tests

- **WHEN** automated tests generate a planner note with focused mode enabled and configured external markdown sources present
- **THEN** the tests verify that tasks from those external markdown sources are not included in planner output

#### Scenario: Focused mode excludes configured Kanban sources in tests

- **WHEN** automated tests generate a planner note with focused mode enabled and configured Kanban boards present
- **THEN** the tests verify that Kanban-derived tasks are not included in planner output

#### Scenario: Focused mode keeps eligible active-note tasks in tests

- **WHEN** automated tests generate a planner note with focused mode enabled and the currently open daily note contains eligible tasks
- **THEN** the tests verify that those active-note tasks still appear in planner output

### Requirement: Focused-mode coverage SHALL protect filter and status interactions

The project SHALL maintain automated coverage for the interaction between focused mode and existing planner task filters.

#### Scenario: Focused mode still respects task status selection in tests

- **WHEN** automated tests run planner generation with focused mode enabled and task-status settings that exclude one or more statuses
- **THEN** the tests verify that active-note tasks with excluded statuses are not collected

#### Scenario: Focused mode still respects include and exclude text filters in tests

- **WHEN** automated tests run planner generation with focused mode enabled and text-based task filters configured
- **THEN** the tests verify that the remaining active-note tasks are filtered using the same include and exclude rules as standard planner generation
