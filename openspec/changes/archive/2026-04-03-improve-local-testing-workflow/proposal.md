## Why

The plugin currently relies on manual rebuild, copy/junction, and in-app Obsidian verification loops, which makes regressions slow to diagnose and expensive to iterate on. With obvious bugs already slipping in, the project needs a faster agent-friendly way to exercise plugin behavior outside full manual Obsidian sessions.

## What Changes

- Add a dedicated local testing harness for core plugin behavior that can run outside the Obsidian UI.
- Introduce a clear split between pure domain logic and Obsidian-specific integration points so core scheduling and parsing behavior can be tested with fixtures.
- Define a narrow set of Obsidian test doubles plus in-memory vault and active-note adapters for the scenarios that matter to this plugin, rather than attempting to emulate the full app runtime.
- Add test workflows for representative end-to-end cases such as generating time blocks, rerunning plans, and syncing task completion from planner output back to source tasks.
- Document a preferred developer loop for fast verification, including what should be tested in mocks versus what still requires manual Obsidian validation.
- Evaluate whether `obsidian-cli` is useful as a supplemental smoke-test path, but do not make the workflow depend on it if the mocked harness covers the core behavior more reliably.

## Capabilities

### New Capabilities

- `local-plugin-test-harness`: Provide a repeatable local test harness for plugin behavior using fixtures, narrow Obsidian mocks, and in-memory note state.
- `development-verification-workflow`: Define the supported development workflow for fast local verification and the boundary between automated harness tests and manual Obsidian checks.

### Modified Capabilities

- None.

## Impact

- Affected code will likely include `src/main.ts` and extracted helper modules for task parsing, plan generation, planner-section replacement, completion sync, and vault interactions.
- Adds or expands automated tests, fixtures, and test helpers under a dedicated test structure with in-memory file and workspace adapters.
- May add a small number of dev-only dependencies if required for mocking or fixture execution.
- Updates development documentation to reduce back-and-forth manual copy/paste testing.
