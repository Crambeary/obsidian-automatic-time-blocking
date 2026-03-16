import {
  App,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
} from "obsidian";

type TaskPriority = "highest" | "high" | "medium" | "none" | "low" | "lowest";

const TASK_PRIORITY_RANKS: Record<TaskPriority, number> = {
  highest: 6,
  high: 5,
  medium: 4,
  none: 3,
  low: 2,
  lowest: 1,
};

interface ObsidianAutomaticTimeBlockingSettings {
  plannerHeading: string;
  plannerHeadingLevel: number;
  dayStartTime: string;
  workDayEndTime: string;
  defaultDurationMinutes: number;
  startIntervalMinutes: number;
}
const DEFAULT_SETTINGS: ObsidianAutomaticTimeBlockingSettings = {
  plannerHeading: "Time Blocks",
  plannerHeadingLevel: 2,
  dayStartTime: "09:00",
  workDayEndTime: "17:00",
  defaultDurationMinutes: 30,
  startIntervalMinutes: 15,
};

interface LegacyObsidianAutomaticTimeBlockingSettings extends Partial<ObsidianAutomaticTimeBlockingSettings> {
  outputHeading?: string;
}

interface ParsedTask {
  text: string;
  durationMinutes: number;
  priority: TaskPriority;
  indent: number;
  subtasks: ParsedTask[];
}

interface GeneratedTimeBlocks {
  scheduledLines: string[];
  unscheduledLines: string[];
  scheduledTaskCount: number;
  skippedTaskCount: number;
}

export default class ObsidianAutomaticTimeBlocking extends Plugin {
  settings: ObsidianAutomaticTimeBlockingSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "generate-time-blocks-from-active-note",
      name: "Generate time blocks from active note",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) {
          return false;
        }

        if (!checking) {
          void this.generateTimeBlocksForActiveNote();
        }

        return true;
      },
    });

    this.addRibbonIcon("calendar-clock", "Generate time blocks", () => {
      void this.generateTimeBlocksForActiveNote();
    });

    this.addSettingTab(new AutomaticTimeBlockingSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    const loadedData =
      (await this.loadData()) as LegacyObsidianAutomaticTimeBlockingSettings | null;

    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData ?? {});

    if (!this.settings.plannerHeading && loadedData?.outputHeading) {
      this.settings.plannerHeading = loadedData.outputHeading;
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private async generateTimeBlocksForActiveNote() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      new Notice("Open a Markdown note to generate time blocks.");
      return;
    }

    const content = await this.app.vault.cachedRead(view.file);
    const tasks = this.extractOpenTasks(content);

    if (tasks.length === 0) {
      new Notice("No open or in-progress tasks found in the active note.");
      return;
    }

    const generatedTimeBlocks = this.buildTimeBlockLines(tasks);

    if (generatedTimeBlocks.scheduledLines.length === 0) {
      new Notice(
        "No time blocks fit inside the configured work day. Adjust your work day or task durations.",
      );
      return;
    }

    const sectionBody = this.buildPlannerSectionBody(generatedTimeBlocks);

    const updatedContent = this.upsertHeadingSection(
      content,
      this.settings.plannerHeading,
      this.settings.plannerHeadingLevel,
      sectionBody,
    );

    await this.app.vault.modify(view.file, updatedContent);

    const generatedCount = generatedTimeBlocks.scheduledTaskCount;
    const skippedCount = generatedTimeBlocks.skippedTaskCount;
    const skippedSuffix =
      skippedCount > 0
        ? ` Skipped ${skippedCount} task${skippedCount === 1 ? "" : "s"} that would exceed the configured work day.`
        : "";

    new Notice(
      `Generated ${generatedCount} time block${generatedCount === 1 ? "" : "s"}.${skippedSuffix}`,
    );
  }

  private extractOpenTasks(content: string): ParsedTask[] {
    const lines = content.split(/\r?\n/);
    const tasks: ParsedTask[] = [];
    const taskStack: ParsedTask[] = [];
    const plannerSectionRange = this.findHeadingSectionRange(
      lines,
      this.settings.plannerHeading,
      this.settings.plannerHeadingLevel,
    );

    for (const [index, line] of lines.entries()) {
      if (
        plannerSectionRange &&
        index >= plannerSectionRange.start &&
        index < plannerSectionRange.end
      ) {
        continue;
      }

      const taskMatch = line.match(/^\s*[-*]\s+\[( |\/|>)\]\s+(.*)$/);
      if (!taskMatch) {
        continue;
      }

      const indentMatch = line.match(/^(\s*)[-*]\s+\[( |\/|>)\]\s+/);
      const rawText = taskMatch[2].trim();
      const durationMinutes = this.parseDurationMinutes(rawText);
      const parsedTask: ParsedTask = {
        text: this.cleanTaskText(rawText),
        durationMinutes,
        priority: this.parseTaskPriority(rawText),
        indent: indentMatch?.[1].length ?? 0,
        subtasks: [],
      };

      while (
        taskStack.length > 0 &&
        taskStack[taskStack.length - 1].indent >= parsedTask.indent
      ) {
        taskStack.pop();
      }

      const parentTask = taskStack[taskStack.length - 1];
      if (parentTask) {
        parentTask.subtasks.push(parsedTask);
      } else {
        tasks.push(parsedTask);
      }

      taskStack.push(parsedTask);
    }

    return tasks.sort(
      (leftTask, rightTask) =>
        this.getTaskPriorityRank(rightTask.priority) -
        this.getTaskPriorityRank(leftTask.priority),
    );
  }

  private parseDurationMinutes(taskText: string): number {
    const markerMatch = taskText.match(/(?:\[(\d+)m\]|@(\d+)m)\b/i);
    const durationText = markerMatch?.[1] ?? markerMatch?.[2];
    const parsedDuration = durationText ? Number(durationText) : NaN;

    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      return this.settings.defaultDurationMinutes;
    }

    return parsedDuration;
  }

  private parseTaskPriority(taskText: string): TaskPriority {
    if (taskText.includes("🔺")) {
      return "highest";
    }

    if (taskText.includes("⏫")) {
      return "high";
    }

    if (taskText.includes("🔼")) {
      return "medium";
    }

    if (taskText.includes("🔽")) {
      return "low";
    }

    if (taskText.includes("⏬")) {
      return "lowest";
    }

    return "none";
  }

  private getTaskPriorityRank(priority: TaskPriority): number {
    return TASK_PRIORITY_RANKS[priority];
  }

  private cleanTaskText(taskText: string): string {
    return taskText
      .replace(/^\d{1,2}:\d{2}-\d{1,2}:\d{2}\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private buildTimeBlockLines(tasks: ParsedTask[]): GeneratedTimeBlocks {
    const scheduledLines: string[] = [];
    const unscheduledLines: string[] = [];
    let scheduledTaskCount = 0;
    let currentMinutes = this.getInitialStartMinutes();
    const workDayEndMinutes = this.getWorkDayEndMinutes();
    let skippedTaskCount = 0;

    for (const task of tasks) {
      currentMinutes = this.snapMinutesToInterval(currentMinutes);
      if (currentMinutes >= workDayEndMinutes) {
        skippedTaskCount += 1;
        unscheduledLines.push(...this.buildRenderedTaskLines(task));
        continue;
      }

      const start = this.formatMinutesAsTime(currentMinutes);
      const endMinutes = currentMinutes + task.durationMinutes;
      if (endMinutes > workDayEndMinutes) {
        skippedTaskCount += 1;
        unscheduledLines.push(...this.buildRenderedTaskLines(task));
        continue;
      }

      currentMinutes = endMinutes;
      const end = this.formatMinutesAsTime(endMinutes);
      scheduledTaskCount += 1;
      scheduledLines.push(
        ...this.buildRenderedTaskLines(task, `${start}-${end} `),
      );
    }

    return {
      scheduledLines,
      unscheduledLines,
      scheduledTaskCount,
      skippedTaskCount,
    };
  }

  private buildPlannerSectionBody(
    generatedTimeBlocks: GeneratedTimeBlocks,
  ): string {
    const lines = [...generatedTimeBlocks.scheduledLines];

    if (generatedTimeBlocks.unscheduledLines.length > 0) {
      lines.push("");
      lines.push(this.buildPlannerSubheadingLine("Not Time Blocked"));
      lines.push(...generatedTimeBlocks.unscheduledLines);
    }

    return lines.join("\n");
  }

  private buildPlannerSubheadingLine(title: string): string {
    const normalizedPlannerHeadingLevel = Math.min(
      Math.max(Math.floor(this.settings.plannerHeadingLevel), 1),
      6,
    );

    if (normalizedPlannerHeadingLevel >= 6) {
      return `**${title}**`;
    }

    return `${"#".repeat(normalizedPlannerHeadingLevel + 1)} ${title}`;
  }

  private buildRenderedTaskLines(
    task: ParsedTask,
    prefix = "",
    depth = 0,
  ): string[] {
    const indentation = "    ".repeat(depth);
    const renderedLines = [`${indentation}- [ ] ${prefix}${task.text}`];

    for (const subtask of task.subtasks) {
      renderedLines.push(
        ...this.buildRenderedTaskLines(subtask, "", depth + 1),
      );
    }

    return renderedLines;
  }

  private getInitialStartMinutes(): number {
    const configuredStartMinutes = this.parseTimeToMinutes(
      this.settings.dayStartTime,
    );
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const snappedCurrentMinutes = this.snapMinutesToInterval(currentMinutes);

    return Math.max(configuredStartMinutes, snappedCurrentMinutes);
  }

  private getWorkDayEndMinutes(): number {
    const configuredEndMinutes = this.parseTimeToMinutes(
      this.settings.workDayEndTime,
    );
    const configuredStartMinutes = this.parseTimeToMinutes(
      this.settings.dayStartTime,
    );

    return configuredEndMinutes >= configuredStartMinutes
      ? configuredEndMinutes
      : this.parseTimeToMinutes(DEFAULT_SETTINGS.workDayEndTime);
  }

  private snapMinutesToInterval(totalMinutes: number): number {
    const interval = this.getValidatedStartIntervalMinutes();
    return Math.ceil(totalMinutes / interval) * interval;
  }

  private getValidatedStartIntervalMinutes(): number {
    const interval = Math.floor(this.settings.startIntervalMinutes);

    if (!Number.isFinite(interval) || interval <= 0) {
      return DEFAULT_SETTINGS.startIntervalMinutes;
    }

    return interval;
  }

  private parseTimeToMinutes(value: string): number {
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      return this.parseTimeToMinutes(DEFAULT_SETTINGS.dayStartTime);
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return this.parseTimeToMinutes(DEFAULT_SETTINGS.dayStartTime);
    }

    return hours * 60 + minutes;
  }

  private formatMinutesAsTime(totalMinutes: number): string {
    const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
    const hours = Math.floor(normalizedMinutes / 60);
    const minutes = normalizedMinutes % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }

  private findHeadingSectionRange(
    lines: string[],
    heading: string,
    headingLevel: number,
  ): { start: number; end: number } | null {
    const normalizedLevel = Math.min(Math.max(Math.floor(headingLevel), 1), 6);
    const headingLine = `${"#".repeat(normalizedLevel)} ${heading}`;
    const headingIndex = lines.findIndex((line) => line.trim() === headingLine);

    if (headingIndex === -1) {
      return null;
    }

    let sectionEnd = lines.length;
    for (let index = headingIndex + 1; index < lines.length; index += 1) {
      const headingMatch = lines[index].match(/^(#{1,6})\s+/);
      if (!headingMatch) {
        continue;
      }

      const currentHeadingLevel = headingMatch[1].length;
      if (currentHeadingLevel <= normalizedLevel) {
        sectionEnd = index;
        break;
      }
    }

    return {
      start: headingIndex,
      end: sectionEnd,
    };
  }

  private upsertHeadingSection(
    content: string,
    heading: string,
    headingLevel: number,
    sectionBody: string,
  ): string {
    const trimmedContent = content.replace(/\s+$/, "");
    const lines =
      trimmedContent.length > 0 ? trimmedContent.split(/\r?\n/) : [];
    const sectionRange = this.findHeadingSectionRange(
      lines,
      heading,
      headingLevel,
    );

    if (!sectionRange) {
      const normalizedLevel = Math.min(
        Math.max(Math.floor(headingLevel), 1),
        6,
      );
      const headingLine = `${"#".repeat(normalizedLevel)} ${heading}`;
      const prefix = trimmedContent.length > 0 ? `${trimmedContent}\n\n` : "";
      return `${prefix}${headingLine}\n${sectionBody}\n`;
    }

    const updatedLines = [
      ...lines.slice(0, sectionRange.start + 1),
      sectionBody,
      ...lines.slice(sectionRange.end),
    ];

    return `${updatedLines.join("\n")}\n`;
  }
}

class AutomaticTimeBlockingSettingTab extends PluginSettingTab {
  plugin: ObsidianAutomaticTimeBlocking;

  constructor(app: App, plugin: ObsidianAutomaticTimeBlocking) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Automatic Time Blocking" });

    new Setting(containerEl)
      .setName("Planner heading level")
      .setDesc(
        "Matches the Day Planner style of heading selection. Choose which Markdown heading level should contain generated time blocks, from H1 (#) through H6 (######).",
      )
      .addSlider((slider) =>
        slider
          .setLimits(1, 6, 1)
          .setValue(this.plugin.settings.plannerHeadingLevel)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.plannerHeadingLevel = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Planner heading text")
      .setDesc(
        `Matches Day Planner's heading title setting. Generated time blocks will be written under ${"#".repeat(this.plugin.settings.plannerHeadingLevel)} ${this.plugin.settings.plannerHeading}. If that heading already exists in the active note, its section is replaced. Otherwise, the heading is appended to the end of the note.`,
      )
      .addText((text) =>
        text
          .setPlaceholder("Time Blocks")
          .setValue(this.plugin.settings.plannerHeading)
          .onChange(async (value) => {
            this.plugin.settings.plannerHeading =
              value.trim() || DEFAULT_SETTINGS.plannerHeading;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Day start time")
      .setDesc(
        "Time used for the first generated block in HH:MM 24-hour format. The plugin starts no earlier than this setting and no earlier than the current time.",
      )
      .addText((text) =>
        text
          .setPlaceholder("09:00")
          .setValue(this.plugin.settings.dayStartTime)
          .onChange(async (value) => {
            this.plugin.settings.dayStartTime =
              value.trim() || DEFAULT_SETTINGS.dayStartTime;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Work day end time")
      .setDesc(
        "Latest allowed end time for generated blocks in HH:MM 24-hour format. Tasks that would run past this time are skipped.",
      )
      .addText((text) =>
        text
          .setPlaceholder("17:00")
          .setValue(this.plugin.settings.workDayEndTime)
          .onChange(async (value) => {
            this.plugin.settings.workDayEndTime =
              value.trim() || DEFAULT_SETTINGS.workDayEndTime;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Default duration")
      .setDesc(
        "Minutes to use when a task does not include a duration marker like [30m] or @30m.",
      )
      .addText((text) =>
        text
          .setPlaceholder("30")
          .setValue(String(this.plugin.settings.defaultDurationMinutes))
          .onChange(async (value) => {
            const parsedValue = Number(value);
            this.plugin.settings.defaultDurationMinutes =
              Number.isFinite(parsedValue) && parsedValue > 0
                ? parsedValue
                : DEFAULT_SETTINGS.defaultDurationMinutes;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Start interval")
      .setDesc(
        "Minute boundary used when placing each generated block. For example, 15 means blocks start on :00, :15, :30, or :45.",
      )
      .addText((text) =>
        text
          .setPlaceholder("15")
          .setValue(String(this.plugin.settings.startIntervalMinutes))
          .onChange(async (value) => {
            const parsedValue = Number(value);
            this.plugin.settings.startIntervalMinutes =
              Number.isFinite(parsedValue) && parsedValue > 0
                ? parsedValue
                : DEFAULT_SETTINGS.startIntervalMinutes;
            await this.plugin.saveSettings();
          }),
      );
  }
}
