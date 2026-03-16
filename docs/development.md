# Development Setup

This project can be loaded into Obsidian as a developer build while you iterate on the plugin.

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
7. Enable **Obsidian Automatic Time Blocking**.

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
- Use an Obsidian hot reload plugin if you want the tightest feedback loop.
- If the repo lives outside the vault, use a junction, symlink, or a copy step so Obsidian can see rebuilt files.
- If reload behavior seems inconsistent, use **Reload plugins** before assuming the build failed.

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

It does not yet implement:

- task intake from the Obsidian Tasks plugin API
- Kanban note parsing
- advanced scheduling heuristics
- emoji-preservation logic beyond keeping task text as written
