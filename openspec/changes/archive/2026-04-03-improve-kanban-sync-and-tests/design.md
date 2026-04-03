## Context

The current Kanban implementation already has a strong foundation: board parsing in `src/kanban.ts`, planning-note intake and completion sync logic in `src/main.ts`, and some focused unit tests in `tests/kanban.test.js`. The main reliability gap is not basic parsing but end-to-end trust in the planner/source connection when Kanban cards are moved, reopened, or duplicated within the same board.

The most important current constraint is that planner sync identity is built primarily from rendered planner text, while Kanban source identity already has a stronger source fingerprint that distinguishes same-board duplicates by occurrence. This creates a design tension: the user-facing planner output should stay clean, but planner-driven source updates must still target the intended card and avoid unsafe ambiguity.

## Goals / Non-Goals

**Goals:**
- Preserve stable planner-to-source identity for Kanban cards, especially when same-board cards share identical visible text.
- Keep planner output user-focused rather than exposing internal Kanban lane details that are not part of planning semantics.
- Define deterministic reopen behavior when remembered or configured reopen columns are missing.
- Expand test coverage around the main Kanban user flows so regressions are caught early.
- Prefer safe failure over incorrect source updates when identity cannot be resolved confidently.

**Non-Goals:**
- Redesign the full planner rendering model for all source types.
- Change the product scope of what Kanban columns are planned by default.
- Introduce new external dependencies.
- Add broad UI changes beyond what is needed to support reliable sync and testing.

## Decisions

### Preserve a stronger machine identity than visible planner text alone
The implementation should preserve a stable source identifier for Kanban-backed planner lines so that duplicate same-board cards do not collapse into a single planner/source mapping. The preferred direction is to strengthen the machine-readable identity used for sync without forcing user-visible lane labels such as `Todo` or `Done` into the planner output.

Alternative considered:
- Rely on visible planner text alone. Rejected because duplicate same-board cards can remain ambiguous even when different boards are already distinguished by source backlink.

### Treat same-board duplicates as the primary ambiguity case
Cross-board duplicates are already narrowed by the source backlink in planner output, so the design focuses on duplicate visible text within the same Kanban board. This keeps the implementation targeted and aligned with the real remaining risk.

Alternative considered:
- Design for all duplicate cases equally. Rejected because it broadens scope without addressing the highest-risk user flow first.

### Prefer deterministic reopen fallback order
Reopen resolution should follow a strict order: remembered last active column, configured reopen column, first available active column, otherwise no move. This preserves predictability and matches the existing intent in the code.

Alternative considered:
- Reopen to any available non-done column. Rejected because it can create surprising board moves and breaks user trust.

### Add coverage at both utility and harness levels
The change should expand low-level tests for parsing and move behavior and add higher-level harness coverage for planner generation and sync. Utility tests alone are insufficient because the main trust issue spans extraction, mapping, planner rendering, and sync back to source.

Alternative considered:
- Only add unit tests in `tests/kanban.test.js`. Rejected because the planner/source connection risk lives partly in `src/main.ts` and needs integration-style verification.

### Fail safely when identity is ambiguous
If the implementation cannot safely resolve a planner-driven Kanban update to a unique source card, it should avoid moving the wrong card and surface the ambiguity through the existing diagnostic path.

Alternative considered:
- Best-effort updates against the first match. Rejected because silent wrong-card moves are worse than skipped sync.

## Risks / Trade-offs

- **[Risk] Hidden or stronger source identity may add complexity to planner sync logic** → Mitigation: keep the identity change narrowly scoped to Kanban-backed planner entries and cover it with targeted tests.
- **[Risk] Duplicate-card behavior may still be fragile if identity is derived from unstable ordering** → Mitigation: define explicit requirements and tests for duplicate same-board cards across completion and reopen flows.
- **[Risk] More comprehensive tests may require additional fixture variety and harness setup** → Mitigation: split coverage between focused utility fixtures and a few targeted harness scenarios rather than attempting full combinatorial coverage.
- **[Risk] Safe-skip ambiguity handling could leave some user actions unapplied** → Mitigation: log skipped ambiguous actions clearly so the behavior is diagnosable and can be refined later.

## Migration Plan

- Introduce the stronger Kanban planner/source identity handling behind the existing sync flow without changing external plugin configuration.
- Add the new Kanban test scenarios alongside the current parser and harness tests.
- Verify that existing Kanban behaviors continue to work for non-duplicate cases.
- If ambiguity-safe behavior causes skipped sync in edge cases, rely on debug logging for initial diagnostics rather than adding new user-facing configuration immediately.

## Open Questions

- Should the stronger Kanban planner/source identity be fully hidden from visible planner text, or should a neutral duplicate marker be added only when required?
- Should ambiguous same-board duplicate sync always be skipped, or are there cases where an explicitly stable hidden identity can eliminate the ambiguity entirely?
- Are there any current user expectations around duplicate visible task text that should be reflected in docs once implementation is complete?
