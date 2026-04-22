# Proposal: TaskNotes integration as a distinct output mode

Status: draft
Related: [TaskNotes plugin](https://github.com/callumalpass/tasknotes), [TaskNotes docs](https://tasknotes.dev/)

## Summary

Add a **TaskNotes output mode** to Automatic Time Blocking in which ATB reads
tasks from the TaskNotes ecosystem and writes the generated schedule as
TaskNotes-native `timeblocks[]` in the active daily note's frontmatter, rather
than as Day Planner-style bullets under a heading.

This is positioned as a different **mode of use**, not an additional task
source alongside Kanban or Dataview. The default Day Planner-compatible mode is
preserved unchanged.

## Motivation

TaskNotes is a full planning ecosystem with its own task model, Calendar View,
Agenda View, Pomodoro View, recurring task handling, time tracking, and
timeblock storage. Users who adopt TaskNotes generally want their plan to live
inside TaskNotes' views, not as a bullet list in the note body. Treating
TaskNotes as "just another task source feeding the current Day Planner output"
leaves most of the ecosystem on the table and creates an awkward split between
where tasks live and where the plan is rendered.

By making TaskNotes a first-class output target:

- ATB becomes the auto-scheduler inside the TaskNotes ecosystem.
- TaskNotes owns rendering (Calendar/Agenda views), drag-drop adjustment,
  completion state, and recurring task semantics.
- Completion sync complexity largely disappears: TaskNotes owns task state;
  ATB only writes plan artifacts.
- Recurring task handling simplifies: ATB only evaluates "is this task
  scheduled today?" on the planning day, rather than expanding RRULEs into
  future output.

## Non-goals

- Replacing the Day Planner-compatible output for existing users. That mode
  stays as the default.
- Supporting all TaskNotes features (Pomodoro association, time tracking
  sessions, ICS events as blocks, Bases formulas). Scope is limited to
  reading tasks and writing timeblocks.
- Mixing non-TaskNotes task sources (Kanban, Dataview, external notes/folders)
  into the TaskNotes output mode in v1. Input is TaskNotes-only when the mode
  is active.
- Providing a TaskNotes-as-source mode that still writes bullets under a
  heading. That could be considered later, but adds a second matrix of
  behavior and is not required to unlock the main use case.

## Current state

ATB does not require the Day Planner plugin. The only references to Day
Planner are in settings description text and documentation; the actual output
is plain markdown written via `upsertHeadingSection` in
`src/planner-section.ts`. The plugin already has a multi-source architecture
in `src/main.ts` (`sourceType: "markdown-task" | "kanban-card"`, plus external
note/folder and Dataview discovery) and a completion-sync mechanism for
Kanban and external sources.

## TaskNotes surfaces relevant to this proposal

From the TaskNotes repo and docs:

- Each task is a Markdown file identified by a configurable tag in frontmatter
  (default `task`). Fields are user-remappable via TaskNotes' FieldMapper.
  Key fields: `title`, `status`, `priority`, `due`, `scheduled` (date or ISO
  datetime), `timeEstimate` (minutes), `tags`, `contexts`, `projects`,
  `recurrence` (RFC 5545), `complete_instances`, `archived`.
- Timeblocks live in the **daily note's** frontmatter as
  `timeblocks: TimeBlock[]`. Each block has
  `{ id, title, startTime: "HH:MM", endTime: "HH:MM", attachments?: string[],
  color?, description? }`. Validated by `validateTimeBlock` and rendered by
  the TaskNotes Calendar/Agenda views.
- Feature is gated by `enableTimeblocking` in TaskNotes settings.
- Documented integration surfaces: HTTP API (desktop-only, opt-in),
  Webhooks, Bases. No documented in-process JS API; TaskNotes' internal
  `cacheManager` is private and refactored frequently.
- Formal spec at `https://tasknotes.dev/spec/` covers data model, temporal
  semantics (ISO 8601 UTC `Z` canonical), recurrence, and validation.

## Proposed design

### New setting

- `outputMode: "planner-heading" | "tasknotes-timeblocks"`
  - default `"planner-heading"` (preserves current behavior for existing users)

When `outputMode === "tasknotes-timeblocks"`:

- Task input: TaskNotes task notes only. Other sources (Kanban, Dataview,
  external notes/folders) are inactive for the duration of that run.
- Output sink: the active daily note's frontmatter `timeblocks[]` array.
- Planner-heading settings (`plannerHeading`, `plannerHeadingLevel`) do not
  apply.

### TaskNotes input adapter

- Discover task files via `app.metadataCache.getFileCache()` across the vault.
  Admit files whose frontmatter contains the configured task tag (via
  Obsidian's cached `tags[]`) and is not archived.
- Do **not** rely on `app.plugins.getPlugin("tasknotes").cacheManager` as a
  stable API. Optionally peek at TaskNotes settings to auto-fill field-key
  defaults, but treat it as best-effort and fall back to user-provided keys.
- Expose user-overridable settings for:
  - task tag (default `task`)
  - field keys for `status`, `scheduled`, `due`, `timeEstimate`, `tags`,
    `priority`, `projects`
  - statuses treated as "open" and "in-progress"
  - folder scope (default: vault-wide; respect an exclude list)
- Map each TaskNotes task to a `ParsedTask` with a new `sourceType:
  "tasknotes-task"`:
  - `durationMinutes`: from `timeEstimate` (fallback to
    `defaultDurationMinutes` when absent).
  - `manualStartMinutes`: when `scheduled` is a datetime and its calendar day
    matches the planning day, extract HH:MM (per the TaskNotes temporal
    spec, §3.3/§3.5). When `scheduled` is date-only and matches the planning
    day, leave unset. When it does not match the planning day, exclude the
    task from this run.
  - synthesized hashtag set for the existing include/exclude and
    timeframe/manual-block matchers: union of `tags[]`, `#context` from
    `contexts[]`, and `#projectname` from `projects[]`, plus a tokenized
    title.
  - `text`: task title (links/hashtags stripped as with markdown tasks).
  - fingerprint: task file path (stable; one note per task).

### Recurring tasks

For v1 in TaskNotes mode:

- Treat a task as eligible for today if its `scheduled` date equals the
  planning day, or if its recurrence produces an occurrence on the planning
  day and that day is not present in `complete_instances` or
  `skipped_instances`.
- Limit recurrence support to a documented subset of RFC 5545 (DAILY,
  WEEKLY with BYDAY, MONTHLY by nth weekday or date). Fall back to "not
  eligible today" for unsupported rules, with a warning in the run summary.
- Full RRULE support (or using the TaskNotes HTTP API's pre-expanded query)
  is a follow-up.

### TaskNotes output writer

- Require the active note to be a daily note (detected via Obsidian's
  Daily Notes or Periodic Notes plugin when present, else via a configurable
  date pattern in the file path).
- Write via `app.fileManager.processFrontMatter`:
  - Read existing `timeblocks[]`.
  - Partition into ATB-authored and user-authored entries using a stamp in
    the `id` field (e.g., prefix `atb-<fingerprint>`) or a private
    `description` convention. ATB-authored stamping convention is documented
    and stable.
  - Schedule around user-authored entries (they act like today's
    `- HH:MM - HH:MM #tag` manual block bullets).
  - Replace only ATB-authored entries with freshly generated ones.
  - Preserve unknown fields on every entry (schema may evolve).
- Each generated entry:
  - `id: "atb-<deterministic-fingerprint>"` so reruns replace in place.
  - `title`: the task title.
  - `startTime`/`endTime`: `HH:MM`, validated against TaskNotes'
    `timeRegex` (`^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$`).
  - `attachments: ["[[<task path>|<title>]]"]` linking to the source task
    note.
  - `description`: optional ATB marker (e.g., `"generated-by:atb"`).
  - `color`: optional, from a future per-timeframe color setting.

### Manual guidance in TaskNotes mode

- Primary: user-authored timeblocks already present in the daily note's
  frontmatter. ATB treats them as tagged availability windows, analogous to
  today's manual block bullets.
- Secondary (transition aid): continue to parse the existing `- HH:MM - HH:MM
  #tag` bullet syntax from the note body so users migrating in place do not
  have to re-author their manual windows immediately.

### Completion sync

In TaskNotes mode, ATB does **not** write task status back. TaskNotes owns
task state, and users complete tasks via TaskNotes' own surfaces. Generated
timeblocks are plan artifacts and remain in the daily note as a historical
record.

Existing completion sync for markdown and Kanban sources is unaffected,
because those sources are inactive in TaskNotes mode.

### Discoverability and error handling

- Add a "Preview TaskNotes timeblocks" command that generates without
  writing and surfaces a notice listing each planned block, for users whose
  Bases/Calendar configuration hides output.
- If the active note is not a daily note, surface a clear notice and do not
  run.
- If `enableTimeblocking` appears disabled in TaskNotes settings (best-effort
  check), emit a notice pointing to the setting, but still write; the data
  remains valid and visible if the user later enables the feature.

## Risks

| # | Risk | Mitigation |
|---|------|------------|
| 1 | TaskNotes schema changes (v4 -> v5) break the writer | Write only documented `TimeBlock` fields; preserve unknown fields on read; include a version guard and a documented minimum TaskNotes version |
| 2 | User-remapped frontmatter keys cause adapter to miss tasks | Expose field keys in ATB settings; best-effort read of TaskNotes settings as defaults |
| 3 | ATB stomps user drag-drop adjustments made in Calendar view | `atb-` id stamp convention, only replace ATB-authored entries |
| 4 | Recurring task logic subtle errors | v1 supports documented subset only; log unsupported rules; follow-up work for parity |
| 5 | Users lose the at-a-glance markdown plan | Mode is opt-in; Preview command mitigates; docs make the trade-off explicit |
| 6 | Active note is not a daily note | Pre-flight check; clear notice and abort |
| 7 | Private TaskNotes APIs assumed by accident | Adapter reads only frontmatter via MetadataCache; settings peek is marked best-effort and always has a fallback |
| 8 | Timezone drift on `scheduled` datetimes | Follow TaskNotes temporal spec §3 (canonical UTC `Z`), evaluate day boundaries in the user's local timezone per §3.6 |
| 9 | Settings sprawl | New settings live under a single "TaskNotes integration" section; inapplicable existing settings are visibly disabled when mode is active |
| 10 | Mobile vs desktop parity | Implementation uses MetadataCache and `fileManager.processFrontMatter` only, both of which work on mobile. Do not take a dependency on the HTTP API. |

## Alternatives considered

- **TaskNotes as a parallel task source** writing to the existing planner
  heading. Ships faster but leaves TaskNotes' own Calendar/Agenda views out
  of the loop and forces a second source of truth for the plan. Can still be
  offered later if demand exists.
- **Dual output (heading + timeblocks)** in one run. Rejected for v1 because
  it doubles the write surface and the stomp-protection story without a
  clear user need.
- **HTTP API input**. Gives pre-expanded recurring occurrences and
  normalized fields, but desktop-only, opt-in, requires a port and optional
  token, and excludes mobile. Could be an optional enhancement later.
- **Direct use of `plugin.cacheManager`**. Rejected: undocumented, private,
  and actively refactored in the TaskNotes repo.

## Rollout

1. Ship the adapter, writer, settings, and preview command behind the new
   `outputMode` toggle. Default remains `"planner-heading"`.
2. Document the mode in `README.md` and a new `docs/tasknotes-mode.md` with
   setup steps (enable TaskNotes timeblocking, enable Bases, configure
   Calendar View `Show timeblocks`).
3. Gather feedback from TaskNotes users; revisit recurring task coverage
   and optional HTTP API input for v2.

## Open questions

- Should ATB use TaskNotes' HTTP API opportunistically when it is enabled, to
  get pre-expanded recurring occurrences on desktop? Leaning no for v1.
- Should ATB attempt to read TaskNotes' `excludedFolders` setting to avoid
  scanning folders TaskNotes itself ignores? Leaning yes (best-effort).
- What minimum TaskNotes version do we commit to support? Proposed: v4 and
  later (the current major line with timeblock schema stability).
- Should per-timeframe colors map to TaskNotes' `color` field on generated
  timeblocks? Leaning yes as a follow-up.
