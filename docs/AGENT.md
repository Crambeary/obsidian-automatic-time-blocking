# AGENT.md

This file gives AI coding agents repo-specific guidance for working safely and efficiently in this project.

## Project Overview

- Project name: `obsidian-atb`
- Plugin name: Obsidian Automatic Time Blocking
- Project stage: prototype
- Current implementation state: still close to the generated Obsidian plugin scaffold
- Primary product direction: turn selected tasks into time blocks written into the daily note for Day Planner-compatible workflows

## Product Intent

When contributing here, optimize for the intended product direction rather than the current placeholder UI.

The intended plugin behavior is:

- read tasks from configured sources
- start with Obsidian Tasks support
- support task intake from the current daily note
- support task intake from Kanban notes as the product evolves
- focus on open and in-progress work
- support duration markers on tasks
- write generated time blocks into a configurable heading in the daily note
- preserve source task emojis where possible
- keep output compatible with Day Planner-style note formatting
- expose core behavior through a settings page early

## Repository Layout

- `src/main.ts`: current plugin entry point and placeholder scaffold logic
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

The current code is mostly scaffold code. Do not assume existing commands, settings, or UI names reflect the final product direction.

Before implementing new behavior:

- verify whether the current code is scaffold-only or already meaningful
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
2. task-source selection and filtering for open / in-progress items
3. duration marker parsing
4. writing time blocks into the daily note under a configurable heading
5. preserving task emojis where practical
6. maintaining Day Planner-compatible output

## Task Source Expectations

Treat these as the main expected sources unless the user says otherwise:

- Obsidian Tasks-managed tasks
- tasks already present in the current daily note
- tasks represented in Kanban notes

When implementing source support, prefer explicit filtering rules over implicit guesses.

## Output Expectations

Generated time blocks should target the daily note, not a hidden store.

Favor output that is:

- written under a configurable heading
- editable by the user after insertion
- compatible with Day Planner formatting expectations
- respectful of source task text and emoji metadata where possible

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
