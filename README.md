# Automatic Time Blocking

Automatic Time Blocking is an Obsidian plugin for turning tasks into time blocks in your daily note.

A personal planning tool in active prototype development, built to help me
plan the day while keeping manual guidance in the note. It writes to your
vault and can sync task completion, so try it in a test vault first.

## Install

This repository provides builds through [GitHub Releases](https://github.com/Crambeary/obsidian-automatic-time-blocking/releases).
For a manual install:

1. Download `main.js` and `manifest.json` from the same release.
2. Put both files in `<your-vault>/.obsidian/plugins/obsidian-atb/`.
3. Reload Obsidian, allow community plugins, and enable **Automatic Time Blocking**.
4. Open the plugin settings to choose your workday, default duration, and
   planner heading before generating a plan.

You can also add `Crambeary/obsidian-automatic-time-blocking` through
[BRAT](https://github.com/TfTHacker/obsidian42-brat). For source builds, see
[Development](#development); the compiled file is `dist/main.js`.

Active-note planning does not require Tasks, Dataview, Kanban, or Day Planner.
Dataview is an optional external discovery path; Day Planner can display the
resulting note blocks. The plugin reads Tasks-style text and metadata; it
does not use the Obsidian Tasks plugin API.

## What It Helps With

- turning your task list into a schedule
- keeping time blocks inside your chosen workday
- giving certain kinds of tasks preferred times of day
- working with Day Planner-style note layouts
- reducing the friction of planning from scratch

## Quick Start

1. Open your daily note.
2. Add a few tasks outside the configured planner heading.
3. Optionally add manual time block bullets.
4. Run `Generate time blocks for active note`.

The command writes generated tasks under **Time Blocks** by default. On
reruns, it rebuilds that planner section from source tasks; put durable task
edits in the sources, since manual edits to generated output may be replaced.
Completion sync can be disabled in settings if you only want a generated plan.

Example input (set your workday to cover these windows):

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

## Task Duration

Tasks can define their planned length inline.

Examples:

```md
- [ ] Write draft [45m]
- [ ] Quick email cleanup @15m
- [ ] General admin
```

How it works:

- use `[30m]` or `@30m` anywhere in task text to set a task duration in minutes
- if a task does not include a duration marker, the plugin uses the `Default duration` setting
- the current prototype supports minute-based markers like `[45m]` and `@15m`
- generated planner tasks keep the duration marker text today

## Current User-Facing Features

- generate time blocks into a configurable heading in the active note
- support plain tasks, duration markers, and explicit task start times
- support manual time block bullets in the active note
- support overlapping manual block windows
- support external task intake from selected notes or folders
- support first-party Kanban board intake from selected board notes with per-board column mappings
- support Dataview-backed external task discovery when Dataview is installed
- support remote calendar busy-time avoidance
- support completion sync between generated planner tasks and source tasks, including Kanban done/reopen moves
- support task filtering with include and exclude patterns using plain text or regex

## Good To Know

- tasks use hashtags like `#work` for matching
- timeframe names are matched through hashtags like `#morning`
- manual block bullets can use plain words like `work` or hashtags like `#work`
- manually timed tasks still behave like explicit placements
- generated planner output is treated as plugin output on reruns
- selected Kanban boards are treated as first-party task sources, and only configured active columns are scheduled by default
- the current Kanban integration expects Markdown-backed boards with `## Column` headings and bullet cards

## Limitations

- This is a prototype, without a published compatibility matrix across
  Obsidian versions or desktop/mobile environments.
- Preferred tag windows are guidance, not hard constraints; tasks may fall
  back to other available time. Tasks that cannot fit may be left unscheduled.
- Explicit task start times can force placement even across busy ranges or
  workday bounds. Review the generated plan rather than treating it as a
  guarantee of a conflict-free day.
- Remote calendar avoidance requires reachable ICS feeds. Check notices for
  feed failures and use the calendar preview command to inspect busy ranges.
- Kanban intake expects Markdown-backed boards with `## Column` headings;
  it is not a general integration with every board format.

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

Run the existing fixture-backed checks and create a build:

```bash
npm test
npm run build
```

For manual loading, copy `dist/main.js` and the root `manifest.json` into
`<your-vault>/.obsidian/plugins/obsidian-atb/`.

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
