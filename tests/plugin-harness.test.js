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
    activeFilePath: "Daily/2026-04-06.md",
    files: {
      "Daily/2026-04-06.md": [
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
    normalizeMarkdown(harness.getFileContent("Daily/2026-04-06.md")),
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
