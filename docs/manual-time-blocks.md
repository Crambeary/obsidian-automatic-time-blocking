# Manual Time Blocks

Manual time blocks let you guide the scheduler by adding plain bullet points to your daily note.

Think of them as:

- reserving parts of your day for certain kinds of work
- giving tagged tasks a preferred place to land
- still letting the rest of your day schedule normally

## Quick Start

Add block bullets near the top of your daily note:

```md
- 12:00 - 17:00 work
- 14:00 - 16:00 high-energy

- [ ] Finish proposal #work
- [ ] Deep focus task #work #high-energy
- [ ] Quick admin
```

Then run:

- `Generate time blocks for active note`

## What A Manual Block Looks Like

Use a normal bullet line, not a task checkbox.

Examples:

```md
- 09:00 - 17:00 work
- 10:00 - 12:00 high-energy
- 18:00 - 20:00 personal low-energy
```

You can also use hashtags if you prefer:

```md
- 09:00 - 17:00 #work
- 10:00 - 12:00 #high-energy
```

## Important Rules

- block lines must be plain bullets like `- 09:00 - 17:00 work`
- block lines are not source tasks
- task tags are still read from hashtags in the task text, such as `#work`
- manual blocks can overlap
- your global day start and work day end still apply

## How Scheduling Works

Manual blocks are **preferred windows**, not hard walls for every task.

That means:

- tasks with matching tags are prioritized into matching blocks
- tasks with stronger matches are preferred first
- tasks without matching tags can still use other free time in the day
- untagged tasks can still be scheduled in leftover free time

## Overlapping Blocks

Overlapping blocks are supported.

Example:

```md
- 12:00 - 17:00 work
- 14:00 - 16:00 high-energy
```

This creates effective windows like:

- `12:00-14:00` work
- `14:00-16:00` work + high-energy
- `16:00-17:00` work

A task tagged `#work #high-energy` will prefer the overlap before falling back to a window that only matches one of those tags.

## Good Examples

### Work block

```md
- 09:00 - 12:00 work

- [ ] Write report #work
- [ ] Review docs #work
- [ ] Tidy kitchen
```

### Work and high-energy overlap

```md
- 12:00 - 17:00 work
- 14:00 - 16:00 high-energy

- [ ] Finish proposal #work
- [ ] Deep focus planning #work #high-energy
- [ ] Inbox cleanup
```

## Things To Watch For

- task tags should still be hashtags like `#work`
- if a block is inside the generated planner section, it will be ignored
- manually timed tasks still behave like explicit placements
- malformed time ranges are skipped

## Debugging

If a block does not seem to be working, open the plugin debug log and look for entries such as:

- accepted manual block lines
- skipped manual block lines
- derived manual block windows

## Current Scope

Today, manual time blocks are intentionally simple:

- active note only
- bullet-point syntax only
- overlapping blocks supported
- task matching uses task hashtags
- global day bounds and busy calendar ranges still apply

For implementation details and change history, see [`docs/running-log.md`](running-log.md).
