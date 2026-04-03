## Context

The repository currently has a minimal automated test setup centered on `src/kanban.ts` and a manual developer workflow for validating plugin behavior inside Obsidian. Core product logic such as task intake, plan generation, rerun replacement behavior, and completion sync still lives close to the Obsidian plugin entrypoint, which makes it hard to exercise behavior outside the app. The current pain point is not only missing tests, but the lack of a fast agent-friendly execution path that can reproduce bugs without repeated rebuild/reload/copy loops.

Recent repo comparison across other Obsidian plugins suggests that the pragmatic pattern is not a broad simulated Obsidian runtime. The most relevant examples instead use narrow `obsidian` mocks, in-memory vault or file abstractions, and fixture-driven scenario tests, with optional real-app smoke coverage kept small.

## Goals / Non-Goals

**Goals:**

- Create a fast local verification loop for core plugin behavior without requiring a full interactive Obsidian session.
- Make the most bug-prone plugin behavior testable through fixtures and deterministic mocks.
- Separate pure planning and sync logic from Obsidian API wiring enough to support agentic debugging and automated regression coverage.
- Preserve a small manual smoke-test path for integration confidence inside real Obsidian.
- Keep the workflow lightweight enough for a prototype project.

**Non-Goals:**

- Fully emulate the entire Obsidian application runtime.
- Replace all manual Obsidian validation.
- Introduce a heavyweight browser or Electron test stack unless simpler mocking proves insufficient.
- Guarantee `obsidian-cli` coverage for every plugin behavior.

## Decisions

### Prefer narrow adapters and fixture state over a broad mocked runtime

The primary test path will be a local harness built from fixture-backed note content, in-memory vault and active-file adapters, and a small set of Obsidian test doubles. This gives deterministic inputs, easy assertion of note mutations, and a good fit for agentic debugging without needing to recreate the host application. A CLI-only approach is attractive for realism, but it is riskier as a foundation because plugin execution hooks, vault state setup, and command assertions are often less direct than purpose-built fixtures.

Alternative considered:

- Use `obsidian-cli` as the main test runner. Rejected as the primary solution because it may help with smoke validation, but it does not inherently solve fine-grained state inspection, fault isolation, or test determinism.

### Extract core behavior behind a narrow adapter boundary

Core flows such as source-task collection, scheduling, planner-section replacement, and completion sync should move behind functions or services that accept plain data structures and explicit adapters for vault access, active note access, and settings. The plugin entrypoint remains responsible for registering commands and bridging Obsidian APIs.

Alternative considered:

- Test `src/main.ts` as-is with broad stubbing. Rejected because it would preserve a monolithic entrypoint and keep future test setup brittle.

### Use fixture-driven scenario tests for behavior coverage

The harness should model realistic notes, planner sections, and cross-note sync scenarios using text fixtures. Tests should assert both returned metadata and resulting Markdown content so regressions can be understood from file diffs.

Alternative considered:

- Limit tests to unit-level helper coverage. Rejected because the main pain point is workflow-level confidence, not only small helper correctness.

### Organize extracted seams around current `main.ts` responsibilities

The current plugin entrypoint already reveals the most valuable extraction seams. The harness should target those seams directly instead of inventing a generalized runtime layer.

The first extraction candidates are:

- task collection and filtering for the active planning note, external task sources, and Kanban boards
- scheduling and planner-line generation from parsed tasks plus busy ranges and manual blocks
- planner section upsert and rerun replacement behavior
- completion sync in both directions between generated planner tasks and source markdown or Kanban items

The plugin class can continue to own command registration, settings UI, modal display, and app lifecycle wiring.

### Keep manual Obsidian checks as a small documented smoke suite

Real-app validation remains necessary for plugin loading, command registration, settings UI rendering, and any behavior that depends on actual Obsidian plugin interoperability. The documented workflow should clearly distinguish these smoke checks from the automated mocked suite.

Alternative considered:

- Eliminate manual validation entirely. Rejected because this is still a plugin prototype running in a host application.

## Risks / Trade-offs

- [Over-mocking diverges from real Obsidian behavior] → Keep the adapter surface small and reserve a documented smoke suite for host-specific behavior.
- [Refactoring for testability could sprawl] → Limit extraction to behavior already needed by end-to-end fixture scenarios.
- [Optional CLI smoke tests add maintenance cost] → Treat `obsidian-cli` support as supplemental and only keep it if it provides distinct validation value.
- [Existing bugs may be tightly coupled to current entrypoint state] → Add characterization tests around current behavior before making larger moves.

## Proposed Test Architecture

### Layer 1: pure helper tests

Keep and expand tests for logic that is already mostly pure, such as `src/kanban.ts`, task-text parsing helpers, time-window calculations, and fingerprint generation.

### Layer 2: fixture-backed workflow tests

Add scenario tests around extracted services using in-memory notes and explicit inputs. These should cover the behaviors that currently require manual verification:

- generating planner output from active-note tasks
- including external source tasks and Kanban-derived tasks
- rerunning generation and replacing the planner section without damaging surrounding note content
- syncing planner completion state back to markdown tasks and Kanban cards
- syncing source changes forward into generated planner tasks

### Layer 3: thin plugin wiring tests

Use very small Obsidian doubles for `Plugin`, `MarkdownView`, `TFile`, vault access, and `Notice` to verify that the plugin entrypoint calls the extracted services correctly for command handlers and modify events.

### Layer 4: manual or optional CLI smoke tests

Keep a short real-app checklist for plugin load, command availability, settings UI, and one representative generate flow. If `obsidian-cli` proves stable enough, it may automate part of this layer later, but this layer should stay intentionally small.

## Proposed Module Boundary Direction

Without overcommitting to exact filenames, the codebase should evolve toward a shape similar to:

- `src/main.ts`: plugin lifecycle, commands, settings tab, notices, modal launching, event wiring
- planning module: task sorting, scheduling, planner-line generation, section rendering inputs and outputs
- task intake module: markdown task extraction, external note discovery, Dataview normalization, filter application
- sync module: planner fingerprint parsing, source task state updates, planner task state updates, same-note snapshot logic
- test helpers: in-memory vault state, active-file selection, fixture builders, and narrow `obsidian` test doubles

## Migration Plan

1. Identify the highest-value behaviors that currently require manual Obsidian validation.
2. Extract minimal seams from `src/main.ts` into testable modules and adapters.
3. Introduce a mocked vault/runtime harness with fixture helpers.
4. Add scenario tests for planning generation, rerun replacement, and completion sync.
5. Update development docs with the new preferred verification loop and remaining manual smoke checks.
6. Optionally add a CLI-based smoke path only if it proves stable and useful.

Rollback is low risk because this is a development workflow change. If the harness introduces too much complexity, the project can keep the extracted modules and drop the optional CLI layer while retaining the improved tests.

## Open Questions

- Which concrete bug flows should become the first characterization tests?
- Does the project want to standardize on Node's built-in test runner, or is a dedicated test framework acceptable if needed?
- Is `obsidian-cli` mature enough for plugin-command smoke tests in this repo, or should it remain an explicitly deferred experiment?
