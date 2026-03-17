# Automatic Time Blocking

Automatic Time Blocking is a prototype Obsidian plugin for turning selected tasks into time blocks in your daily note so they can work smoothly with Day Planner-style workflows.

## Status

This project is in the prototype stage.

The current codebase now includes an initial working prototype: a real settings tab and a command that can turn open tasks from the active note into sequential time blocks under a configurable heading.

The plugin files now live at the repository root rather than inside a nested `obsidian-atb/` folder.

## Current Prototype

What is implemented today:

- a settings tab for output heading, day start time, automatic start mode, work day end time, start interval, default duration, optional split scheduling across gaps, break duration between generated blocks, and separate before/after meeting buffers for remote calendar busy events
- a global `Completion sync` setting that can enable or disable completion syncing between generated planner tasks and their source tasks
- a grouped task discovery settings section with a mode selector for `Built-in` versus `Dataview`
- a command named `Generate time blocks for active note`
- parsing of open or in-progress Markdown task lines from the active note
- optional intake from configured external Markdown notes or folders, limited to explicit user-selected source paths rather than whole-vault scanning
- Dataview-backed indexed discovery across the whole vault when the Dataview plugin is installed, with the existing scoped file and folder scan retained as the built-in fallback
- when `Built-in` task discovery is selected, the configured external note and folder pickers are shown and used during planning
- when `Dataview` task discovery is selected, those built-in source pickers are hidden from the settings UI and the plugin relies on Dataview's vault-wide index instead
- generated planner lines for external-source tasks preserve a compact Obsidian backlink to the source note so you can jump back to where the task came from
- preservation of open versus in-progress task markers in generated planner output, so `- [ ]`, `- [/]`, and `- [>]` stay aligned with the source task state
- explicit task times override priority-based ordering, so a task with a manual start time is placed at that block instead of being moved by priority
- generated output written under a configurable heading in the current note
- generated blocks limited to the configured work day, with automatic scheduling able to either start at the next snapped interval or immediately from the current time when planning today, while non-today notes begin from the configured day start time
- optional splitting of automatically scheduled tasks across multiple free gaps in the day
- optional break buffers between generated blocks
- optional plugin-owned remote calendars that are treated as busy time during scheduling
- optional separate meeting buffers before and after remote calendar busy events, so generated task blocks can leave transition time around meetings
- optional ignored calendar event patterns, matched case-insensitively against event titles, so selected recurring calendar events do not block scheduling
- external-note date matching for planning-note intake using Tasks-style due, scheduled, and start markers such as `📅 2026-03-16`, `⏳ 2026-03-16`, `🛫 2026-03-16`, or a plain `>2026-03-16` token in the task text, with overdue dated tasks included when the marked date is on or before the planning note date
- when those date markers are rendered into generated planner lines, the emoji stays visible as normal text and the date portion is wrapped in inline code so Day Planner does not reinterpret it as a different planning date
- grouped Remote Calendar settings with an `Add remote calendar` button for managing more than one internet calendar feed
- a manual `Refresh busy calendars` command for reloading configured remote calendars
- a `Preview busy calendars for active note` command and settings action for inspecting which busy events are visible for the current planning date
- bidirectional completion syncing between generated planner tasks and source tasks across separate notes
- directional completion syncing for tasks that live in the same note under different headings, so edits can flow from the side you changed without immediately undoing themselves
- in-memory completion sync metadata and debug logging, so sync support no longer recreates a debug Markdown file in the vault

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
- prefer indexed external-task discovery when available so cross-note task intake stays fast
- support a settings page immediately
- support duration markers on tasks
- target only tasks that are open or in progress
- filter external tasks by the active planning date using task scheduled and due dates
- insert generated time blocks into the daily note under a configurable heading
- maintain compatibility with Day Planner output expectations
- preserve task emoji metadata where possible
- keep generated planner task completion states synchronized with their source tasks when completion sync is enabled

## Task Sources

The expected task intake model currently includes:

- tasks managed with the Obsidian Tasks plugin
- tasks already written into the current day note so they can still be rearranged manually
- tasks stored in a Kanban note, with support focused on actionable items such as open or in-progress work
- indexed cross-note task discovery via Dataview when available, with a scoped file-or-folder fallback when it is not

The current intended direction for external-note discovery is:

- use Dataview as the preferred discovery path when it is installed, so multi-note task discovery can stay fast
- provide a plugin-managed fallback where users can select a limited set of folders or files instead of scanning the whole vault
- use Tasks-style scheduled and due dates to decide whether an external task belongs to the active planning date
- preserve enough source metadata to support future links back to the original task location

Current prototype behavior for this area:

- external-note discovery now prefers Dataview indexed lookup across the vault when Dataview is installed
- when Dataview is unavailable, external-note discovery falls back to the existing plugin-managed file and folder scan
- the settings UI exposes this choice as a task discovery mode, so you can explicitly switch between built-in scoped discovery and Dataview-based indexed discovery
- the plugin reads Markdown tasks from those configured sources and includes only open or in-progress tasks whose text contains a due, scheduled, or start date token on or before the planning note date
- current external-date matching recognizes `📅 YYYY-MM-DD`, `⏳ YYYY-MM-DD`, `🛫 YYYY-MM-DD`, and `>YYYY-MM-DD`
- generated planner lines for external tasks append a compact `[[note|↗]]` backlink to the source note
- generated planner lines keep `📅`, `⏳`, and `🛫` visible as plain text while wrapping the detected date text in inline code for Day Planner compatibility
- completion syncing uses stored source-to-planner mappings and task fingerprints so marking either side done or reopened can update the other side reliably

Exact parsing and prioritization rules are still being designed.

## Daily Note Output

Generated time blocks are intended to be written into the daily note rather than hidden in an external data structure.

The documentation and future implementation are aimed at:

- writing into a configurable heading
- treating the generated heading as plugin output rather than as an authoritative task source during reruns
- preserving useful task text and emojis where possible
- keeping the result compatible with Day Planner-style rendering and manual editing

## Completion Sync

When `Completion sync` is enabled in settings, the plugin keeps generated planner task completion states synchronized with the source tasks they were generated from.

Current behavior:

- marking a generated planner task complete updates the source task
- reopening a generated planner task reopens the source task
- marking a source task complete updates linked generated planner tasks
- reopening a source task reopens linked generated planner tasks
- cross-note sync continues to work when one source task is represented in more than one planning note
- same-note sync is supported when the source task and generated planner task live in the same note under different headings
- same-note sync uses directional change detection to reduce feedback loops when editing either side
- turning `Completion sync` off disables all completion syncing

Current limitations:

- sync depends on generated planner tasks retaining enough of their rendered task text to match the stored source mapping
- completion syncing only applies to generated planner tasks that were created by the plugin and recorded in its sync mappings

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

## GitHub Releases For BRAT

This repository includes a GitHub Actions release workflow that builds the plugin and attaches the compiled plugin files to a GitHub release in a BRAT-compatible format.

Current release assets:

- `dist/main.js`
- `manifest.json`

To publish a BRAT-compatible release:

- update the version in `manifest.json` and `package.json`
- commit and push that version change
- create and push a Git tag such as `v0.0.2`
- let GitHub Actions build the plugin and publish the release assets automatically

BRAT can install the plugin from the repository's GitHub releases once those built files are attached to the release.

## Current Code Reality

The repository now contains a small but real prototype rather than only scaffold code.

Implemented today:

- a persisted settings tab
- a global `Completion sync` setting for turning task completion syncing on or off
- a grouped task discovery settings section with a `Built-in` versus `Dataview` mode selector
- active-note task parsing for open or in-progress Markdown tasks
- optional scoped external-note task discovery from configured note and folder paths
- Dataview-backed indexed discovery of matching external source files across the vault when Dataview is installed
- generated planner lines for external tasks append a compact backlink to the source note
- preservation of open versus in-progress task markers in generated planner lines
- exclusion of tasks already inside the configured planner heading when gathering source tasks, so reruns replace the generated plan instead of duplicating it
- preservation of nested open subtasks under the scheduled parent task in generated output
- preservation of duration markers such as `[30m]` and `@30m` in generated task text
- parsing of explicit task start times such as `13:00`, with those manual times taking precedence over priority ordering
- active-note ordering that follows Obsidian Tasks priority markers from highest to lowest, with unmarked tasks placed between medium and low priority
- external tasks from configured source notes or folders are included when their text carries a due, scheduled, or start date marker on or before the active note date
- generated planner output keeps `📅`, `⏳`, and `🛫` visible while wrapping the detected date text in inline code so Day Planner keeps them on the current day instead of moving them
- generation of simple sequential time blocks into a configurable heading
- configurable work-day bounds, automatic start behavior, optional split scheduling across gaps, optional breaks between generated blocks, separate before/after meeting buffers for remote calendar busy events, and start-interval snapping for generated blocks
- optional avoidance of busy windows from configured remote calendars
- optional event-title ignore patterns for calendar events you do not want to block around
- remote calendars are configured in grouped settings rows, with an `Add remote calendar` button similar to the Day Planner-style internet calendar setup flow
- the plugin caches the most recent preview result for the active planning date until you refresh or change calendar settings
- the `Refresh busy calendars` command forces a fresh reload of the configured remote calendars
- the `Preview busy calendars for active note` command shows which busy events the plugin can currently see for the active note date
- ignored calendar event patterns are simple case-insensitive substring matches against the event title
- completion syncing can propagate done and reopened states in both directions between source tasks and generated planner tasks
- same-note completion syncing uses directional sync logic when source and planner tasks live in different headings of the same note
- completion sync support now keeps debug logs in memory instead of writing a debug Markdown file into the vault

## Task Syntax Supported Today

For active-note tasks, the current prototype understands these scheduling markers:

- `- [ ] Write report`
- `- [ ] Write report @45m`
- `- [ ] 13:00 Write report`
- `- [ ] 13:00-14:30 Write report`
- `- [ ] 13:00 Write report @45m`

Current behavior:

- `@45m` or `[45m]` sets the task duration
- `13:00` sets the start time for that task in 24-hour format
- `13:00-14:30` sets both the start time and duration for that task from the explicit range
- if a task has a manual start time but no duration marker, the plugin uses the configured default duration
- generated planner lines preserve whether a source task was open (`[ ]`) or in progress (`[/]` or `[>]`)
- manually timed tasks are honored at their specified start times, and their priority marker does not move them earlier or later
- tasks without a manual start time are still scheduled automatically using the existing priority ordering rules
- automatic scheduling can either begin at the next snapped interval boundary or at the current time, based on settings
- when enabled, automatic scheduling can split a task across multiple open gaps instead of skipping it when one continuous slot is unavailable
- when enabled, split scheduling keeps any segments that fit in the remaining day even if the full requested duration cannot be placed
- when enabled, a break buffer is reserved after each generated block before another generated block can begin
- if remote calendars are configured, generated tasks avoid overlapping matching calendar events on the planning day
- when enabled, separate before and after meeting buffers expand those remote calendar busy windows before automatic scheduling looks for open time

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
- preserve task emoji and related metadata more faithfully

Ideas intentionally deferred for now include broader scheduling heuristics, more advanced prioritization schemes, and other larger automation behaviors.

## AI Agent Guidance

Repository guidance for AI coding tools lives in `docs/AGENT.md`.
