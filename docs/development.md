# Development setup

Use Node.js and npm, plus a test Obsidian vault with community plugins
allowed. Run commands from the repository root.

## Build and test

```bash
npm install
npm test
npm run build
```

`npm test` runs the fixture-backed harness. The production build writes
`dist/main.js`; `manifest.json` stays at the repository root.

For rebuilds while editing:

```bash
npm run dev
```

Watch mode rebuilds `dist/main.js`; it does not reload Obsidian or copy the
compiled file into the plugin root.

## Load a developer build

1. Open your actual vault folder, then `.obsidian/plugins/` (on every OS).
2. Create `obsidian-atb/` there.
3. Copy the root `manifest.json` and `dist/main.js` into that folder, with
   the compiled file named `main.js`.
4. Restart Obsidian or reload plugins, then enable **Automatic Time Blocking**
   in **Settings → Community plugins**.
5. Use a test note to run **Generate time blocks for active note**.

After each rebuild, copy `dist/main.js` again and reload the plugin. If the
checkout itself lives in the vault's plugin folder, the same root-level
copy is still needed because the build targets `dist/`. Alternatively,
link the two files into the plugin folder, with `dist/main.js` linked as
`main.js`; a directory link to the repository alone does not solve this.

An Obsidian hot-reload plugin can handle the host reload when the installed
`main.js` changes. Watch mode alone does not do that.

## Verification workflow

Run the automated harness before manual Obsidian checks. It covers:

- active-note planning and deterministic planner-section rebuilding
- same-note and cross-note completion sync
- focused planning and task filters
- Kanban parsing, intake, and done/reopen moves

For changes to planning, reruns, task intake, or completion sync, add or
update a fixture under `tests/` with the smallest relevant note state and
assert the resulting note text or task state.

Manual host checks remain necessary for plugin startup, command/ribbon
registration, settings rendering, and real interoperability with other
plugins. The fixture harness does not establish compatibility across
Obsidian versions or platforms.

The plugin reads Tasks-style Markdown; task intake through the Obsidian
Tasks plugin API is not implemented. Dataview-backed discovery and
Markdown-backed Kanban intake are supported paths, not generic support for
every task or board format.
