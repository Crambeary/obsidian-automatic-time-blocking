## 1. Extract testable core flows

- [x] 1.1 Identify the planning, rerun, and completion-sync flows in `src/main.ts` that currently require manual Obsidian testing
- [x] 1.2 Extract minimal pure modules or service functions for those flows behind explicit settings and vault adapters
- [x] 1.3 Preserve current behavior with characterization tests for any reproduced bugs before deeper refactoring

## 2. Build the mocked local harness

- [x] 2.1 Create test helpers that model mocked vault files, active note selection, plugin settings, and note read/write operations
- [x] 2.2 Add fixture-driven scenario tests for generating time blocks from an active note and asserting final note content
- [x] 2.3 Add fixture-driven scenario tests for rerun replacement behavior so generated planner output is rebuilt deterministically
- [x] 2.4 Add fixture-driven scenario tests for same-note and cross-note completion sync behavior

## 3. Define the verification workflow

- [x] 3.1 Add or update test scripts so the local harness can be run as the default fast verification path
- [x] 3.2 Update development documentation to describe the preferred automated loop and the remaining manual Obsidian smoke checks
- [x] 3.3 Document how to turn a manually discovered bug into a reproducible fixture-backed characterization test

## 4. Evaluate supplemental smoke automation

- [x] 4.1 Investigate whether `obsidian-cli` can provide stable plugin-command smoke tests for this repository
- [x] 4.2 Add an optional CLI smoke path only if it provides distinct value beyond the mocked harness and does not become a required dependency
- [x] 4.3 Record the decision and limitations of the optional CLI approach in the development docs
