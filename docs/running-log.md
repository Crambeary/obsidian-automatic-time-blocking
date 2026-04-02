# Running Log

This file is the ongoing development log for the plugin.

It is meant for implementation notes, prototype reality, and recent behavior changes.

## Current Prototype Snapshot

The plugin currently supports:

- generating time blocks for the active note
- configurable planner heading text and heading level
- configurable day start, work day end, start interval, and default duration
- optional split scheduling across gaps
- optional breaks between generated blocks
- remote calendar busy-time avoidance with optional before and after buffers
- optional ignored calendar event title patterns
- task intake from the active note
- optional external task intake from configured notes and folders
- optional Kanban board intake from selected board notes with per-board column mappings
- Dataview-backed indexed external discovery when Dataview is installed
- task date matching using `📅`, `⏳`, `🛫`, and `>YYYY-MM-DD`
- bidirectional completion sync between generated planner tasks and source tasks, including Kanban done/reopen board movement
- same-note directional completion sync support
- in-memory debug logging
- task filtering with include and exclude patterns supporting plain text and regex

## Task Filtering

Recent additions:

- include task filter setting accepts comma-separated patterns
- exclude task filter setting accepts comma-separated patterns
- patterns support plain text matching anywhere in task text
- patterns support regex format like `/^pattern/` for advanced matching
- exclude filters are applied first, then include filters
- empty include filter means all non-excluded tasks are included
- filter logic is applied after task collection and before priority sorting

## Manual Time Blocks

Recent additions:

- bullet-point manual block parsing from the active note
- block syntax accepts both spaced and unspaced ranges such as `09:00 - 17:00` and `09:00-17:00`
- block labels may be written as plain words like `work` or hashtags like `#work`
- overlapping manual blocks are segmented into effective tagged windows
- matching tagged tasks are prioritized into matching manual block windows
- higher-strength tag matches are preferred over lower-strength matches
- manual blocks behave as preferred placement windows rather than resetting the global queue start for all later tasks
- debug logging records detected blocks, skipped lines, and derived windows
- externally discovered generated planner tasks are skipped during source intake so prior planning notes are not re-imported as source tasks

## Kanban Boards

Recent additions:

- selected Markdown-backed Kanban boards can be added as first-party task sources in settings
- each board gets per-board active, done, and reopen column mappings in the settings UI
- default column inference prefers active columns like `Open`, `Doing`, and `In Progress`
- backlog, idea, and todo-style columns stay out of planning unless explicitly mapped in settings
- planner completion can move a linked board card to the configured done column
- reopening a planner task can move the linked card back to its remembered active column or configured fallback column

## Not Implemented Yet

- direct Obsidian Tasks plugin API integration
- direct reuse of Day Planner internal remote calendar state
- richer scheduling policies and heuristics
- richer metadata preservation rules
- dedicated settings UI for manual block behavior

## Developer Docs

- setup and local development: [`docs/development.md`](development.md)
- manual block implementation plan: [`docs/manual-blocks-development.md`](manual-blocks-development.md)
- user-facing manual block guide: [`docs/manual-time-blocks.md`](manual-time-blocks.md)
