# Development Setup

This project can be loaded into Obsidian as a developer build while you iterate on the plugin.

The preferred verification path is now the local fixture-backed test harness. Use manual Obsidian checks for host-specific behavior after the automated harness covers the workflow you changed.

## Prerequisites

- Node.js and npm installed
- An Obsidian vault you can use for plugin development
- Community plugins enabled in that vault

## Install dependencies

From the repository root:

```bash
npm install
```

## Build the plugin

For a one-time production-style build:

```bash
npm run build
```

For an active development build that recompiles on changes:

```bash
npm run dev
```

The build outputs the plugin files that Obsidian needs, including `main.js`.

## Where the git repo should live

For the smoothest development experience, it is usually best for the working git repo to be the same folder that Obsidian loads as the plugin.

That means the most convenient setup is often:

- your vault contains `.obsidian/plugins/obsidian-atb/`
- this repository itself lives in that `obsidian-atb` folder
- you run `npm install` and `npm run dev` there
- Obsidian reads the rebuilt `main.js` directly from that same folder

This avoids manual copying after every rebuild.

If you prefer to keep your git repos somewhere else, that also works, but then you need one of these approaches:

- manually copy `manifest.json` and `main.js` into the vault plugin folder after rebuilds
- use a symlink or junction from the vault plugin folder to your external repo folder

On Windows, a directory junction is often the most practical way to keep the repo outside the vault while still letting Obsidian load it like a normal plugin folder.

## Load it in your vault as a dev build

1. Open your vault's plugin folder:
   - Windows: `%APPDATA%\Obsidian\Vaults\<your-vault>\.obsidian\plugins\`
   - Or open your vault folder directly and then go to `.obsidian/plugins/`
2. Create a folder for this plugin, for example `obsidian-atb`.
3. Copy these files from the repository root into that folder:
   - `manifest.json`
   - `main.js`
   - `styles.css` if you add one later
4. In Obsidian, go to **Settings -> Community plugins**.
5. Turn off **Safe mode** if needed.
6. Click **Reload plugins** or restart Obsidian.
7. Enable **Automatic Time Blocking**.

## Hot reload development workflow

There are two practical workflows.

### Option 1: Keep the repo inside the vault plugin folder

This is the simplest option for day-to-day plugin development.

1. Put this repository at:
   - `<your-vault>/.obsidian/plugins/obsidian-atb/`
2. Run:

```bash
npm install
npm run dev
```

3. In Obsidian, enable the plugin from **Settings -> Community plugins**.
4. After code changes rebuild, reload the plugin in Obsidian.
5. If you use an Obsidian hot reload plugin, it may reload automatically when `main.js` changes.

Why this is usually best:

- Obsidian is reading the exact files your build is updating
- no copy step is needed
- it is easier to iterate quickly

Tradeoff:

- your plugin repo now lives inside a vault folder, which some people do not like for organization reasons

### Option 2: Keep the repo outside the vault and sync it into plugins

This is fine if you want your git repos stored separately from your vaults.

You can do that in two ways:

- copy built files into `.obsidian/plugins/obsidian-atb/` after rebuilds
- create a symlink or junction so `.obsidian/plugins/obsidian-atb/` points to your repo

For fast iteration, a junction or symlink is usually better than manual copying.

If you use manual copying, `npm run dev` still helps because it rebuilds automatically, but you still need to move the changed output into the vault plugin folder before Obsidian sees it.

## What hot reload means here

`npm run dev` recompiles the plugin when source files change.

That alone does not guarantee Obsidian will reload the plugin code automatically. In practice, you usually need one of these:

- an Obsidian hot reload plugin that watches the plugin files and reloads them
- manually using **Reload plugins** in Obsidian
- restarting Obsidian

So the usual setup is:

- keep `npm run dev` running in a terminal
- edit TypeScript files
- let the build regenerate `main.js`
- let Obsidian hot reload the plugin or manually reload it

## Recommended dev workflow

- Preferred: keep the repo directly in `.obsidian/plugins/obsidian-atb/` during active development.
- Keep `npm run dev` running while you edit the plugin.
- Run `npm test` as the default fast verification path before opening Obsidian.
- Use an Obsidian hot reload plugin if you want the tightest feedback loop.
- If the repo lives outside the vault, use a junction, symlink, or a copy step so Obsidian can see rebuilt files.
- If reload behavior seems inconsistent, use **Reload plugins** before assuming the build failed.

## Preferred verification workflow

Use this order by default:

1. Run `npm test`.
2. If the change affects planning, rerun replacement, task intake, or completion sync, add or update a fixture-backed test first.
3. Only after the automated harness passes, run a small manual Obsidian smoke check for host-specific behavior.

The harness currently covers:

- active-note planning runs against in-memory note fixtures
- deterministic planner-section rebuilding
- same-note completion sync behavior
- cross-note completion sync behavior
- pure Kanban parsing and Kanban card movement helpers

The manual Obsidian smoke pass is still required for:

- plugin load and startup behavior inside the real host app
- command registration and ribbon wiring
- settings tab rendering and interactive settings edits
- real plugin interoperability that depends on host-managed state

## Turning a manual bug into a characterization test

When you find a bug during manual Obsidian use:

1. Copy the smallest note state that reproduces it.
2. Encode that note state as fixture text in a harness test under `tests/`.
3. Include any required settings, active note path, external source notes, or Kanban boards in the scenario setup.
4. Assert the exact final note text or task state that should result.
5. Reproduce the current broken behavior first if needed, then fix the implementation and keep the test.

Good candidates for characterization coverage are:

- planner reruns that duplicate or fail to replace generated output
- same-note sync regressions
- cross-note sync regressions
- planning bugs that depend on external note scope, time markers, or Kanban intake

## Optional CLI smoke automation

Obsidian now has an official CLI, which may become useful for a narrow smoke path later. For this repository, it is currently treated as supplemental only.

Why it is not the primary path:

- the fixture-backed harness already provides deterministic note-state setup and assertions
- the current test needs are centered on note mutation and sync correctness, which are easier to debug in the harness
- the CLI docs do not yet justify making plugin-command smoke coverage a required dependency for contributors or agents

Current decision:

- keep `npm test` as the required local regression path
- keep manual Obsidian smoke checks for host behavior
- defer any `obsidian-cli` automation until it proves distinct value for this repo

## Current prototype behavior

The current prototype supports:

- a real settings tab
- a command named `Generate time blocks from active note`
- parsing open or in-progress Markdown task lines from the active note
- NotePlan-like rerun behavior that excludes tasks already inside the configured planner section when rebuilding the plan
- preservation of nested open subtasks beneath their parent task in generated output
- duration markers in the form `[30m]` or `@30m`
- priority ordering based on Obsidian Tasks priority markers, from highest to lowest, with unmarked tasks between medium and low priority
- writing generated blocks under a configurable heading in the active note, including configurable heading level and heading text
- snapping generated block start times to a configurable interval and skipping tasks that would exceed the configured work day
- Dataview mode uses Dataview's whole-vault index for external task discovery, while built-in mode remains the scoped note-and-folder fallback
- selected Markdown-backed Kanban boards can be configured as first-party task sources with per-board column mappings
- the current Kanban integration targets Markdown-backed boards that use `## Column` headings with bullet cards
- a global `Completion sync` setting that can turn completion syncing on or off
- bidirectional completion syncing between generated planner tasks and their source tasks, including Kanban done/reopen board movement, cross-note sync, and same-note directional sync

It does not yet implement:

- task intake from the Obsidian Tasks plugin API
- advanced scheduling heuristics
- emoji-preservation logic beyond keeping task text as written
