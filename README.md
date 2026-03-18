# Automatic Time Blocking

Automatic Time Blocking is an Obsidian plugin for turning tasks into time blocks in your daily note.

It is built for people who want help planning the day without losing the ability to guide the schedule manually.

## What It Helps With

- turning your task list into a schedule
- keeping time blocks inside your chosen workday
- giving certain kinds of tasks preferred times of day
- working with Day Planner-style note layouts
- reducing the friction of planning from scratch

## Quick Start

1. Open your daily note.
2. Add a few tasks.
3. Optionally add manual time block bullets.
4. Run `Generate time blocks for active note`.

Example:

```md
- 12:00 - 17:00 work
- 14:00 - 16:00 high-energy

- [ ] Finish proposal #work
- [ ] Deep focus task #work #high-energy
- [ ] Quick admin
```

## Task Filtering

Control which tasks get time-blocked by setting include or exclude patterns.

Examples:

**Include only work tasks:**

```
Include: #work,#urgent
```

**Exclude backlog items:**

```
Exclude: #someday,#backlog,#waiting
```

**Advanced regex patterns:**

```
Include: /^important/,#focus
Exclude: /\[low priority\]/
```

How it works:

- exclude patterns are checked first and remove matching tasks
- include patterns then select which remaining tasks to schedule
- leave include empty to schedule all non-excluded tasks
- patterns match anywhere in task text
- separate multiple patterns with commas
- wrap regex in `/pattern/` format

## Manual Time Blocks

Manual time blocks let you guide where tagged tasks prefer to land.

Example:

```md
- 09:00 - 17:00 work
- 10:00 - 12:00 high-energy

- [ ] Write report #work
- [ ] Hard thinking task #work #high-energy
- [ ] Quick life admin
```

How it works:

- matching tagged tasks are prioritized into matching blocks
- overlapping blocks are supported
- stronger tag matches are preferred first
- the rest of the day still schedules normally inside your global workday bounds

## Timeframes

Timeframes let you create reusable parts of the day without writing manual block bullets into each note.

Example:

```md
- [ ] Write status update #morning
- [ ] Admin catch-up #afternoon
- [ ] Read before bed #late
```

How it works:

- define timeframes like `morning` or `afternoon` in plugin settings
- tasks tagged with matching hashtags like `#morning` prefer those windows first
- if a matching timeframe has no room, the task falls back to normal scheduling
- manual time block bullets still work and combine with timeframe-based preferences

Read the full guide here:

- [`docs/manual-time-blocks.md`](docs/manual-time-blocks.md)

## Current User-Facing Features

- generate time blocks into a configurable heading in the active note
- support plain tasks, duration markers, and explicit task start times
- support manual time block bullets in the active note
- support overlapping manual block windows
- support external task intake from selected notes or folders
- support Dataview-backed external task discovery when Dataview is installed
- support remote calendar busy-time avoidance
- support completion sync between generated planner tasks and source tasks
- support task filtering with include and exclude patterns using plain text or regex

## Good To Know

- tasks use hashtags like `#work` for matching
- timeframe names are matched through hashtags like `#morning`
- manual block bullets can use plain words like `work` or hashtags like `#work`
- manually timed tasks still behave like explicit placements
- generated planner output is treated as plugin output on reruns

## Docs

- **[Manual time blocks guide](docs/manual-time-blocks.md)**
- **[Development setup](docs/development.md)**
- **[Running log](docs/running-log.md)**
- **[Manual blocks implementation notes](docs/manual-blocks-development.md)**

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

## AI Agent Guidance

Repository guidance for AI coding tools lives in `docs/AGENT.md`.
