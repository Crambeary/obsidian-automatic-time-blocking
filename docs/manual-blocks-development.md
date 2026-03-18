# Manual Block Layers Development Plan

## Goal

Add manual block layers to the daily note so automatic time blocking can respect user-authored availability windows such as `#work` and `#high-energy`.

The design should support overlapping blocks, multiple conceptual layers, and fallback use of block time by untagged tasks after matching tagged tasks have had first access.

## Daily Note Syntax

Manual blocks are bullet points in the daily note.

Examples:

```md
- 09:00-17:00 #work
- 10:00-12:00 #high-energy
- 18:00-20:00 #personal #low-energy
```

Notes:

- blocks are line-based, not headings
- a block line is not a source task
- the text after the time range may contain one or more tags
- overlapping block lines are valid

## Scheduling Model

Manual blocks act as tagged availability windows.

Example:

```md
- 09:00-17:00 #work
- 10:00-12:00 #high-energy
```

This produces three effective periods:

- `09:00-10:00` tagged `#work`
- `10:00-12:00` tagged `#work` and `#high-energy`
- `12:00-17:00` tagged `#work`

The scheduler should reason over these effective periods rather than treating each original block line as isolated.

## Matching Rules

Task tags are matched against block tags using OR logic.

Examples:

- task tagged `#work` may use any window tagged `#work`
- task tagged `#high-energy` may use any window tagged `#high-energy`
- task tagged `#work #high-energy` may use either type of window

However, stronger matches should be preferred first.

Priority order:

1. windows matching more of the task's tags
2. windows matching fewer of the task's tags
3. normal existing scheduling order inside equally matched windows

So a task tagged `#work #high-energy` should prefer a window tagged with both before falling back to a window tagged with only one.

## Untagged Tasks

Untagged tasks are allowed to use leftover time inside manual blocks, but only after tagged tasks have had their first chance to claim matching block time.

Initial implementation rule:

- schedule tagged automatic tasks before untagged automatic tasks when manual blocks exist
- once tagged tasks are placed, untagged tasks may use any remaining free time, including unused block time

## Overlap Rules

Overlapping block windows are allowed.

Scheduled tasks themselves still cannot overlap in clock time.

The scheduler should continue using occupied time ranges to prevent double-booking.

## Manual Timed Tasks

Tasks with explicit manual start times continue to behave as explicit placements.

Initial implementation does not make manual block layers reject an explicitly timed task.

## Implementation Plan

### First slice

- parse manual block bullet lines from the active note
- extract normalized tags from each block line
- derive effective tagged windows from overlapping manual blocks
- schedule tagged automatic tasks against matching windows first
- allow fallback to lower-strength matches for tagged tasks
- schedule untagged automatic tasks afterwards using the remaining availability

### Deferred follow-ups

- global configurable early-to-late timeframe settings
- settings UI for documenting manual block behavior
- warnings for malformed block lines
- diagnostics or preview UI for parsed manual blocks
- configurable policies for whether untagged tasks may also schedule outside manual blocks
- configurable policies for whether explicitly timed tasks should warn on block mismatches

## Current First Implementation Scope

The first implementation slice is intentionally narrow:

- active-note manual blocks only
- bullet-point syntax only
- task tags inferred from task text hashtags
- existing workday bounds and calendar busy ranges still apply
- completion sync behavior remains unchanged
