const test = require("node:test");
const assert = require("node:assert/strict");

const {
  installObsidianMock,
} = require("./helpers/obsidian-test-environment.js");
const { createPluginHarness } = require("./helpers/plugin-harness.js");

const obsidianMock = installObsidianMock();
const PluginClass = require("../.tmp-tests/src/main.js").default;

function normalizeMarkdown(value) {
  return value.trim().replace(/\r\n/g, "\n");
}

test.after(() => {
  obsidianMock.restore();
});

test("generate harness writes planner section for active-note tasks", async () => {
  const harness = await createPluginHarness({
    pluginClass: PluginClass,
    activeFilePath: "Daily/2026-04-05.md",
    files: {
      "Daily/2026-04-05.md": [
        "# Daily Plan",
        "",
        "- [ ] Write tests [30m]",
        "- [ ] Review docs [30m]",
      ].join("\n"),
    },
    settings: {
      dayStartTime: "09:00",
      workDayEndTime: "12:00",
      startIntervalMinutes: 30,
      plannerHeading: "Time Blocks",
      plannerHeadingLevel: 2,
      remoteCalendarUrls: [],
    },
  });

  await harness.runGenerate();

  assert.equal(
    normalizeMarkdown(harness.getFileContent("Daily/2026-04-05.md")),
    normalizeMarkdown(
      [
        "# Daily Plan",
        "",
        "- [ ] Write tests [30m]",
        "- [ ] Review docs [30m]",
        "",
        "## Time Blocks",
        "- [ ] 09:00-09:30 Write tests [30m]",
        "- [ ] 09:30-10:00 Review docs [30m]",
      ].join("\n"),
    ),
  );
  assert.match(harness.getNoticeMessages()[0], /Generated 2 time blocks/);
});

test("rerun harness rebuilds only the planner section deterministically", async () => {
  const harness = await createPluginHarness({
    pluginClass: PluginClass,
    activeFilePath: "Daily/2026-04-18.md",
    files: {
      "Daily/2026-04-18.md": [
        "# Daily Plan",
        "",
        "- [ ] Draft outline [30m]",
        "- [ ] Send summary [30m]",
        "",
        "## Time Blocks",
        "- [ ] 07:00-07:30 Old generated block",
        "",
        "## Notes",
        "Keep this section.",
      ].join("\n"),
    },
    settings: {
      dayStartTime: "09:00",
      workDayEndTime: "12:00",
      startIntervalMinutes: 30,
      plannerHeading: "Time Blocks",
      plannerHeadingLevel: 2,
      remoteCalendarUrls: [],
    },
  });

  await harness.runGenerate();

  assert.equal(
    normalizeMarkdown(harness.getFileContent("Daily/2026-04-18.md")),
    normalizeMarkdown(
      [
        "# Daily Plan",
        "",
        "- [ ] Draft outline [30m]",
        "- [ ] Send summary [30m]",
        "",
        "## Time Blocks",
        "- [ ] 09:00-09:30 Draft outline [30m]",
        "- [ ] 09:30-10:00 Send summary [30m]",
        "## Notes",
        "Keep this section.",
      ].join("\n"),
    ),
  );
});

test("cross-note completion sync updates source tasks from planner edits", async () => {
  const harness = await createPluginHarness({
    pluginClass: PluginClass,
    activeFilePath: "Daily/2026-04-07.md",
    files: {
      "Daily/2026-04-07.md": ["# Daily Plan", ""].join("\n"),
      "Projects/Source.md": "- [ ] Cross-note sync target [30m] 📅 2026-04-07",
    },
    settings: {
      dayStartTime: "09:00",
      workDayEndTime: "12:00",
      startIntervalMinutes: 30,
      plannerHeading: "Time Blocks",
      plannerHeadingLevel: 2,
      remoteCalendarUrls: [],
      externalTaskNotePaths: ["Projects/Source.md"],
    },
  });

  await harness.runGenerate();

  harness.setFileContent(
    "Daily/2026-04-07.md",
    harness
      .getFileContent("Daily/2026-04-07.md")
      .replace(
        "- [ ] 09:00-09:30 Cross-note sync target [30m] 📅 `2026-04-07` [[Projects/Source|↗]]",
        "- [x] 09:00-09:30 Cross-note sync target [30m] 📅 `2026-04-07` [[Projects/Source|↗]]",
      ),
  );

  await harness.runModify("Daily/2026-04-07.md");

  assert.match(
    harness.getFileContent("Projects/Source.md"),
    /^- \[x\] Cross-note sync target \[30m\] 📅 2026-04-07 ✅ \d{4}-\d{2}-\d{2}$/m,
  );
});

test("same-note completion sync updates source tasks from planner edits", async () => {
  const harness = await createPluginHarness({
    pluginClass: PluginClass,
    activeFilePath: "Daily/2026-04-08.md",
    files: {
      "Daily/2026-04-08.md": [
        "# Daily Plan",
        "",
        "- [ ] Same-note sync target [30m]",
      ].join("\n"),
    },
    settings: {
      dayStartTime: "09:00",
      workDayEndTime: "12:00",
      startIntervalMinutes: 30,
      plannerHeading: "Time Blocks",
      plannerHeadingLevel: 2,
      remoteCalendarUrls: [],
    },
  });

  await harness.runGenerate();

  harness.setFileContent(
    "Daily/2026-04-08.md",
    harness
      .getFileContent("Daily/2026-04-08.md")
      .replace(
        "- [ ] 09:00-09:30 Same-note sync target [30m]",
        "- [x] 09:00-09:30 Same-note sync target [30m]",
      ),
  );

  await harness.runModify("Daily/2026-04-08.md");

  assert.match(
    harness.getFileContent("Daily/2026-04-08.md"),
    /^- \[x\] Same-note sync target \[30m\] ✅ \d{4}-\d{2}-\d{2}$/m,
  );
  assert.match(
    harness.getFileContent("Daily/2026-04-08.md"),
    /## Time Blocks\n- \[x\] 09:00-09:30 Same-note sync target \[30m\]/m,
  );
});

test("focused mode keeps planner generation on the active daily note only", async () => {
  const harness = await createPluginHarness({
    pluginClass: PluginClass,
    activeFilePath: "Daily/2026-04-14.md",
    files: {
      "Daily/2026-04-14.md": [
        "# Daily Plan",
        "",
        "- [ ] Daily task [30m]",
      ].join("\n"),
      "Projects/Source.md": "- [ ] External task [30m] 📅 2026-04-14",
      "Projects/Board.md": [
        "## In Progress",
        "- [ ] Kanban task [30m]",
        "",
        "## Done",
      ].join("\n"),
    },
    settings: {
      dayStartTime: "09:00",
      workDayEndTime: "12:00",
      startIntervalMinutes: 30,
      plannerHeading: "Time Blocks",
      plannerHeadingLevel: 2,
      remoteCalendarUrls: [],
      focusedAtbMode: true,
      externalTaskDiscoveryMode: "dataview",
      externalTaskNotePaths: ["Projects/Source.md"],
      kanbanBoards: [
        {
          boardPath: "Projects/Board.md",
          activeColumnNames: ["in progress"],
          doneColumnName: "done",
          reopenColumnName: "in progress",
        },
      ],
    },
  });

  await harness.runGenerate();

  const dailyContent = harness.getFileContent("Daily/2026-04-14.md");
  assert.match(dailyContent, /09:00-09:30 Daily task \[30m\]/m);
  assert.doesNotMatch(dailyContent, /External task/);
  assert.doesNotMatch(dailyContent, /Kanban task/);
  assert.match(harness.getNoticeMessages()[0], /Generated 1 time block/);
  assert.doesNotMatch(harness.getNoticeMessages()[0], /Included tasks from/);
});

test("focused mode still respects task status selection", async () => {
  const harness = await createPluginHarness({
    pluginClass: PluginClass,
    activeFilePath: "Daily/2026-04-15.md",
    files: {
      "Daily/2026-04-15.md": [
        "# Daily Plan",
        "",
        "- [ ] Open task [30m]",
        "- [/] In progress task [30m]",
      ].join("\n"),
    },
    settings: {
      dayStartTime: "09:00",
      workDayEndTime: "12:00",
      startIntervalMinutes: 30,
      plannerHeading: "Time Blocks",
      plannerHeadingLevel: 2,
      remoteCalendarUrls: [],
      focusedAtbMode: true,
      includeOpenTasks: false,
      includeInProgressTasks: true,
      includeRescheduledTasks: false,
    },
  });

  await harness.runGenerate();

  const dailyContent = harness.getFileContent("Daily/2026-04-15.md");
  assert.match(dailyContent, /In progress task \[30m\]/);
  assert.doesNotMatch(dailyContent, /09:00-09:30 Open task \[30m\]/);
});

test("focused mode still respects include and exclude text filters", async () => {
  const harness = await createPluginHarness({
    pluginClass: PluginClass,
    activeFilePath: "Daily/2026-04-16.md",
    files: {
      "Daily/2026-04-16.md": [
        "# Daily Plan",
        "",
        "- [ ] Important work [30m] #focus",
        "- [ ] Ignore me [30m] #focus #skip",
        "- [ ] Casual task [30m]",
      ].join("\n"),
    },
    settings: {
      dayStartTime: "09:00",
      workDayEndTime: "12:00",
      startIntervalMinutes: 30,
      plannerHeading: "Time Blocks",
      plannerHeadingLevel: 2,
      remoteCalendarUrls: [],
      focusedAtbMode: true,
      includeTasksWithText: "#focus",
      excludeTasksWithText: "#skip",
    },
  });

  await harness.runGenerate();

  const dailyContent = harness.getFileContent("Daily/2026-04-16.md");
  assert.match(dailyContent, /Important work \[30m\] #focus/);
  assert.doesNotMatch(
    dailyContent,
    /09:30-10:00 Ignore me \[30m\] #focus #skip/,
  );
  assert.doesNotMatch(dailyContent, /09:30-10:00 Casual task \[30m\]/);
});

test("focused mode setting persists across save and reload", async () => {
  const firstHarness = await createPluginHarness({
    pluginClass: PluginClass,
    activeFilePath: "Daily/2026-04-17.md",
    files: {
      "Daily/2026-04-17.md": "# Daily Plan",
    },
    settings: {
      focusedAtbMode: true,
    },
  });

  await firstHarness.plugin.saveSettings();

  const secondHarness = await createPluginHarness({
    pluginClass: PluginClass,
    activeFilePath: "Daily/2026-04-17.md",
    files: {
      "Daily/2026-04-17.md": "# Daily Plan",
    },
    data: firstHarness.plugin.__data,
  });

  assert.equal(secondHarness.plugin.settings.focusedAtbMode, true);
});

test("generate harness writes planner section for configured Kanban board tasks", async () => {
  const harness = await createPluginHarness({
    pluginClass: PluginClass,
    activeFilePath: "Daily/2026-04-09.md",
    files: {
      "Daily/2026-04-09.md": ["# Daily Plan", ""].join("\n"),
      "Projects/Board.md": [
        "## Todo",
        "- [ ] Not planned",
        "",
        "## In Progress",
        "- [ ] Kanban active task [30m]",
        "",
        "## Done",
      ].join("\n"),
    },
    settings: {
      dayStartTime: "09:00",
      workDayEndTime: "12:00",
      startIntervalMinutes: 30,
      plannerHeading: "Time Blocks",
      plannerHeadingLevel: 2,
      remoteCalendarUrls: [],
      kanbanBoards: [
        {
          boardPath: "Projects/Board.md",
          activeColumnNames: ["in progress"],
          doneColumnName: "done",
          reopenColumnName: "in progress",
        },
      ],
    },
  });

  await harness.runGenerate();

  assert.match(
    harness.getFileContent("Daily/2026-04-09.md"),
    /- \[\/\] 09:00-09:30 Kanban active task \[30m\] \[\[Projects\/Board\|↗\]\] <!-- atb-sync:kanban::kanban active task \[30m\]::1 -->/m,
  );
  assert.doesNotMatch(
    harness.getFileContent("Daily/2026-04-09.md"),
    /Not planned/,
  );
});

test("kanban duplicate cards stay independently syncable through planner completion", async () => {
  const harness = await createPluginHarness({
    pluginClass: PluginClass,
    activeFilePath: "Daily/2026-04-10.md",
    files: {
      "Daily/2026-04-10.md": ["# Daily Plan", ""].join("\n"),
      "Projects/Board.md": [
        "## In Progress",
        "- [ ] Duplicate card [30m]",
        "",
        "## Review",
        "- [ ] Duplicate card [30m]",
        "",
        "## Done",
      ].join("\n"),
    },
    settings: {
      dayStartTime: "09:00",
      workDayEndTime: "12:00",
      startIntervalMinutes: 30,
      plannerHeading: "Time Blocks",
      plannerHeadingLevel: 2,
      remoteCalendarUrls: [],
      kanbanBoards: [
        {
          boardPath: "Projects/Board.md",
          activeColumnNames: ["in progress", "review"],
          doneColumnName: "done",
          reopenColumnName: "review",
        },
      ],
    },
  });

  await harness.runGenerate();

  harness.setFileContent(
    "Daily/2026-04-10.md",
    harness
      .getFileContent("Daily/2026-04-10.md")
      .replace("- [/] 09:00-09:30", "- [x] 09:00-09:30"),
  );

  await harness.runModify("Daily/2026-04-10.md");

  assert.match(
    harness.getFileContent("Projects/Board.md"),
    /## Done\n- \[x\] Duplicate card \[30m\]/m,
  );
  assert.match(
    harness.getFileContent("Projects/Board.md"),
    /## Review\n- \[ \] Duplicate card \[30m\]/m,
  );
});

test("kanban planner reopen returns card to remembered active column", async () => {
  const harness = await createPluginHarness({
    pluginClass: PluginClass,
    activeFilePath: "Daily/2026-04-11.md",
    files: {
      "Daily/2026-04-11.md": ["# Daily Plan", ""].join("\n"),
      "Projects/Board.md": [
        "## Review",
        "- [ ] Reopen me [30m]",
        "",
        "## Done",
      ].join("\n"),
    },
    settings: {
      dayStartTime: "09:00",
      workDayEndTime: "12:00",
      startIntervalMinutes: 30,
      plannerHeading: "Time Blocks",
      plannerHeadingLevel: 2,
      remoteCalendarUrls: [],
      kanbanBoards: [
        {
          boardPath: "Projects/Board.md",
          activeColumnNames: ["review"],
          doneColumnName: "done",
          reopenColumnName: "review",
        },
      ],
    },
  });

  await harness.runGenerate();

  harness.setFileContent(
    "Daily/2026-04-11.md",
    harness
      .getFileContent("Daily/2026-04-11.md")
      .replace("- [/] 09:00-09:30", "- [x] 09:00-09:30"),
  );

  await harness.runModify("Daily/2026-04-11.md");

  await harness.runModify("Daily/2026-04-11.md");

  harness.setFileContent(
    "Daily/2026-04-11.md",
    harness
      .getFileContent("Daily/2026-04-11.md")
      .replace("- [x] 09:00-09:30", "- [/] 09:00-09:30"),
  );

  await harness.runModify("Daily/2026-04-11.md");

  assert.match(
    harness.getFileContent("Projects/Board.md"),
    /## Review\n- \[ \] Reopen me \[30m\]/m,
  );
  assert.doesNotMatch(
    harness.getFileContent("Projects/Board.md"),
    /## Done\n- \[x\] Reopen me \[30m\]/m,
  );
});

test("kanban planner reopen falls back to the first available active column", async () => {
  const harness = await createPluginHarness({
    pluginClass: PluginClass,
    activeFilePath: "Daily/2026-04-12.md",
    files: {
      "Daily/2026-04-12.md": [
        "# Daily Plan",
        "",
        "## Time Blocks",
        "- [x] 09:00-09:30 Fallback me [30m] [[Projects/Board|↗]] <!-- atb-sync:kanban::fallback me [30m]::1 --> ✅ 2026-04-02",
      ].join("\n"),
      "Projects/Board.md": [
        "## Doing",
        "",
        "## Done",
        "- [x] Fallback me [30m]",
      ].join("\n"),
    },
    settings: {
      dayStartTime: "09:00",
      workDayEndTime: "12:00",
      startIntervalMinutes: 30,
      plannerHeading: "Time Blocks",
      plannerHeadingLevel: 2,
      remoteCalendarUrls: [],
      kanbanBoards: [
        {
          boardPath: "Projects/Board.md",
          activeColumnNames: ["doing"],
          doneColumnName: "done",
          reopenColumnName: "current",
        },
      ],
    },
    data: {
      completionSyncMappings: {
        "Daily/2026-04-12.md": [
          {
            plannerFingerprint: "atb-sync:kanban::fallback me [30m]::1",
            sourcePath: "Projects/Board.md",
            sourceFingerprint: "kanban::fallback me [30m]::1",
            sourceType: "kanban-card",
            kanbanLastActiveColumnName: "review",
          },
        ],
      },
    },
  });

  harness.setFileContent(
    "Daily/2026-04-12.md",
    harness
      .getFileContent("Daily/2026-04-12.md")
      .replace("- [x] 09:00-09:30", "- [/] 09:00-09:30"),
  );

  await harness.runModify("Daily/2026-04-12.md");

  assert.match(
    harness.getFileContent("Projects/Board.md"),
    /## Doing\n- \[ \] Fallback me \[30m\]/m,
  );
  assert.doesNotMatch(
    harness.getFileContent("Projects/Board.md"),
    /## Done\n- \[x\] Fallback me \[30m\]/m,
  );
});

test("kanban planner reopen is skipped when no valid destination exists", async () => {
  const harness = await createPluginHarness({
    pluginClass: PluginClass,
    activeFilePath: "Daily/2026-04-13.md",
    files: {
      "Daily/2026-04-13.md": [
        "# Daily Plan",
        "",
        "## Time Blocks",
        "- [x] 09:00-09:30 Stay done [30m] [[Projects/Board|↗]] <!-- atb-sync:kanban::stay done [30m]::1 --> ✅ 2026-04-02",
      ].join("\n"),
      "Projects/Board.md": ["## Done", "- [x] Stay done [30m]"].join("\n"),
    },
    settings: {
      dayStartTime: "09:00",
      workDayEndTime: "12:00",
      startIntervalMinutes: 30,
      plannerHeading: "Time Blocks",
      plannerHeadingLevel: 2,
      remoteCalendarUrls: [],
      kanbanBoards: [
        {
          boardPath: "Projects/Board.md",
          activeColumnNames: ["doing"],
          doneColumnName: "done",
          reopenColumnName: "current",
        },
      ],
    },
    data: {
      completionSyncMappings: {
        "Daily/2026-04-13.md": [
          {
            plannerFingerprint: "atb-sync:kanban::stay done [30m]::1",
            sourcePath: "Projects/Board.md",
            sourceFingerprint: "kanban::stay done [30m]::1",
            sourceType: "kanban-card",
            kanbanLastActiveColumnName: "review",
          },
        ],
      },
    },
  });

  harness.setFileContent(
    "Daily/2026-04-13.md",
    harness
      .getFileContent("Daily/2026-04-13.md")
      .replace("- [x] 09:00-09:30", "- [/] 09:00-09:30"),
  );

  await harness.runModify("Daily/2026-04-13.md");

  assert.match(
    harness.getFileContent("Projects/Board.md"),
    /^## Done\n- \[x\] Stay done \[30m\]$/m,
  );
});
