## Why

The current prototype supports task duration markers in the forms `[30m]` and `@30m`, with a default-duration fallback when no marker is present. That behavior works, but it is easy to forget because the syntax is not especially natural and older project references point to a different NotePlan-style duration model. A future enhancement should make task duration entry feel more intuitive without forcing users to memorize a single rigid marker format.

## What Changes

- Define a future natural-duration parsing model that accepts clearer, more human-friendly task duration syntax in addition to the current prototype behavior.
- Preserve a documented canonical syntax for user-facing guidance while allowing the parser to recognize common shorthand forms such as hour-based durations.
- Define precedence and ambiguity rules so natural-duration parsing remains predictable and does not accidentally interpret unrelated task text as a duration.
- Clarify which duration forms should be considered canonical, which should be compatibility syntax, and whether generated planner output should preserve the original marker text.
- Add behavioral coverage for natural-duration parsing across active-note tasks, external markdown tasks, and Kanban-derived tasks.

## Capabilities

### New Capabilities
- `natural-task-duration-syntax`: Define a user-friendly duration grammar for task text that can recognize common shorthand duration forms while keeping scheduling behavior predictable.
- `duration-parsing-compatibility-rules`: Define how canonical syntax, compatibility syntax, and ambiguous task text are resolved during duration parsing.

### Modified Capabilities
- `task-duration-parsing`: Expand the existing task-duration behavior beyond minute-only marker forms while preserving the current default-duration fallback model.
- `user-facing-duration-documentation`: Clarify the recommended duration syntax in README and related user guidance once the future parser behavior is implemented.

## Impact

- Affected code will likely include duration parsing and task text cleaning in `src/main.ts`, with possible extraction of duration parsing into focused helpers if the grammar expands.
- Affected systems include active-note task intake, external markdown task discovery, Kanban task intake, planner generation, and duration-related documentation.
- Automated coverage should be expanded for valid syntaxes, invalid syntaxes, fallback behavior, and ambiguity handling.
- No dependency changes are expected.
