# Obsidian Automatic Time Blocking

Obsidian Automatic Time Blocking is a prototype Obsidian plugin for turning selected tasks into time blocks in your daily note so they can work smoothly with Day Planner-style workflows.

## Status

This project is in the prototype stage.

The current codebase now includes an initial working prototype: a real settings tab and a command that can turn open tasks from the active note into sequential time blocks under a configurable heading.

The plugin files now live at the repository root rather than inside a nested `obsidian-atb/` folder.

## Current Prototype

What is implemented today:

- a settings tab for output heading, day start time, and default duration
- a command named `Generate time blocks from active note`
- parsing of open or in-progress Markdown task lines from the active note
- duration markers in the form `[30m]` or `@30m`
- generated output written under a configurable `##` heading in the current note

What is not implemented yet:

- direct integration with the Obsidian Tasks plugin API
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
- generation of simple sequential time blocks into a configurable heading

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
