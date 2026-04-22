# Proposal: Settings UI UX Audit & Improvements

- **Status:** Draft
- **Scope:** `AutomaticTimeBlockingSettingTab` in `src/main.ts`
- **Reviewed range:** `src/main.ts:4662-5628` (~900 lines, ~35 settings in a mostly flat list)

This proposal captures a UX audit of the plugin settings tab and recommends
concrete changes to reduce friction, fix small bugs, and make the pane easier
to scan and understand. No code changes have been made yet; items are listed
in priority order so they can be tackled incrementally.

---

## High-impact issues (bugs / real friction)

### 1. Timeframe rows re-render on every keystroke and steal focus

`src/main.ts:5042-5071` calls `saveTimeframeRow()` inside `onChange`, which
ends with `this.display()` (`src/main.ts:4687`). The full settings pane is
rebuilt after every character — the user loses focus/selection mid-typing,
and `normalizeTimeframesForDisplay` lowercases/trims partial input and drops
a row the moment the name is empty.

**Fix:** only re-render on `blur`/commit, or write directly into the existing
row without rebuilding the DOM. Normalize on blur, not on change.

### 2. Keystroke-level "fallback to default" silently reverts valid edits

Several fields coerce empty/invalid input back to the default on every
keystroke:

- `plannerHeading` — `src/main.ts:4789`
- `dayStartTime`, `workDayEndTime` — `src/main.ts:4805`, `src/main.ts:4821`
- `defaultDurationMinutes`, `startIntervalMinutes`, `breakDurationMinutes`,
  meeting buffers — `src/main.ts:4836-4862`, `src/main.ts:5106-5142`

**Effect:** if the user clears the field to retype `"30"`, it momentarily
becomes the default; if they typo `"3a0"`, the setting silently reverts
without feedback.

**Fix:** validate + only commit on blur; show inline error state when
invalid; preserve the raw text in the input.

### 3. No validation for HH:MM / `start < end`

Day start, work day end, and timeframe start/end accept any string. Entering
`"25:00"` or end-before-start is accepted silently.

**Fix:** validate regex `^([01]?\d|2[0-3]):[0-5]\d$`; show inline error;
`Notice` + highlight when start ≥ end.

### 4. Custom "Planning task states" buttons are non-standard and inaccessible

`src/main.ts:4914-4988` creates its own pseudo-Setting with three buttons
labelled `"Open [ ] On"` / `"Open [ ] Off"`.

Issues:

- Duplicates the empty `new Setting(containerEl).setName("Planning task states")`
  just above at `src/main.ts:4879`, producing two visual rows.
- Buttons use inline styles, no `aria-pressed`, and the text carries the
  state (`"On"/"Off"`) — screen readers read the whole label each toggle.

**Fix:** use three standard `addToggle` rows
("Open tasks `[ ]`", "In progress `[/]`", "Rescheduled `[>]`"), or a single
`Setting` with three toggles via `setClass`. Keep the "at least one" guard.

### 5. Calendar actions / Debug log appear regardless of state

- `src/main.ts:5594-5608` ("Calendar sync actions" with Refresh/Preview) shows
  even when `remoteCalendarUrls` is empty — clicking does nothing useful.
- `src/main.ts:5525-5540` "Debug log" sits between Kanban and Remote calendars
  — unrelated concern.

**Fix:** hide (or disable with tooltip) the actions row when no calendars
are configured; move Debug log into an "Advanced / Troubleshooting" section
at the bottom.

---

## Structure & grouping

The only `h3` headings are "Task discovery" (`src/main.ts:5180`) and
"Kanban boards" (`src/main.ts:5386`). Everything else is a flat scroll with
unrelated concerns interleaved.

### Recommended sections (in order)

- **Planner output** — `plannerHeadingLevel`, `plannerHeading`
- **Scheduling window** — `dayStartTime`, `workDayEndTime`, `automaticStartMode`
- **Block sizing** — `defaultDurationMinutes`, `startIntervalMinutes`,
  `breakDurationMinutes`, `splitTasksAcrossGaps`
- **Source task selection** — planning task states, `includeTasksWithText`,
  `excludeTasksWithText`, `enableCompletionSync`
- **Timeframes**
- **Task discovery** — focused mode, built-in vs Dataview, source notes/folders
- **Kanban boards**
- **Remote calendars** — URLs, sync actions, ignored patterns, meeting buffers
  *(move from top into here)*
- **Advanced / Troubleshooting** — Debug log

### Structural notes

- The top `h2 "Automatic Time Blocking"` at `src/main.ts:4745` is redundant —
  the settings tab already has this title.
- Meeting buffers (`src/main.ts:5106-5142`) belong with the calendar section,
  not between Timeframes and task filters.

---

## List / row patterns (timeframes, source notes, folders, Kanban, calendars)

The current pattern repeats 5 times: a header Setting describing the list,
a "No X yet" paragraph, N rows, and a separate "Add X" Setting with its own
description (e.g. `src/main.ts:5267-5297`, `src/main.ts:5347-5377`,
`src/main.ts:5486-5523`, `src/main.ts:5583-5592`).

### Recommendations

- Replace "Add X" Setting rows with a single `addButton("+ Add …")` placed
  inside the section header's Setting — halves the vertical space.
- Extract a shared helper
  (`renderListSection({ title, desc, items, renderRow, onAdd, emptyText })`)
  so all five lists have consistent UX.
- Add **reorder** (up/down arrows) for timeframes and Kanban boards — order
  matters for tiebreaking.
- For Kanban boards, 4 Setting rows per board (`src/main.ts:5400-5484`) is
  visually overwhelming. Wrap per-board settings in a `<details>` collapsed
  by default, titled by `boardPath`.
- **Timeframe rows** (`src/main.ts:5038-5086`) show 3 unlabelled text boxes
  side-by-side. Add small labels "Tag", "Start", "End" above each, or split
  across three Settings. Placeholder text alone is not sufficient.

---

## Conditional / state-dependent settings

`focusedAtbMode` (`src/main.ts:5182-5195`) and `externalTaskDiscoveryMode`
(`src/main.ts:5197-5212`) interact:

- When focused mode is on, the "Task discovery mode" dropdown is still
  visible but ignored — confusing. **Disable** it (`dropdown.setDisabled(true)`)
  with a hint like "Disabled while Focused mode is on."
- When Dataview mode is active, the "Dataview discovery" Setting at
  `src/main.ts:5379-5383` is just a read-only notice. Add a link/button
  "Open Dataview plugin" or show whether Dataview is actually installed/enabled
  (fall back to a warning if not).
- Kanban boards section is still shown in focused mode even though it is
  ignored. Either hide it or grey it out with a notice.

---

## Microcopy & labels

- **"Planner heading text"** description (`src/main.ts:4780-4783`): the inline
  heading preview is plain text. Render the preview in a `<code>` element
  inside `setDesc` with `createEl`.
- **"Include/Exclude tasks matching text"** (`src/main.ts:5144-5178`):
  `textArea.inputEl.cols = 40` has no effect in flex layout — drop it and
  use a CSS class. Add a small "regex help" link/details.
- **"Preview active note"** button label (`src/main.ts:5605`) reads
  ambiguously. Rename to "Preview today's busy events" or similar.
- **"Automatic start mode"** option labels "Nearest snapped time" /
  "Current time" (`src/main.ts:4770-4771`) are fine, but the description
  could give a concrete example ("With a 15-minute interval at 10:07,
  *snapped* starts 10:15; *current* starts 10:07.").
- **"Add timeframe"** (`src/main.ts:5092-5103`) auto-generates `timeframe-N`
  then immediately normalizes — forces the user to rename right away. Prefer
  opening the row in edit state with an empty name that is not persisted
  until filled.
- **"Source note N" / "Kanban board N"** — numeric labels don't help users
  scan. Use the file's basename as the Setting name and the full path as
  the description.

---

## Input type improvements

Text inputs that are really numbers/times would benefit from native HTML
input types:

- `startIntervalMinutes`, `defaultDurationMinutes`, `breakDurationMinutes`,
  meeting buffers → `text.inputEl.type = "number"; text.inputEl.min = "0"`.
- `dayStartTime`, `workDayEndTime`, timeframe start/end →
  `text.inputEl.type = "time"` (HTML5 time picker). This also sidesteps
  validation issues.
- A slider (`setLimits(0, 60, 5)`) already used for heading level would suit
  `startIntervalMinutes` nicely.

---

## Accessibility & polish

- Planning-state buttons: add `aria-pressed={currentValue}`, remove state
  text from the visible label (use a check icon or `mod-cta`).
- All inline `style.*` assignments (`src/main.ts:4932-4945`) should move to
  a stylesheet — easier theming, respects user CSS snippets.
- Destructive actions (remove note/folder/board/calendar) have no
  confirmation. A `Notice` with "Undo" is a lightweight improvement, or a
  `ConfirmModal` for Kanban (which has nested config).
- No "Reset to defaults" for individual sections or the whole plugin.
- Tooltips (`addExtraButton().setTooltip(...)`) are used for trash icons but
  not for the advanced text fields — adding `title`/tooltip on include/exclude
  fields would help.

---

## Suggested quick-win order

1. **Stop re-rendering on every keystroke** (#1) — biggest felt improvement.
2. **Commit on blur with validation** for HH:MM and numeric fields (#2, #3).
3. **Replace custom planning-state buttons** with three toggles (#4).
4. **Reorganize into sections** via `h3` headings in the order above.
5. **Hide calendar actions when no calendars** and move Debug log to Advanced (#5).
6. **Collapse per-Kanban-board settings** into `<details>`.
7. **Numeric/time input types** + slider for interval.

Items 1–3 are correctness/bug fixes and could ship as a focused PR. Items
4–6 are a layout refactor suitable for a follow-up PR. Item 7 is
independent polish.
