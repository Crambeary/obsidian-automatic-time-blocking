## Context

The current kanban movement coverage checks for card text appearing somewhere after a target heading, but it does not verify that the moved card remains inside the board's parseable region. This leaves a gap where a planner-synced card moved to `Done` can be inserted below the Obsidian Kanban footer/settings block, causing `extractKanbanBoard` to stop associating the card with any column even though the markdown still contains it.

This change is centered on local automated testing rather than user-facing behavior changes. The design therefore focuses on making the regression reproducible in fixtures and asserting board structure through the same parsing path the plugin uses during sync.

## Goals / Non-Goals

**Goals:**
- Add a fixture that reproduces a kanban board with trailing footer/settings content.
- Ensure regression coverage validates that a moved card remains parseable in the expected column after being marked done.
- Prefer parse-based assertions over raw string-only matching so tests reflect board behavior, not just markdown presence.
- Keep the test changes small and local to the existing kanban test surface.

**Non-Goals:**
- Changing production kanban parsing or movement behavior in this artifact.
- Redesigning the broader test harness or introducing new test frameworks.
- Expanding coverage to unrelated kanban sync scenarios beyond this footer/settings regression.

## Decisions

### 1. Add a dedicated regression fixture that includes the kanban footer/settings block
A new or updated fixture should mirror the real board structure that triggers the bug: normal kanban columns followed by the `%% kanban:settings` section and fenced JSON block. This keeps the regression easy to understand and avoids encoding the failure scenario inline in the test.

**Rationale:** The existing default fixture ends at the last column and cannot expose insertion bugs that occur after a footer block.

**Alternatives considered:**
- Reuse the existing default fixture and add more permissive assertions. Rejected because it does not reproduce the boundary where the bug occurs.
- Build the markdown inline in the test. Rejected because it is harder to reuse and less representative of real boards.

### 2. Assert on parsed board structure after each move
The test should re-run `extractKanbanBoard` on the updated content and locate the moved card by fingerprint. Assertions should confirm the card is still present, is assigned to the expected column, and has the expected checkbox status.

**Rationale:** The observed bug preserves the raw task text while breaking rendering. Parse-based assertions directly test the behavior users care about.

**Alternatives considered:**
- Keep regex-only assertions that check card text after a heading. Rejected because they can pass even when the card is no longer inside the board.
- Assert only on raw line ordering. Rejected because ordering alone does not prove the parser still recognizes the card correctly.

### 3. Add a boundary assertion that the moved card stays above the footer/settings block
In addition to parse-based assertions, the regression test should confirm the moved card line appears before the footer/settings marker in the resulting markdown.

**Rationale:** This captures the specific failure mode and makes regressions easier to diagnose when the parser result alone is insufficient to show why the card disappeared.

**Alternatives considered:**
- Rely only on parser output. Rejected because the direct placement assertion gives clearer failure messages for this regression shape.

## Risks / Trade-offs

- [Fixture drift from real-world kanban output] → Mirror the Obsidian Kanban footer/settings layout from the reported failing board and keep the fixture minimal.
- [Tests become too coupled to formatting details] → Assert only on meaningful structure: card identity, destination column, checkbox state, and position relative to the footer marker.
- [Coverage remains too narrow to protect reopen behavior] → Preserve the existing reopen assertions and, where practical, re-parse after reopening as well.

## Migration Plan

No deployment or data migration is required. The change is limited to OpenSpec guidance for test and fixture updates. During implementation, the work should be validated by running the existing local test command for the kanban test suite and confirming the new regression fails before the fix and passes after it.

## Open Questions

- Should the footer/settings regression be added as a new dedicated fixture file or folded into an expanded existing kanban fixture?
- Is there a second parser edge case around reopening cards from `Done` back into an active column when footer/settings blocks are present?
