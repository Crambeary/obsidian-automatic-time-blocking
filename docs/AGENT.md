# AGENT.md

This file gives AI coding agents repo-specific guidance for working safely and efficiently in this project.

## Project Overview

- Project name: `obsidian-atb`
- Plugin name: Obsidian Automatic Time Blocking
- Project stage: prototype
- Current implementation state: a small but real prototype with persisted settings and active-note time-block generation
- Primary product direction: turn selected tasks into time blocks written into the daily note for Day Planner-compatible workflows

## Product Intent

When contributing here, optimize for the intended product direction rather than the current placeholder UI.

The intended plugin behavior is:

- read tasks from configured sources
- prefer indexed discovery for external task sources when available so multi-note intake stays fast
- start with Obsidian Tasks support
- support task intake from the current daily note
- support task intake from Kanban notes as the product evolves
- focus on open and in-progress work
- use explicit task date signals for external sources, especially scheduled and due dates aligned with the planning note date
- support duration markers on tasks
- write generated time blocks into a configurable heading in the daily note
- for the current prototype, follow a NotePlan-like rerun model where generated time blocks are treated as output, not as an authoritative task source on the next run
- preserve source task emojis where possible
- keep output compatible with Day Planner-style note formatting
- expose core behavior through a settings page early

## Repository Layout

- `src/main.ts`: current plugin entry point, settings UI, active-note task parsing, and planner output logic
- `manifest.json`: Obsidian plugin metadata
- `package.json`: development scripts and package metadata
- `types.d.ts`: Obsidian type declarations used by the scaffold
- `docs/AGENT.md`: repository instructions for AI agents
- `README.md`: end-user overview and product direction
- `noteplan-atb.html`: local reference material for the NotePlan-inspired workflow
- plugin source files now live at the repository root, not under a nested `obsidian-atb/` folder

## Commands

Run commands from the repository root.

- Install dependencies: `npm install`
- Start development build: `npm run dev`
- Create production build: `npm run build`

## Current Reality

The current code is no longer scaffold-only. It includes a working prototype centered on the active note.

Implemented today:

- persisted settings for planner heading text and level, day start time, work day end time, default duration, and start interval
- a `Generate time blocks from active note` command and matching ribbon action
- parsing of open and in-progress Markdown task lines from the active note
- exclusion of tasks already inside the configured planner heading so reruns replace generated output instead of re-parsing it as source input
- preservation of nested open subtasks beneath scheduled parent tasks in generated output
- duration marker parsing for `[30m]` and `@30m`, with marker text preserved in generated task lines
- priority ordering for active-note tasks using Obsidian Tasks priority markers from highest to lowest, with unmarked tasks between medium and low priority
- generation of sequential time blocks under a configurable heading in the current note, snapped to the configured interval and limited by the configured work day

Before implementing new behavior:

- verify whether the current code already covers part of the requested behavior before adding new logic
- align naming with the Automatic Time Blocking domain instead of sample-plugin placeholders
- keep README and agent guidance accurate to the real implementation state

## Working Agreements

- Prefer small, focused edits over broad refactors.
- Preserve the distinction between prototype behavior and planned behavior.
- Keep docs honest about what is implemented today.
- Update user-facing docs when behavior or setup meaningfully changes.
- Avoid introducing repo-wide abstractions unless they clearly support the plugin roadmap.

## Guardrails

Ask before doing any of the following:

- adding or changing dependencies
- changing `manifest.json` metadata such as plugin identity or release/version details
- making broad refactors unrelated to the requested task
- changing the documented product scope in a way that conflicts with `README.md`

## Implementation Priorities

If you are asked to work on product features, prioritize these areas first:

1. real settings page and persisted plugin settings
2. fast task-source discovery and filtering for open / in-progress items
3. duration marker parsing
4. writing time blocks into the daily note under a configurable heading
5. preserving task emojis where practical
6. maintaining Day Planner-compatible output
7. syncing completion state from generated planner tasks back to the source task when the user marks the generated item done

## Task Source Expectations

Treat these as the main expected sources unless the user says otherwise:

- Obsidian Tasks-managed tasks
- tasks already present in the current daily note
- tasks represented in Kanban notes
- externally discovered tasks found through Dataview when available, with a scoped folder-or-file fallback when it is not

When implementing source support, prefer explicit filtering rules over implicit guesses.

For external-note discovery, prefer this order unless the user says otherwise:

- use Dataview as the preferred discovery path when it is installed and can provide indexed task lookup
- avoid full-vault scans during normal command execution
- provide plugin-managed selection of a limited set of folders or files as the fallback source scope
- use Tasks-style scheduled and due dates as the first inclusion rule for matching a task to the planning note date
- preserve source metadata so future generated lines can link back to the original task location

For the current active-note prototype, tasks under the configured planner heading should be treated as generated output and excluded from source-task intake so reruns rebuild the plan from the underlying task list.

## Output Expectations

Generated time blocks should target the daily note, not a hidden store.

Favor output that is:

- written under a configurable heading
- editable by the user after insertion
- compatible with Day Planner formatting expectations
- respectful of source task text and emoji metadata where possible

When changing rerun behavior, prefer the current NotePlan-like model of replacing plugin-generated planner output from source tasks rather than re-parsing previously generated block lines as new input.

## Commits

Use Conventional Commits for commit messages.

Examples:

- `feat: add daily note heading setting`
- `fix: preserve task emoji in generated time blocks`
- `refactor: extract duration parsing helpers`
- `docs: clarify prototype scope in README`

## Testing And Verification

There is no mature automated test setup yet.

When making changes, verify as much as the repo supports:

- after implementing a feature, always run `npm run build` before reporting completion
- the plugin still builds with `npm run build`
- development mode still starts with `npm run dev`
- settings and output assumptions match the current README

If a requested change would benefit from tests but the test harness does not exist, say so clearly instead of pretending coverage exists.

## Documentation Style For Agents

When editing docs in this repo:

- write for clarity over hype
- prefer concrete behavior descriptions
- clearly mark prototype status
- separate current implementation from intended design
- avoid copying NotePlan terminology blindly where Obsidian behavior differs

## When Unsure

If requirements are ambiguous, ask targeted questions about:

- which task source is authoritative
- what counts as open or in-progress in that source
- what daily note heading should be targeted
- what output format Day Planner should consume
- whether emoji preservation should be exact or best-effort
