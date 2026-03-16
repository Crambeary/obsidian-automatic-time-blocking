# Obsidian Automatic Time Blocking

Obsidian Automatic Time Blocking is a prototype Obsidian plugin for turning selected tasks into time blocks in your daily note so they can work smoothly with Day Planner-style workflows.

## Status

This project is in the prototype stage.

The current codebase now includes an initial working prototype: a real settings tab and a command that can turn open tasks from the active note into sequential time blocks under a configurable heading.

The plugin files now live at the repository root rather than inside a nested `obsidian-atb/` folder.

## Current Prototype

What is implemented today:

- a settings tab for output heading, day start time, work day end time, start interval, and default duration
- a command named `Generate time blocks from active note`
- parsing of open or in-progress Markdown task lines from the active note
- NotePlan-like rerun behavior for the active note: source tasks are read from outside the generated planner section, and rerunning the command replaces that section with a fresh plan instead of scheduling previously generated block lines again
- preservation of nested open subtasks under their parent task when generated output is written back to the note
- duration markers in the form `[30m]` or `@30m`
- manual task start times in `HH:MM` 24-hour format, such as `13:00`, with optional duration markers like `@45m`
- preservation of duration markers on generated time-block lines, so task text like `Task @60m` stays visible after scheduling
- ordering of active-note tasks by Obsidian Tasks priority markers before generating blocks, using `🔺`, `⏫`, `🔼`, no marker, `🔽`, and `⏬` from highest to lowest
- explicit task times override priority-based ordering, so a task with a manual start time is placed at that block instead of being moved by priority
- generated output written under a configurable heading in the current note
- generated blocks snapped to a configurable minute interval and limited to the configured work day
- optional plugin-owned remote calendars that are treated as busy time during scheduling
- optional ignored calendar event patterns, matched case-insensitively against event titles, so selected recurring calendar events do not block scheduling
- grouped Remote Calendar settings with an `Add remote calendar` button for managing more than one internet calendar feed
- a manual `Refresh busy calendars` command for reloading configured remote calendars
- a `Preview busy calendars for active note` command and settings action for inspecting which busy events are visible for the current planning date

What is not implemented yet:

- direct integration with the Obsidian Tasks plugin API
- direct reuse of Day Planner's internal remote calendar state
- Kanban note parsing
- more advanced scheduling heuristics
- richer metadata preservation rules

## Vision

The goal is to help you plan your day by taking tasks you actually want to work on and placing them into your daily note as time blocks.

The intended workflow is:

- pull tasks from supported sources such as Obsidian Tasks, the current daily note, and eventually Kanban notes
- filter toward tasks that are still open or in progress
- respect duration markers on tasks
- write time blocks into a configurable heading in the daily note
- preserve source task emojis where possible
- format output so it works well with the Day Planner plugin

This project is heavily inspired by the NotePlan Auto Time Blocking workflow, but it is being adapted for Obsidian plugins and Obsidian-native task sources.

## Planned V1 Behavior

The first meaningful version is expected to focus on a small, opinionated core:

- read tasks from configured sources
- support a settings page immediately
- support duration markers on tasks
- target only tasks that are open or in progress
- insert generated time blocks into the daily note under a configurable heading
- maintain compatibility with Day Planner output expectations
- preserve task emoji metadata where possible

## Task Sources

The expected task intake model currently includes:

- tasks managed with the Obsidian Tasks plugin
- tasks already written into the current day note so they can still be rearranged manually
- tasks stored in a Kanban note, with support focused on actionable items such as open or in-progress work

Exact parsing and prioritization rules are still being designed.

## Daily Note Output

Generated time blocks are intended to be written into the daily note rather than hidden in an external data structure.

The documentation and future implementation are aimed at:

- writing into a configurable heading
- treating the generated heading as plugin output rather than as an authoritative task source during reruns
- preserving useful task text and emojis where possible
- keeping the result compatible with Day Planner-style rendering and manual editing

## Development

For full dev-build installation steps in Obsidian, see [`docs/development.md`](docs/development.md).

Install dependencies:

```bash
npm install
```

Start development mode:

```bash
npm run dev
```

Create a build:

```bash
npm run build
```

Note: if you use hot reloading in Obsidian, you may also need the related hot-reload plugin enabled in your vault.

## Current Code Reality

The repository now contains a small but real prototype rather than only scaffold code.

Implemented today:

- a persisted settings tab
- active-note task parsing for open or in-progress Markdown tasks
- exclusion of tasks already inside the configured planner heading when gathering source tasks, so reruns replace the generated plan instead of duplicating it
- preservation of nested open subtasks under the scheduled parent task in generated output
- preservation of duration markers such as `[30m]` and `@30m` in generated task text
- parsing of explicit task start times such as `13:00`, with those manual times taking precedence over priority-based scheduling
- active-note ordering that follows Obsidian Tasks priority markers from highest to lowest, with unmarked tasks placed between medium and low priority
- generation of simple sequential time blocks into a configurable heading
- configurable work-day bounds and start-interval snapping for generated blocks
- optional avoidance of busy windows from configured remote calendars
- optional event-title ignore patterns for calendar events you do not want to block around
- remote calendars are configured in grouped settings rows, with an `Add remote calendar` button similar to the Day Planner-style internet calendar setup flow
- the plugin caches the most recent preview result for the active planning date until you refresh or change calendar settings
- the `Refresh busy calendars` command forces a fresh reload of the configured remote calendars
- the `Preview busy calendars for active note` command shows which busy events the plugin can currently see for the active note date
- ignored calendar event patterns are simple case-insensitive substring matches against the event title

## Task Syntax Supported Today

For active-note tasks, the current prototype understands these scheduling markers:

- `- [ ] Write report`
- `- [ ] Write report @45m`
- `- [ ] 13:00 Write report`
- `- [ ] 13:00 Write report @45m`

Current behavior:

- `@45m` or `[45m]` sets the task duration
- `13:00` sets the start time for that task in 24-hour format
- if a task has a manual start time but no duration marker, the plugin uses the configured default duration
- manually timed tasks are honored at their specified start times, and their priority marker does not move them earlier or later
- tasks without a manual start time are still scheduled automatically using the existing priority ordering and interval snapping rules
- if remote calendars are configured, generated tasks avoid overlapping matching calendar events on the planning day

Current calendar limitations:

- the plugin reads internet calendar ICS feeds directly rather than integrating with Day Planner internals
- ignore rules currently match event titles only
- recurring event expansion is currently limited to non-recurring events and simple daily recurrences from ICS feeds
- timezone handling is currently best-effort and does not yet interpret every ICS timezone variant

The README still describes a broader intended direction beyond what the current code supports.

## Roadmap

Near-term priorities are:

- expand task-source support beyond the active note
- decide the exact task selection rules across Obsidian Tasks, Kanban, and daily-note inputs
- improve generated output for stronger Day Planner compatibility
- support marking a generated Day Planner task complete and reflecting that completion back to the source task that created it
- preserve task emoji and related metadata more faithfully

Ideas intentionally deferred for now include broader scheduling heuristics, more advanced prioritization schemes, and other larger automation behaviors.

## AI Agent Guidance

Repository guidance for AI coding tools lives in `docs/AGENT.md`.
